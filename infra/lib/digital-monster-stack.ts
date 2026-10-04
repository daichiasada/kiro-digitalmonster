/**
 * The single CDK stack provisioning the entire digital monster application.
 *
 * Resources:
 *   - DynamoDB table (partition key `clientId`, PAY_PER_REQUEST).
 *   - Four NodejsFunction Lambdas bound to the backend handlers
 *     (getMonster / saveMonster / train / chat).
 *   - A least-privilege IAM policy granting bedrock:InvokeModel to ONLY the
 *     chat Lambda, scoped to the three Anthropic model ARNs (Haiku / Sonnet /
 *     Opus) sourced from @digital-monster/shared.
 *   - A REST API Gateway with CORS: GET /monster, POST /monster, POST /train,
 *     POST /chat.
 *   - A private S3 bucket (OAC) + CloudFront distribution serving frontend/dist
 *     via BucketDeployment, with SPA fallback to index.html.
 *   - CfnOutputs SiteUrl and ApiBaseUrl.
 */
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import {
  NodejsFunction,
  OutputFormat,
  type NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { BEDROCK_MODEL_IDS } from '@digital-monster/shared';

/** Absolute path to this file's directory (CommonJS-friendly). */
const HERE = __dirname;

/** Monorepo root: infra/lib -> infra -> repo root. */
const REPO_ROOT = path.resolve(HERE, '..', '..');

/** Backend handler sources (NodejsFunction entry points). */
const HANDLERS_DIR = path.join(REPO_ROOT, 'backend', 'src', 'handlers');

/** Built frontend assets served by CloudFront. */
const FRONTEND_DIST = path.join(REPO_ROOT, 'frontend', 'dist');

export class DigitalMonsterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- DynamoDB -----------------------------------------------------------
    // One monster per browser: partition key `clientId`, no sort key, no auth.
    // On-demand billing and DESTROY removal keep this a cheap, disposable demo.
    const table = new dynamodb.Table(this, 'MonstersTable', {
      partitionKey: {
        name: 'clientId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Lambda functions ---------------------------------------------------
    // Shared bundling + runtime config for every NodejsFunction. The backend is
    // ESM (NodeNext); esbuild emits an ESM bundle for the Node 20 runtime.
    const commonLambdaProps: Omit<NodejsFunctionProps, 'entry'> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: {
        format: OutputFormat.ESM,
        target: 'node20',
        // The AWS SDK v3 is provided by the Lambda runtime; keep it external.
        externalModules: ['@aws-sdk/*'],
      },
    };

    const getMonsterFn = new NodejsFunction(this, 'GetMonsterFunction', {
      ...commonLambdaProps,
      entry: path.join(HANDLERS_DIR, 'getMonster.ts'),
    });

    const saveMonsterFn = new NodejsFunction(this, 'SaveMonsterFunction', {
      ...commonLambdaProps,
      entry: path.join(HANDLERS_DIR, 'saveMonster.ts'),
    });

    const trainFn = new NodejsFunction(this, 'TrainFunction', {
      ...commonLambdaProps,
      entry: path.join(HANDLERS_DIR, 'train.ts'),
    });

    const chatFn = new NodejsFunction(this, 'ChatFunction', {
      ...commonLambdaProps,
      entry: path.join(HANDLERS_DIR, 'chat.ts'),
    });

    // --- DynamoDB permissions ----------------------------------------------
    // getMonster only reads. save/train/chat read AND write (chat may create a
    // monster on first contact and persist updates).
    table.grantReadData(getMonsterFn);
    table.grantReadWriteData(saveMonsterFn);
    table.grantReadWriteData(trainFn);
    table.grantReadWriteData(chatFn);

    // --- Bedrock permission (chat Lambda only) ------------------------------
    // Least privilege: ONLY the chat Lambda may invoke Bedrock, and only the
    // three Anthropic models used by the growth stages. BABY (幼年期) never
    // calls Bedrock, so no permission is needed for it. Model ids come from the
    // shared package so infra and runtime cannot drift apart.
    const bedrockModelArns = [
      BEDROCK_MODEL_IDS.HAIKU,
      BEDROCK_MODEL_IDS.SONNET,
      BEDROCK_MODEL_IDS.OPUS,
    ].map((modelId) =>
      cdk.Arn.format(
        {
          service: 'bedrock',
          region: this.region,
          account: '',
          resource: 'foundation-model',
          resourceName: modelId,
          arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
        },
        this,
      ),
    );

    chatFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvokeStageBedrockModels',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: bedrockModelArns,
      }),
    );

    // --- API Gateway (REST) -------------------------------------------------
    // CORS is wide open ('*') for the demo; a real deployment would restrict
    // allowOrigins to the CloudFront domain.
    const api = new apigateway.RestApi(this, 'MonsterApi', {
      restApiName: 'digital-monster-api',
      description: 'API for the digital monster app (load/save/train/chat).',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });

    // GET /monster  + POST /monster (save)
    const monster = api.root.addResource('monster');
    monster.addMethod('GET', new apigateway.LambdaIntegration(getMonsterFn));
    monster.addMethod('POST', new apigateway.LambdaIntegration(saveMonsterFn));

    // POST /train
    const train = api.root.addResource('train');
    train.addMethod('POST', new apigateway.LambdaIntegration(trainFn));

    // POST /chat
    const chat = api.root.addResource('chat');
    chat.addMethod('POST', new apigateway.LambdaIntegration(chatFn));

    // --- Frontend hosting: S3 (private, OAC) + CloudFront -------------------
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      comment: 'Digital monster SPA distribution',
      defaultBehavior: {
        // S3BucketOrigin.withOriginAccessControl provisions an OAC and the
        // matching bucket policy so the bucket stays fully private.
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      // SPA fallback: client-side routing + hard refreshes resolve to index.html.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(FRONTEND_DIST)],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // --- Outputs ------------------------------------------------------------
    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront URL serving the frontend SPA.',
    });

    new cdk.CfnOutput(this, 'ApiBaseUrl', {
      value: api.url,
      description:
        'API Gateway base URL. Set VITE_API_BASE_URL to this, rebuild the frontend, and redeploy.',
    });
  }
}
