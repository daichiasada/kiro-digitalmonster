/**
 * POST handler: validates and persists a monster.
 *
 * The body must match the Monster shape. The stage is recomputed/clamped via
 * the shared evolution logic so a client cannot save a stage higher than its
 * training count and age allow. updatedAt is stamped server-side.
 */
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { computeStage, STAGE_ORDER, type Monster } from '@digital-monster/shared';
import { putMonster } from '../lib/dynamo.js';
import { parseBody, parseMonster } from '../lib/monster.js';
import { error, json } from '../lib/response.js';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const monster = parseMonster(parseBody(event.body));
  if (!monster) {
    return error(400, 'Invalid monster payload');
  }

  const now = Date.now();
  const elapsedMs = Math.max(0, now - monster.createdAt);
  const allowed = computeStage(monster.trainingCount, elapsedMs);

  // Clamp the stage so it never exceeds what the client has actually earned.
  const requestedRank = STAGE_ORDER.indexOf(monster.stage);
  const allowedRank = STAGE_ORDER.indexOf(allowed);
  const stage = requestedRank > allowedRank ? allowed : monster.stage;

  const saved: Monster = {
    ...monster,
    stage,
    updatedAt: now,
  };

  await putMonster(saved);
  return json(200, saved);
};
