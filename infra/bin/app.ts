#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DigitalMonsterStack } from "../lib/digital-monster-stack";

const app = new cdk.App();

/**
 * The CORS allowed origin for the API. Defaults to "*" (any origin) so the
 * deployed CloudFront site works out of the box. Override with:
 *   cdk deploy -c allowedOrigin=https://d123.cloudfront.net
 */
const allowedOrigin =
  (app.node.tryGetContext("allowedOrigin") as string | undefined) ??
  process.env.ALLOWED_ORIGIN ??
  "*";

/**
 * Optional Bedrock model-id overrides. These are passed through to the chat
 * Lambda as environment variables. If unset, the defaults from @ddm/shared
 * (BEDROCK_MODEL_IDS) are used at runtime.
 */
const bedrockModelHaiku =
  (app.node.tryGetContext("bedrockModelHaiku") as string | undefined) ??
  process.env.BEDROCK_MODEL_HAIKU;
const bedrockModelSonnet =
  (app.node.tryGetContext("bedrockModelSonnet") as string | undefined) ??
  process.env.BEDROCK_MODEL_SONNET;
const bedrockModelOpus =
  (app.node.tryGetContext("bedrockModelOpus") as string | undefined) ??
  process.env.BEDROCK_MODEL_OPUS;

new DigitalMonsterStack(app, "DigitalMonsterStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  allowedOrigin,
  bedrockModelHaiku,
  bedrockModelSonnet,
  bedrockModelOpus,
  description:
    "AI Monster (Digimon-style raising game): DynamoDB + Lambda + HTTP API + Bedrock + S3/CloudFront.",
});

app.synth();
