/**
 * POST handler: chat with the monster.
 *
 * Loads the monster and asks the Bedrock lib for a reply. For 幼年期 / BABY the
 * lib short-circuits and returns a canned reply WITHOUT calling Bedrock; this
 * handler surfaces that as `conversationDisabled: true`. For other stages the
 * stage-correct model (Haiku / Sonnet / Opus) is invoked.
 */
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { getMonster as readMonster } from '../lib/dynamo.js';
import { generateReply } from '../lib/bedrock.js';
import { initMonster, parseBody } from '../lib/monster.js';
import { error, json } from '../lib/response.js';

interface ChatRequest {
  clientId?: unknown;
  message?: unknown;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const body = (parseBody(event.body) ?? {}) as ChatRequest;

  const clientId =
    (typeof body.clientId === 'string' ? body.clientId : undefined) ??
    event.pathParameters?.clientId ??
    event.queryStringParameters?.clientId ??
    undefined;
  if (!clientId) {
    return error(400, 'clientId is required');
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return error(400, 'message is required');
  }

  const monster =
    (await readMonster(clientId)) ??
    initMonster(clientId, 'なまえをつけてね', Date.now());

  const result = await generateReply(monster.stage, monster, message);

  return json(200, {
    reply: result.reply,
    stage: monster.stage,
    conversationDisabled: result.conversationDisabled,
  });
};
