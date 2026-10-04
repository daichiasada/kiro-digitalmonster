/**
 * POST handler: trains the monster.
 *
 * Loads the monster (or initializes a fresh BABY), increments trainingCount,
 * bumps happiness/fullness, recomputes the stage via the shared evolution
 * logic (which only advances when BOTH the training-count and elapsed-time
 * gates are met), persists, and returns the updated monster plus an `evolved`
 * flag.
 */
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { nextStage, type Monster } from '@digital-monster/shared';
import { getMonster as readMonster, putMonster } from '../lib/dynamo.js';
import { clampStat, initMonster, parseBody } from '../lib/monster.js';
import { error, json } from '../lib/response.js';

/** Stat bumps applied per training session. */
const HAPPINESS_BUMP = 5;
const FULLNESS_BUMP = 10;

function resolveClientId(event: APIGatewayProxyEvent): string | undefined {
  const body = parseBody(event.body) as { clientId?: unknown } | null;
  const fromBody =
    body && typeof body.clientId === 'string' ? body.clientId : undefined;
  return (
    fromBody ??
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

  const now = Date.now();
  const existing = await readMonster(clientId);
  const monster = existing ?? initMonster(clientId, 'なまえをつけてね', now);

  const trainingCount = monster.trainingCount + 1;
  const stageBefore = monster.stage;
  const stage = nextStage(
    { stage: stageBefore, trainingCount, createdAt: monster.createdAt },
    now,
  );

  const updated: Monster = {
    ...monster,
    trainingCount,
    stage,
    happiness: clampStat((monster.happiness ?? 50) + HAPPINESS_BUMP),
    fullness: clampStat((monster.fullness ?? 50) + FULLNESS_BUMP),
    updatedAt: now,
  };

  await putMonster(updated);

  return json(200, { ...updated, evolved: stage !== stageBefore });
};
