import type { BedrockModelKey, GrowthStage, Monster, Stats } from "./types.ts";

/** Static configuration for a single growth stage. */
export interface StageConfig {
  id: GrowthStage;
  /** Japanese display label. */
  labelJa: string;
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
    canChat: false,
    bedrockModelKey: "none",
    baseStats: { hp: 20, maxHp: 20, atk: 5, def: 3 },
    // baby -> rookie
    evolveRequirement: { minTrainingCount: 2, minAgeMs: 1 * MINUTE },
  },
  {
    id: "rookie",
    labelJa: "成長期",
    canChat: true,
    bedrockModelKey: "haiku",
    baseStats: { hp: 40, maxHp: 40, atk: 10, def: 6 },
    // rookie -> champion
    evolveRequirement: { minTrainingCount: 6, minAgeMs: 5 * MINUTE },
  },
  {
    id: "champion",
    labelJa: "成熟期",
    canChat: true,
    bedrockModelKey: "sonnet",
    baseStats: { hp: 70, maxHp: 70, atk: 18, def: 12 },
    // champion -> ultimate
    evolveRequirement: { minTrainingCount: 12, minAgeMs: 15 * MINUTE },
  },
  {
    id: "ultimate",
    labelJa: "完全体",
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
