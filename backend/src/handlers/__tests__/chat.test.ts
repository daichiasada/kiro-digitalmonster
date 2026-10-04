/**
 * chat handler tests.
 *
 * Verifies the central safety property: the BABY (幼年期) stage NEVER calls
 * Bedrock, while ROOKIE / CHAMPION / ULTIMATE invoke the stage-correct model
 * id. The AWS SDK clients are fully mocked so no network is used.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BEDROCK_MODEL_IDS,
  Stage,
  type Monster,
} from '@digital-monster/shared';

// --- Mock the Bedrock runtime SDK ------------------------------------------
const bedrockSend = vi.fn();
const invokeModelCtor = vi.fn();

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  class InvokeModelCommand {
    public input: unknown;
    constructor(input: unknown) {
      this.input = input;
      invokeModelCtor(input);
    }
  }
  class BedrockRuntimeClient {
    send = bedrockSend;
  }
  return { BedrockRuntimeClient, InvokeModelCommand };
});

// --- Mock the DynamoDB access so the handler can "load" a monster ----------
const getMonsterMock = vi.fn();
vi.mock('../../lib/dynamo.js', () => ({
  getMonster: (clientId: string) => getMonsterMock(clientId),
  putMonster: vi.fn(),
}));

// Imported AFTER mocks are registered.
const { handler } = await import('../chat.js');

/** Builds an API Gateway proxy event with a JSON body. */
function event(body: Record<string, unknown>) {
  return {
    body: JSON.stringify(body),
    pathParameters: null,
    queryStringParameters: null,
  } as never;
}

/** A monster fixture at a given stage. */
function monsterAt(stage: Stage): Monster {
  return {
    clientId: 'c-1',
    name: 'テスト',
    stage,
    trainingCount: 50,
    createdAt: 1,
    updatedAt: 1,
  };
}

/** A canned Bedrock InvokeModel response body. */
function bedrockResponse(text: string) {
  const payload = JSON.stringify({ content: [{ type: 'text', text }] });
  return { body: new TextEncoder().encode(payload) };
}

beforeEach(() => {
  bedrockSend.mockReset();
  invokeModelCtor.mockReset();
  getMonsterMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('chat handler — BABY (幼年期) skips Bedrock', () => {
  it('returns the canned reply, conversationDisabled:true, and never calls Bedrock', async () => {
    getMonsterMock.mockResolvedValue(monsterAt(Stage.BABY));

    const res = await handler(event({ clientId: 'c-1', message: 'こんにちは' }));
    const payload = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(payload.conversationDisabled).toBe(true);
    expect(payload.stage).toBe(Stage.BABY);
    expect(typeof payload.reply).toBe('string');
    expect(payload.reply.length).toBeGreaterThan(0);

    // The critical assertion: no Bedrock command was built or sent.
    expect(invokeModelCtor).not.toHaveBeenCalled();
    expect(bedrockSend).not.toHaveBeenCalled();
  });
});

describe('chat handler — conversing stages invoke the stage-correct model', () => {
  const cases: Array<[Stage, string]> = [
    [Stage.ROOKIE, BEDROCK_MODEL_IDS.HAIKU],
    [Stage.CHAMPION, BEDROCK_MODEL_IDS.SONNET],
    [Stage.ULTIMATE, BEDROCK_MODEL_IDS.OPUS],
  ];

  it.each(cases)('%s invokes model %s', async (stage, expectedModelId) => {
    getMonsterMock.mockResolvedValue(monsterAt(stage));
    bedrockSend.mockResolvedValue(bedrockResponse('やあ！'));

    const res = await handler(event({ clientId: 'c-1', message: 'こんにちは' }));
    const payload = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(payload.conversationDisabled).toBe(false);
    expect(payload.reply).toBe('やあ！');

    expect(bedrockSend).toHaveBeenCalledTimes(1);
    expect(invokeModelCtor).toHaveBeenCalledTimes(1);
    const commandInput = invokeModelCtor.mock.calls[0][0] as { modelId: string };
    expect(commandInput.modelId).toBe(expectedModelId);
  });
});

describe('chat handler — validation', () => {
  it('rejects a missing message', async () => {
    const res = await handler(event({ clientId: 'c-1' }));
    expect(res.statusCode).toBe(400);
    expect(bedrockSend).not.toHaveBeenCalled();
  });
});
