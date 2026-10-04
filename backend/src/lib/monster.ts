/**
 * Backend-local monster helpers: fresh initialization and request-body
 * validation. These sit on top of the shared domain model and are reused by
 * the handlers.
 */
import { Stage, type Monster } from '@digital-monster/shared';

/** Default stats for a newly hatched monster. */
export const DEFAULT_HAPPINESS = 50;
export const DEFAULT_FULLNESS = 50;

/**
 * Builds a freshly initialized BABY monster for a client. Not persisted here;
 * the caller decides whether to save it.
 */
export function initMonster(clientId: string, name: string, now: number): Monster {
  return {
    clientId,
    name,
    stage: Stage.BABY,
    trainingCount: 0,
    createdAt: now,
    updatedAt: now,
    happiness: DEFAULT_HAPPINESS,
    fullness: DEFAULT_FULLNESS,
  };
}

/** Clamps a stat into the inclusive 0..100 range. */
export function clampStat(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isStage(value: unknown): value is Stage {
  return (
    typeof value === 'string' &&
    (Object.values(Stage) as string[]).includes(value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates an unknown value as a Monster. Returns the typed monster when the
 * shape is valid, otherwise `null`. Optional stats (happiness/fullness) are
 * accepted when present but not required.
 */
export function parseMonster(value: unknown): Monster | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const m = value as Record<string, unknown>;

  if (typeof m.clientId !== 'string' || m.clientId.length === 0) return null;
  if (typeof m.name !== 'string' || m.name.length === 0) return null;
  if (!isStage(m.stage)) return null;
  if (!isFiniteNumber(m.trainingCount) || m.trainingCount < 0) return null;
  if (!isFiniteNumber(m.createdAt) || m.createdAt <= 0) return null;
  if (!isFiniteNumber(m.updatedAt) || m.updatedAt <= 0) return null;
  if (m.happiness !== undefined && !isFiniteNumber(m.happiness)) return null;
  if (m.fullness !== undefined && !isFiniteNumber(m.fullness)) return null;

  const monster: Monster = {
    clientId: m.clientId,
    name: m.name,
    stage: m.stage,
    trainingCount: Math.floor(m.trainingCount),
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
  if (isFiniteNumber(m.happiness)) monster.happiness = clampStat(m.happiness);
  if (isFiniteNumber(m.fullness)) monster.fullness = clampStat(m.fullness);
  return monster;
}

/** Safely parses a JSON request body string into an unknown object. */
export function parseBody(body: string | null | undefined): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
