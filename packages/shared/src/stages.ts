import type { BedrockModelKey, GrowthStage, Monster, Stats } from "./types.ts";

/** Static configuration for a single growth stage. */
export interface StageConfig {
  id: GrowthStage;
  /** Japanese display label. */
  labelJa: string;
  /** English display label. */
  labelEn: string;
  /** Whether the monster can chat at this stage. */
  canChat: boolean;
  /** Which Bedrock model tier powers chat at this stage. */
  bedrockModelKey: BedrockModelKey;
  /** Base stats a monster is (re)based to when it reaches this stage. */
  baseStats: Stats;
  /**
   * Evolution requirements to ADVANCE FROM this stage to the next one.
   * `null` for the final stage (nothing to evolve into).
   */
  evolveRequirement: EvolveRequirement | null;
}

/** Both thresholds must be satisfied for evolution to occur. */
export interface EvolveRequirement {
  /** Minimum completed training sessions. */
  minTrainingCount: number;
  /** Minimum elapsed milliseconds since the monster was born. */
  minAgeMs: number;
}

const MINUTE = 60 * 1000;

/**
 * Ordered stage configuration. Order matters: index N+1 is the stage you
 * evolve into from index N.
 */
export const STAGES: readonly StageConfig[] = [
  {
    id: "baby",
    labelJa: "幼年期",
    labelEn: "Baby",
    canChat: false,
    bedrockModelKey: "none",
    baseStats: { hp: 20, maxHp: 20, atk: 5, def: 3 },
    // baby -> rookie
    evolveRequirement: { minTrainingCount: 2, minAgeMs: 1 * MINUTE },
  },
  {
    id: "rookie",
    labelJa: "成長期",
    labelEn: "Rookie",
    canChat: true,
    bedrockModelKey: "haiku",
    baseStats: { hp: 40, maxHp: 40, atk: 10, def: 6 },
    // rookie -> champion
    evolveRequirement: { minTrainingCount: 6, minAgeMs: 5 * MINUTE },
  },
  {
    id: "champion",
    labelJa: "成熟期",
    labelEn: "Champion",
    canChat: true,
    bedrockModelKey: "sonnet",
    baseStats: { hp: 70, maxHp: 70, atk: 18, def: 12 },
    // champion -> ultimate
    evolveRequirement: { minTrainingCount: 12, minAgeMs: 15 * MINUTE },
  },
  {
    id: "ultimate",
    labelJa: "完全体",
    labelEn: "Ultimate",
    canChat: true,
    bedrockModelKey: "opus",
    baseStats: { hp: 110, maxHp: 110, atk: 28, def: 20 },
    // final stage, no further evolution
    evolveRequirement: null,
  },
];

const STAGE_BY_ID: Record<GrowthStage, StageConfig> = Object.fromEntries(
  STAGES.map((stage) => [stage.id, stage]),
) as Record<GrowthStage, StageConfig>;

/** Look up the static config for a stage. */
export function getStage(id: GrowthStage): StageConfig {
  return STAGE_BY_ID[id];
}

/** Zero-based index of a stage within the ordered progression. */
export function stageIndex(id: GrowthStage): number {
  return STAGES.findIndex((stage) => stage.id === id);
}

/**
 * Determine the stage a monster should be in, given the current time.
 *
 * Evolution requires BOTH:
 *   - trainingCount >= requirement.minTrainingCount, AND
 *   - (now - monster.bornAt) >= requirement.minAgeMs
 *
 * Returns the (possibly unchanged) stage id. This only ever advances one
 * step at a time; call repeatedly / let subsequent updates advance further.
 */
export function evolveStage(monster: Monster, now: number): GrowthStage {
  const current = getStage(monster.stageId);
  const requirement = current.evolveRequirement;
  if (requirement === null) {
    return monster.stageId;
  }

  const ageMs = now - monster.bornAt;
  const meetsTraining = monster.trainingCount >= requirement.minTrainingCount;
  const meetsAge = ageMs >= requirement.minAgeMs;

  if (meetsTraining && meetsAge) {
    const nextIndex = stageIndex(monster.stageId) + 1;
    const next = STAGES[nextIndex];
    if (next !== undefined) {
      return next.id;
    }
  }
  return monster.stageId;
}

/**
 * Player-facing snapshot of how close a monster is to its next evolution.
 *
 * This intentionally reuses the exact same AND-gate semantics as
 * {@link evolveStage} (trainingCount >= minTrainingCount AND elapsed >=
 * minAgeMs), so the displayed progress can never contradict the real
 * evolution logic.
 */
export interface EvolutionProgress {
  /** The monster's current stage id. */
  currentStageId: GrowthStage;
  /** Japanese label of the current stage. */
  currentLabelJa: string;
  /** English label of the current stage. */
  currentLabelEn: string;
  /** True when the monster is at the terminal stage (no further evolution). */
  isFinalStage: boolean;
  /** Stage the monster evolves into next, or null at the final stage. */
  nextStageId: GrowthStage | null;
  /** Japanese label of the next stage, or null at the final stage. */
  nextLabelJa: string | null;
  /** English label of the next stage, or null at the final stage. */
  nextLabelEn: string | null;
  /** Completed training sessions so far. */
  trainingCurrent: number;
  /** Training sessions required to advance, or null at the final stage. */
  trainingRequired: number | null;
  /** True when the training requirement is satisfied. */
  trainingMet: boolean;
  /** Elapsed milliseconds since birth, clamped to >= 0. */
  elapsedMs: number;
  /** Milliseconds that must elapse to advance, or null at the final stage. */
  requiredMs: number | null;
  /** True when the elapsed-time requirement is satisfied. */
  ageMet: boolean;
}

/**
 * Compute a player-facing snapshot of a monster's progress toward its next
 * evolution. Pure (no side effects); `now` is epoch milliseconds.
 *
 * At the final stage the requirement fields are null and both met flags are
 * reported true (there is nothing left to satisfy).
 */
export function evolutionProgress(monster: Monster, now: number): EvolutionProgress {
  const current = getStage(monster.stageId);
  const requirement = current.evolveRequirement;
  const elapsedMs = Math.max(0, now - monster.bornAt);

  if (requirement === null) {
    return {
      currentStageId: current.id,
      currentLabelJa: current.labelJa,
      currentLabelEn: current.labelEn,
      isFinalStage: true,
      nextStageId: null,
      nextLabelJa: null,
      nextLabelEn: null,
      trainingCurrent: monster.trainingCount,
      trainingRequired: null,
      trainingMet: true,
      elapsedMs,
      requiredMs: null,
      ageMet: true,
    };
  }

  const next = STAGES[stageIndex(monster.stageId) + 1] ?? null;
  const trainingMet = monster.trainingCount >= requirement.minTrainingCount;
  const ageMet = elapsedMs >= requirement.minAgeMs;

  return {
    currentStageId: current.id,
    currentLabelJa: current.labelJa,
    currentLabelEn: current.labelEn,
    isFinalStage: false,
    nextStageId: next?.id ?? null,
    nextLabelJa: next?.labelJa ?? null,
    nextLabelEn: next?.labelEn ?? null,
    trainingCurrent: monster.trainingCount,
    trainingRequired: requirement.minTrainingCount,
    trainingMet,
    elapsedMs,
    requiredMs: requirement.minAgeMs,
    ageMet,
  };
}
