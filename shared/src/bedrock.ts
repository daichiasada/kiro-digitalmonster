/**
 * Mapping from growth stage to the Amazon Bedrock model used for conversation.
 *
 * The BABY (幼年期) stage intentionally has NO model: a baby monster cannot
 * converse, so the chat path short-circuits before any Bedrock call.
 */
import { Stage } from './types.js';

/** Official Bedrock (Anthropic Claude) model identifiers. */
export const BEDROCK_MODEL_IDS = {
  HAIKU: 'anthropic.claude-3-haiku-20240307-v1:0',
  SONNET: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  OPUS: 'anthropic.claude-3-opus-20240229-v1:0',
} as const;

/**
 * Stage -> Bedrock model id. `null` means the stage has no conversation
 * capability (BABY).
 */
export const BEDROCK_MODEL_BY_STAGE: Readonly<Record<Stage, string | null>> = {
  [Stage.BABY]: null,
  [Stage.ROOKIE]: BEDROCK_MODEL_IDS.HAIKU,
  [Stage.CHAMPION]: BEDROCK_MODEL_IDS.SONNET,
  [Stage.ULTIMATE]: BEDROCK_MODEL_IDS.OPUS,
};

/**
 * Returns the Bedrock model id for a stage, or `null` if the stage cannot
 * converse (BABY).
 */
export function getModelForStage(stage: Stage): string | null {
  return BEDROCK_MODEL_BY_STAGE[stage];
}

/** Whether a monster at this stage can hold a conversation. */
export function canConverse(stage: Stage): boolean {
  return getModelForStage(stage) !== null;
}
