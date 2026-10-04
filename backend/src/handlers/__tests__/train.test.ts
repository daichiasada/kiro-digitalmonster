/**
 * train handler tests.
 *
 * Verifies that training increments trainingCount and advances the stage ONLY
 * when both the training-count and elapsed-time evolution gates are met.
 * DynamoDB access is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EVOLUTION_THRESHOLDS,
  Stage,
  type Monster,
} from '@digital-monster/shared';

const getMonsterMock = vi.fn();
const putMonsterMock = vi.fn();

vi.mock('../../lib/dynamo.js', () => ({
  getMonster: (clientId: string) => getMonsterMock(clientId),
  putMonster: (monster: Monster) => putMonsterMock(monster),
}));

const { handler } = await import('../train.js');

function event(body: Record<string, unknown>) {
  return {
    body: JSON.stringify(body),
    pathParameters: null,
    queryStringParameters: null,
  } as never;
}

beforeEach(() => {
  getMonsterMock.mockReset();
  putMonsterMock.mockReset();
  putMonsterMock.mockResolvedValue(undefined);
});

describe('train handler', () => {
  it('increments trainingCount and persists', async () => {
    getMonsterMock.mockResolvedValue({
      clientId: 'c-1',
      name: 'テスト',
      stage: Stage.BABY,
      trainingCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } satisfies Monster);

    const res = await handler(event({ clientId: 'c-1' }));
    const payload = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(payload.trainingCount).toBe(1);
    expect(putMonsterMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT evolve when the time gate is unmet even if the count gate passes', async () => {
    const now = Date.now();
    const rookieGate = EVOLUTION_THRESHOLDS[Stage.ROOKIE];
    getMonsterMock.mockResolvedValue({
      clientId: 'c-1',
      name: 'テスト',
      stage: Stage.BABY,
      // One below the count gate; incremented to exactly meet it.
      trainingCount: rookieGate.trainingCount - 1,
      // Created just now: elapsed time is ~0, below the time gate.
      createdAt: now,
      updatedAt: now,
    } satisfies Monster);

    const res = await handler(event({ clientId: 'c-1' }));
    const payload = JSON.parse(res.body);

    expect(payload.trainingCount).toBe(rookieGate.trainingCount);
    expect(payload.stage).toBe(Stage.BABY);
    expect(payload.evolved).toBe(false);
  });

  it('evolves to ROOKIE when BOTH count and time gates are met', async () => {
    const now = Date.now();
    const rookieGate = EVOLUTION_THRESHOLDS[Stage.ROOKIE];
    getMonsterMock.mockResolvedValue({
      clientId: 'c-1',
      name: 'テスト',
      stage: Stage.BABY,
      trainingCount: rookieGate.trainingCount - 1,
      // Old enough to satisfy the time gate after one more training.
      createdAt: now - rookieGate.elapsedMs - 1000,
      updatedAt: now,
    } satisfies Monster);

    const res = await handler(event({ clientId: 'c-1' }));
    const payload = JSON.parse(res.body);

    expect(payload.trainingCount).toBe(rookieGate.trainingCount);
    expect(payload.stage).toBe(Stage.ROOKIE);
    expect(payload.evolved).toBe(true);
  });
});
