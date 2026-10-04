import * as path from "node:path";
import {
  Aws,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

/**
 * Props for {@link DigitalMonsterStack}.
 */
export interface DigitalMonsterStackProps extends StackProps {
  /** CORS allowed origin for the HTTP API (default "*"). */
  readonly allowedOrigin?: string;
  /** Optional Bedrock model-id override for the "haiku" tier (成長期). */
  readonly bedrockModelHaiku?: string;
  /** Optional Bedrock model-id override for the "sonnet" tier (成熟期). */
  readonly bedrockModelSonnet?: string;
  /** Optional Bedrock model-id override for the "opus" tier (完全体). */
  readonly bedrockModelOpus?: string;
}

/**
 * Default Anthropic Claude model IDs, kept in sync with
 * packages/shared/src/bedrock-models.ts (BEDROCK_MODEL_IDS). These are
 * cross-region inference-profile IDs (the "us." prefix); current-generation
 * Claude models must be invoked via an inference profile rather than the bare
 * foundation-model ID. They are used to build the Bedrock InvokeModel IAM
 * resource ARNs so the chat Lambda can only invoke the specific models it
 * needs (both the inference-profile ARNs and the underlying foundation-model
 * ARNs the profile fans out to).
 */
const DEFAULT_BEDROCK_MODEL_IDS = {
  haiku: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  sonnet: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  opus: "us.anthropic.claude-opus-4-5-20251101-v1:0",
} as const;

// Monorepo roots relative to this file (infra/lib/digital-monster-stack.ts).
const REPO_ROOT = path.join(__dirname, "..", "..");
const BACKEND_HANDLERS = path.join(
  REPO_ROOT,
  "packages",
  "backend",
  "src",
  "handlers",
);
const FRONTEND_DIST = path.join(REPO_ROOT, "packages", "frontend", "dist");

/**
 * The complete Digital Monster infrastructure:
 *   - DynamoDB table for monster save data
 *   - Four Lambda functions (getMonster / saveMonster / chat / battle)
 *   - HTTP API (API Gateway v2) with CORS wiring the Lambdas to routes
 *   - Bedrock InvokeModel IAM permission for the chat Lambda
 *   - S3 bucket + CloudFront distribution hosting the built frontend
 *   - A runtime config.json written into the bucket pointing at the API, so a
 *     single `cdk deploy` fully wires the frontend to the backend.
 */
export class DigitalMonsterStack extends Stack {
  constructor(scope: Construct, id: string, props: DigitalMonsterStackProps = {}) {
    super(scope, id, props);

    const allowedOrigin = props.allowedOrigin ?? "*";
    const region = Stack.of(this).region;

    // ---------------------------------------------------------------------
    // (a) DynamoDB table: monster save data, partition key `id` (string).
    // ---------------------------------------------------------------------
    const table = new dynamodb.Table(this, "MonstersTable", {
      tableName: `${id}-Monsters`,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Dev-friendly: delete the table (and its data) when the stack is torn
      // down. Change to RETAIN for anything you care about keeping.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------------
    // (b) Lambda functions. Each entry points at the backend handler source;
    //     NodejsFunction bundles it (and the @ddm/shared workspace import)
    //     with esbuild. @aws-sdk/* is provided by the Lambda runtime, so we
    //     mark it external to keep bundles small.
    // ---------------------------------------------------------------------
    const commonEnvironment: Record<string, string> = {
      TABLE_NAME: table.tableName,
      ALLOWED_ORIGIN: allowedOrigin,
    };

    const bundling = {
      // @aws-sdk/* ships in the Node 20 Lambda runtime; do not bundle it.
      externalModules: ["@aws-sdk/*"],
      minify: true,
      sourceMap: true,
      target: "node20",
    } satisfies import("aws-cdk-lib/aws-lambda-nodejs").BundlingOptions;

    const makeFunction = (
      construct: string,
      handlerFile: string,
      extra?: {
        environment?: Record<string, string>;
        timeout?: Duration;
        memorySize?: number;
      },
    ): NodejsFunction =>
      new NodejsFunction(this, construct, {
        entry: path.join(BACKEND_HANDLERS, handlerFile),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: extra?.memorySize ?? 256,
        timeout: extra?.timeout ?? Duration.seconds(10),
        environment: { ...commonEnvironment, ...(extra?.environment ?? {}) },
        bundling,
      });

    const getMonsterFn = makeFunction("GetMonsterFn", "getMonster.ts");
    const saveMonsterFn = makeFunction("SaveMonsterFn", "saveMonster.ts");
    const battleFn = makeFunction("BattleFn", "battle.ts");

    // The chat Lambda talks to Bedrock, which can be slower, so give it more
    // time and pass through any configured model-id overrides.
    const chatEnvironment: Record<string, string> = {};
    if (props.bedrockModelHaiku) {
      chatEnvironment.BEDROCK_MODEL_HAIKU = props.bedrockModelHaiku;
    }
    if (props.bedrockModelSonnet) {
      chatEnvironment.BEDROCK_MODEL_SONNET = props.bedrockModelSonnet;
    }
    if (props.bedrockModelOpus) {
      chatEnvironment.BEDROCK_MODEL_OPUS = props.bedrockModelOpus;
    }
    const chatFn = makeFunction("ChatFn", "chat.ts", {
      environment: chatEnvironment,
      timeout: Duration.seconds(30),
      memorySize: 512,
    });

    // ---------------------------------------------------------------------
    // (c) IAM: DynamoDB access per handler + Bedrock for chat only.
    // ---------------------------------------------------------------------
    // getMonster persists after applying time passage / evolution, so it needs
    // write access as well as read.
    table.grantReadWriteData(getMonsterFn);
    table.grantWriteData(saveMonsterFn);
    table.grantReadWriteData(battleFn);
    // chat only reads the monster to build its personality prompt.
    table.grantReadData(chatFn);

    // Resolve the three Claude model IDs (using overrides when set) and allow
    // the chat Lambda to invoke exactly those. These are cross-region
    // inference-profile IDs (the "us." prefix), so invoking them requires
    // bedrock:InvokeModel on BOTH:
    //   (1) the inference-profile ARN in this account/region, and
    //   (2) the underlying foundation-model ARNs the profile fans out to.
    // Because the "us." system profiles route across multiple US regions, the
    // foundation-model resource is granted with a wildcard region and the bare
    // model id (the profile id with the leading "us." stripped).
    const modelIds = [
      props.bedrockModelHaiku ?? DEFAULT_BEDROCK_MODEL_IDS.haiku,
      props.bedrockModelSonnet ?? DEFAULT_BEDROCK_MODEL_IDS.sonnet,
      props.bedrockModelOpus ?? DEFAULT_BEDROCK_MODEL_IDS.opus,
    ];
    const inferenceProfileArns = modelIds.map(
      (modelId) =>
        `arn:${Aws.PARTITION}:bedrock:${region}:${Aws.ACCOUNT_ID}:inference-profile/${modelId}`,
    );
    const foundationModelArns = modelIds.map((modelId) => {
      // Strip the leading "us." (cross-region profile prefix) to get the bare
      // foundation-model id the profile routes to.
      const bareModelId = modelId.replace(/^us\./, "");
      return `arn:${Aws.PARTITION}:bedrock:*::foundation-model/${bareModelId}`;
    });
    chatFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [...inferenceProfileArns, ...foundationModelArns],
      }),
    );

    // ---------------------------------------------------------------------
    // (d) HTTP API (API Gateway v2) with CORS.
    //
    // CORS is configured in TWO places: here at the API Gateway layer
    // (corsPreflight) AND in each handler's response headers (lib/http.ts).
    // To keep the two from diverging, both are driven by the same
    // `allowedOrigin`: the handlers read it from the ALLOWED_ORIGIN env var
    // (set in commonEnvironment above) and the API uses it here.
    // ---------------------------------------------------------------------
    const httpApi = new HttpApi(this, "HttpApi", {
      apiName: `${id}-Api`,
      corsPreflight: {
        allowOrigins: [allowedOrigin],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["*"],
      },
    });

    httpApi.addRoutes({
      path: "/monster/{monsterId}",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("GetMonsterIntegration", getMonsterFn),
    });
    httpApi.addRoutes({
      path: "/monster",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("SaveMonsterIntegration", saveMonsterFn),
    });
    httpApi.addRoutes({
      path: "/chat",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("ChatIntegration", chatFn),
    });
    httpApi.addRoutes({
      path: "/battle",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("BattleIntegration", battleFn),
    });

    const apiEndpoint = httpApi.apiEndpoint;

    // ---------------------------------------------------------------------
    // (e) S3 bucket (private) + CloudFront distribution with OAC.
    // ---------------------------------------------------------------------
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Dev-friendly teardown.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "SiteDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        // Origin Access Control (OAC) keeps the bucket private; CloudFront is
        // the only reader.
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // SPA fallback: serve index.html for client-side routes / missing keys.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(0),
        },
      ],
    });

    // ---------------------------------------------------------------------
    // (f) Deploy the built frontend + a runtime config.json pointing at the
    //     freshly-created API. A single deploy fully wires front -> back.
    //
    //     NOTE: packages/frontend/dist must exist at synth time. Run
    //     `npm run build` before deploying (see README).
    // ---------------------------------------------------------------------
    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [
        s3deploy.Source.asset(FRONTEND_DIST),
        s3deploy.Source.jsonData("config.json", { apiBaseUrl: apiEndpoint }),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // ---------------------------------------------------------------------
    // (g) Outputs.
    // ---------------------------------------------------------------------
    new CfnOutput(this, "ApiUrl", {
      value: apiEndpoint,
      description: "Base URL of the HTTP API (also written to config.json).",
    });
    new CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "Open this URL in a browser to play the game.",
    });
    new CfnOutput(this, "BucketName", {
      value: siteBucket.bucketName,
      description: "S3 bucket hosting the static frontend.",
    });
    new CfnOutput(this, "TableName", {
      value: table.tableName,
      description: "DynamoDB table storing monster save data.",
    });
  }
}
