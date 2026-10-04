/**
 * saveMonster handler tests.
 *
 * Verifies malformed bodies are rejected with 400 and never persisted, and
 * that a valid monster is saved. DynamoDB access is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Stage, type Monster } from '@digital-monster/shared';

const putMonsterMock = vi.fn();

vi.mock('../../lib/dynamo.js', () => ({
  getMonster: vi.fn(),
  putMonster: (monster: Monster) => putMonsterMock(monster),
}));

const { handler } = await import('../saveMonster.js');

function event(body: string | null) {
  return {
    body,
    pathParameters: null,
    queryStringParameters: null,
  } as never;
}

beforeEach(() => {
  putMonsterMock.mockReset();
  putMonsterMock.mockResolvedValue(undefined);
});

describe('saveMonster handler — rejects malformed bodies', () => {
  const badBodies: Array<[string, string | null]> = [
    ['null body', null],
    ['not JSON', 'not-json'],
    ['empty object', JSON.stringify({})],
    ['missing name', JSON.stringify({ clientId: 'c-1', stage: Stage.BABY, trainingCount: 0, createdAt: 1, updatedAt: 1 })],
    ['bad stage', JSON.stringify({ clientId: 'c-1', name: 'x', stage: 'WIZARD', trainingCount: 0, createdAt: 1, updatedAt: 1 })],
    ['negative trainingCount', JSON.stringify({ clientId: 'c-1', name: 'x', stage: Stage.BABY, trainingCount: -1, createdAt: 1, updatedAt: 1 })],
    ['non-numeric createdAt', JSON.stringify({ clientId: 'c-1', name: 'x', stage: Stage.BABY, trainingCount: 0, createdAt: 'soon', updatedAt: 1 })],
  ];

  it.each(badBodies)('rejects %s with 400 and does not persist', async (_label, body) => {
    const res = await handler(event(body));
    expect(res.statusCode).toBe(400);
    expect(putMonsterMock).not.toHaveBeenCalled();
  });
});

describe('saveMonster handler — persists a valid monster', () => {
  it('saves and stamps updatedAt', async () => {
    const valid: Monster = {
      clientId: 'c-1',
      name: 'テスト',
      stage: Stage.BABY,
      trainingCount: 0,
      createdAt: Date.now(),
      updatedAt: 1,
    };

    const res = await handler(event(JSON.stringify(valid)));
    const payload = JSON.parse(res.body) as Monster;

    expect(res.statusCode).toBe(200);
    expect(putMonsterMock).toHaveBeenCalledTimes(1);
    expect(payload.clientId).toBe('c-1');
    expect(payload.updatedAt).toBeGreaterThan(1);
  });

  it('clamps a stage the client has not earned down to the computed stage', async () => {
    const now = Date.now();
    // Claims ULTIMATE but has no training and was just created.
    const overclaimed: Monster = {
      clientId: 'c-1',
      name: 'テスト',
      stage: Stage.ULTIMATE,
      trainingCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const res = await handler(event(JSON.stringify(overclaimed)));
    const payload = JSON.parse(res.body) as Monster;

    expect(payload.stage).toBe(Stage.BABY);
  });
});
