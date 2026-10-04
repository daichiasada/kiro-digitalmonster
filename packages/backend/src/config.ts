import type { ModelOverrides } from "@ddm/shared";

/**
 * Lightweight environment configuration for the Lambda handlers.
 *
 * All values are read from `process.env` so the same code works locally and
 * in Lambda. The CDK stack (infra) is responsible for wiring these variables
 * onto each function.
 */

/** Read an environment variable, returning undefined when unset or empty. */
function env(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return undefined;
  }
  return value;
}

/** Read an environment variable or throw if it is missing. */
function requireEnv(name: string): string {
  const value = env(name);
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** The DynamoDB table that stores monster save data. */
export function tableName(): string {
  return requireEnv("TABLE_NAME");
}

/**
 * The origin allowed by CORS. Defaults to "*" so the game works from any
 * CloudFront distribution; set ALLOWED_ORIGIN to lock it down.
 */
export function allowedOrigin(): string {
  return env("ALLOWED_ORIGIN") ?? "*";
}

/**
 * The AWS region. Lambda sets AWS_REGION automatically; falls back to a sane
 * default where Bedrock Claude models are commonly available.
 */
export function awsRegion(): string {
  return env("AWS_REGION") ?? env("AWS_DEFAULT_REGION") ?? "us-east-1";
}

/**
 * Bedrock model-id overrides pulled from the environment. Any tier left unset
 * falls back to the built-in default in @ddm/shared.
 */
export function bedrockOverrides(): ModelOverrides {
  return {
    haiku: env("BEDROCK_MODEL_HAIKU"),
    sonnet: env("BEDROCK_MODEL_SONNET"),
    opus: env("BEDROCK_MODEL_OPUS"),
  };
}
