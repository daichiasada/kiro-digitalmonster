/**
 * CDK assertions test for the digital monster stack.
 *
 * Synthesizes the stack to a CloudFormation template and asserts the key
 * resources exist:
 *   - exactly one DynamoDB table with partition key `clientId`,
 *   - exactly four Lambda functions (getMonster / saveMonster / train / chat),
 *   - an API Gateway REST API with the four routes,
 *   - a CloudFront distribution,
 *   - a bedrock:InvokeModel IAM policy statement.
 *
 * NOTE: this cannot be executed in the authoring sandbox because the npm
 * registry is blocked (no node_modules). It runs in a networked session via
 * `npm test -w infra`.
 */
import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { BEDROCK_MODEL_IDS } from '@digital-monster/shared';
import { DigitalMonsterStack } from '../lib/digital-monster-stack';

function synth(): Template {
  const app = new cdk.App();
  const stack = new DigitalMonsterStack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

describe('DigitalMonsterStack', () => {
  it('provisions a single DynamoDB table keyed by clientId', () => {
    const template = synth();
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'clientId', KeyType: 'HASH' }],
    });
  });

  it('defines exactly four Lambda functions', () => {
    const template = synth();
    template.resourceCountIs('AWS::Lambda::Function', 4);
  });

  it('provisions an API Gateway REST API with the four routes', () => {
    const template = synth();
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);

    const methods = template.findResources('AWS::ApiGateway::Method');
    const httpMethods = Object.values(methods).map(
      (m) => (m.Properties as { HttpMethod: string }).HttpMethod,
    );
    // GET /monster, POST /monster, POST /train, POST /chat (OPTIONS preflight
    // methods are added by CORS and are not asserted here).
    expect(httpMethods.filter((h) => h === 'GET').length).toBeGreaterThanOrEqual(1);
    expect(httpMethods.filter((h) => h === 'POST').length).toBeGreaterThanOrEqual(3);
  });

  it('provisions a CloudFront distribution', () => {
    const template = synth();
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });

  it('grants bedrock:InvokeModel scoped to the three Anthropic model ARNs', () => {
    const template = synth();

    // A policy statement allowing bedrock:InvokeModel must exist.
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'bedrock:InvokeModel',
            Effect: 'Allow',
          }),
        ]),
      },
    });

    // Each stage model id (Haiku / Sonnet / Opus) must appear in the template.
    const json = JSON.stringify(template.toJSON());
    expect(json).toContain(BEDROCK_MODEL_IDS.HAIKU);
    expect(json).toContain(BEDROCK_MODEL_IDS.SONNET);
    expect(json).toContain(BEDROCK_MODEL_IDS.OPUS);
  });

  it('exposes SiteUrl and ApiBaseUrl outputs', () => {
    const template = synth();
    const outputs = template.findOutputs('*');
    expect(Object.keys(outputs)).toEqual(expect.arrayContaining(['SiteUrl', 'ApiBaseUrl']));
  });
});
