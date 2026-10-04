/**
 * Evolution logic.
 *
 * A monster advances to the next stage only when BOTH gates are satisfied:
 *   1. training count >= the stage's required training count, AND
 *   2. elapsed time since creation >= the stage's required elapsed time.
 *
 * Evolution never skips stages: `computeStage` advances rank-by-rank and stops
 * at the first stage whose gate is not met.
 */
import { Stage, STAGE_ORDER, type Monster } from './types.js';

/** Convenience time constants (milliseconds). */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** A single evolution gate: both conditions must be met to advance. */
export interface EvolutionThreshold {
  /** Minimum training count required to reach this stage. */
  readonly trainingCount: number;
  /** Minimum elapsed time (ms, since creation) required to reach this stage. */
  readonly elapsedMs: number;
}

/**
 * Thresholds to ENTER each stage, keyed by the target stage. BABY is the
 * starting stage (no gate). Kept in one exported const so they are tunable.
 */
export const EVOLUTION_THRESHOLDS: Readonly<
  Record<Exclude<Stage, Stage.BABY>, EvolutionThreshold>
> = {
  // BABY -> ROOKIE: at least 3 trainings AND at least 5 minutes old.
  [Stage.ROOKIE]: { trainingCount: 3, elapsedMs: 5 * MINUTE },
  // ROOKIE -> CHAMPION: at least 10 trainings AND at least 30 minutes old.
  [Stage.CHAMPION]: { trainingCount: 10, elapsedMs: 30 * MINUTE },
  // CHAMPION -> ULTIMATE: at least 25 trainings AND at least 2 hours old.
  [Stage.ULTIMATE]: { trainingCount: 25, elapsedMs: 2 * HOUR },
};

/**
 * Computes the stage a monster should be at given its training count and the
 * elapsed time since creation. Advances one stage at a time and never skips:
 * stops at the first stage whose gate (training AND time) is not met.
 */
export function computeStage(trainingCount: number, elapsedMs: number): Stage {
  let current = Stage.BABY;

  for (let i = 1; i < STAGE_ORDER.length; i++) {
    const target = STAGE_ORDER[i] as Exclude<Stage, Stage.BABY>;
    const gate = EVOLUTION_THRESHOLDS[target];
    const meetsGate = trainingCount >= gate.trainingCount && elapsedMs >= gate.elapsedMs;

    if (!meetsGate) {
      break;
    }
    current = target;
  }

  return current;
}

/**
 * Pure function returning the stage the monster should advance TO at time
 * `now`, based on its training count and age. Returns the current stage if no
 * evolution is due. Never regresses and never skips.
 */
export function nextStage(monster: Pick<Monster, 'stage' | 'trainingCount' | 'createdAt'>, now: number): Stage {
  const elapsedMs = Math.max(0, now - monster.createdAt);
  const computed = computeStage(monster.trainingCount, elapsedMs);

  // Never regress: keep the higher of current vs computed rank.
  const currentRank = STAGE_ORDER.indexOf(monster.stage);
  const computedRank = STAGE_ORDER.indexOf(computed);
  return computedRank > currentRank ? computed : monster.stage;
}
