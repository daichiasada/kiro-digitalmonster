/**
 * GET handler: loads a monster by clientId.
 *
 * clientId is read from the path parameter or query string. When no record
 * exists yet, a freshly initialized BABY monster is returned (NOT persisted;
 * the client saves explicitly).
 */
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { getMonster as readMonster } from '../lib/dynamo.js';
import { initMonster } from '../lib/monster.js';
import { error, json } from '../lib/response.js';

function resolveClientId(event: APIGatewayProxyEvent): string | undefined {
  return (
    event.pathParameters?.clientId ??
    event.queryStringParameters?.clientId ??
    undefined
  );
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const clientId = resolveClientId(event);
  if (!clientId) {
    return error(400, 'clientId is required');
  }

  const existing = await readMonster(clientId);
  if (existing) {
    return json(200, existing);
  }

  // No saved monster yet: return a fresh (unsaved) BABY.
  return json(200, initMonster(clientId, 'なまえをつけてね', Date.now()));
};
