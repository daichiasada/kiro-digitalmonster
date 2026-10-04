#!/usr/bin/env node
/**
 * CDK app entry point for the digital monster stack.
 *
 * The stack is deployed into the account/region resolved from the standard
 * CDK environment variables (CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION), which
 * the CLI populates from the active AWS credentials. This keeps the app
 * env-agnostic: `cdk deploy` targets whatever account/region the deployer is
 * authenticated against.
 */
import * as cdk from 'aws-cdk-lib';
import { DigitalMonsterStack } from '../lib/digital-monster-stack';

const app = new cdk.App();

new DigitalMonsterStack(app, 'DigitalMonsterStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description:
    'Digital monster full stack: DynamoDB, API Gateway + Lambda, S3 + CloudFront, and stage-gated Bedrock IAM.',
});

app.synth();
