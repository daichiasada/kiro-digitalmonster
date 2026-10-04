/**
 * Bedrock conversation client.
 *
 * The growth stage decides whether (and with which model) the monster can talk:
 *   - 幼年期 / BABY: `canConverse` is false. We return a canned, non-LLM baby
 *     reply and NEVER construct or send an InvokeModel command.
 *   - 成長期 / 成熟期 / 完全体: we invoke the stage's model (Haiku / Sonnet /
 *     Opus) via `getModelForStage`.
 */
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  canConverse,
  getModelForStage,
  Stage,
  STAGE_LABELS,
  type Monster,
} from '@digital-monster/shared';

/** Anthropic Bedrock API version string for the messages payload. */
const ANTHROPIC_VERSION = 'bedrock-2023-05-31';

/** Result of a reply generation attempt. */
export interface GenerateReplyResult {
  /** The text reply to show the user. */
  reply: string;
  /** True when the stage cannot converse (BABY): no Bedrock call was made. */
  conversationDisabled: boolean;
  /** The Bedrock model id used, or null when conversation was disabled. */
  modelId: string | null;
}

/** Canned Japanese reply for the BABY stage (no Bedrock involved). */
export function babyReply(monster: Pick<Monster, 'name'>): string {
  const name = monster.name?.trim() || 'あかちゃん';
  return `${name}はまだ幼年期です。「ばぶばぶ…」とないているだけで、おしゃべりはできません。トレーニングをして成長させてあげましょう！`;
}

/**
 * Lazily-created Bedrock client. Created on first real invocation so importing
 * (and mocking) the module in tests does not construct a live AWS client.
 */
let bedrockClient: BedrockRuntimeClient | undefined;

/** Returns the shared BedrockRuntimeClient, creating it on first use. */
export function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  }
  return bedrockClient;
}

/** Builds a short Japanese system persona scaled by stage. */
function systemPrompt(stage: Stage, monster: Pick<Monster, 'name'>): string {
  const name = monster.name?.trim() || 'モンスター';
  const label = STAGE_LABELS[stage];
  const persona: Record<Exclude<Stage, Stage.BABY>, string> = {
    [Stage.ROOKIE]:
      'あなたは成長期のやんちゃで元気な子どものモンスターです。短くシンプルな言葉で、ひらがな多めに話します。',
    [Stage.CHAMPION]:
      'あなたは成熟期の頼もしいモンスターです。落ち着いた口調で、相手を励ますように話します。',
    [Stage.ULTIMATE]:
      'あなたは完全体の賢く威厳のあるモンスターです。知的で丁寧な口調で、深みのある返答をします。',
  };
  const voice = persona[stage as Exclude<Stage, Stage.BABY>];
  return `あなたは「${name}」という名前のデジタルモンスターです。現在の成長段階は${label}です。${voice} 返答は必ず日本語で、2〜3文程度にしてください。`;
}

/**
 * Generates a reply for the given stage and user message.
 *
 * For BABY, returns the canned reply WITHOUT touching Bedrock. For every other
 * stage, invokes the stage's model via the Bedrock runtime client.
 */
export async function generateReply(
  stage: Stage,
  monster: Pick<Monster, 'name'>,
  userMessage: string,
): Promise<GenerateReplyResult> {
  // Short-circuit: a baby cannot converse. No Bedrock command is built or sent.
  if (!canConverse(stage)) {
    return {
      reply: babyReply(monster),
      conversationDisabled: true,
      modelId: null,
    };
  }

  const modelId = getModelForStage(stage);
  if (!modelId) {
    // Defensive: canConverse should guarantee a modelId, but never send without one.
    return {
      reply: babyReply(monster),
      conversationDisabled: true,
      modelId: null,
    };
  }

  const payload = {
    anthropic_version: ANTHROPIC_VERSION,
    max_tokens: 512,
    system: systemPrompt(stage, monster),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userMessage }],
      },
    ],
  };

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  const response = await getBedrockClient().send(command);
  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const reply =
    parsed.content
      ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
      .trim() || '…';

  return { reply, conversationDisabled: false, modelId };
}
