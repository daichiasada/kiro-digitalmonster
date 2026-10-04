import type { BedrockModelKey, GrowthStage } from "./types.ts";
import { getStage } from "./stages.ts";

/** The model tiers that can actually be invoked (excludes "none"). */
export type InvokableModelKey = Exclude<BedrockModelKey, "none">;

/**
 * Default Amazon Bedrock model IDs per tier.
 *
 * These are Anthropic Claude model IDs. Exact IDs and availability vary by
 * region and account, so they are overridable via environment variables
 * (see {@link resolveModelId}). The README documents how to override them.
 */
export const BEDROCK_MODEL_IDS: Record<InvokableModelKey, string> = {
  haiku: "anthropic.claude-3-5-haiku-20241022-v1:0",
  sonnet: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  opus: "anthropic.claude-3-opus-20240229-v1:0",
};

/** Environment variable names used to override each tier's model ID. */
export const BEDROCK_MODEL_ENV_VARS: Record<InvokableModelKey, string> = {
  haiku: "BEDROCK_MODEL_HAIKU",
  sonnet: "BEDROCK_MODEL_SONNET",
  opus: "BEDROCK_MODEL_OPUS",
};

/** A map of overrides, typically derived from process.env. */
export type ModelOverrides = Partial<Record<InvokableModelKey, string | undefined>>;

/**
 * Resolve the concrete Bedrock model ID for a tier.
 *
 * Resolution order:
 *   1. an explicit override passed in `overrides`
 *   2. the matching environment variable (if `overrides` not given)
 *   3. the built-in default from {@link BEDROCK_MODEL_IDS}
 *
 * Throws if asked to resolve the "none" tier (a stage that cannot chat).
 */
export function resolveModelId(
  key: BedrockModelKey,
  overrides?: ModelOverrides,
): string {
  if (key === "none") {
    throw new Error("Cannot resolve a Bedrock model ID for the 'none' tier (this stage cannot chat).");
  }

  const override = overrides?.[key];
  if (override !== undefined && override !== "") {
    return override;
  }

  if (overrides === undefined) {
    const envValue = readEnv(BEDROCK_MODEL_ENV_VARS[key]);
    if (envValue !== undefined && envValue !== "") {
      return envValue;
    }
  }

  return BEDROCK_MODEL_IDS[key];
}

/** Read an env var in a way that is safe outside Node (e.g. in a bundle). */
function readEnv(name: string): string | undefined {
  const globalProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return globalProcess?.env?.[name];
}

/** Map a growth stage to its Bedrock model tier. */
export function modelKeyForStage(stageId: GrowthStage): BedrockModelKey {
  return getStage(stageId).bedrockModelKey;
}

/**
 * Resolve the Bedrock model ID for a given stage, or null if the stage
 * cannot chat (the baby stage).
 */
export function resolveModelIdForStage(
  stageId: GrowthStage,
  overrides?: ModelOverrides,
): string | null {
  const key = modelKeyForStage(stageId);
  if (key === "none") {
    return null;
  }
  return resolveModelId(key, overrides);
}
