import type { BedrockModelKey, GrowthStage, Monster, MonsterForm, Stats } from "./types.ts";
import { chooseEvolutionForm } from "./evolution.ts";

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

/* --------------------------------------------------------------------------
 * Per-form base stats (issue #38 — お世話の質による進化分岐).
 *
 * The linear TIER (stageId) still drives the overall power budget: the three
 * variants of a tier are all RE-SHAPES of that tier's existing linear
 * `baseStats`, so none of them is strictly stronger overall — they trade one
 * stat for another. The design, relative to the tier's linear baseStats:
 *   - attack  : 攻撃型 — higher atk, lower def (glass cannon).
 *   - defense : 防御型 — higher def and hp, lower atk (tank).
 *   - mischief: やんちゃ型 — balanced-but-quirky: slightly higher atk and hp,
 *               the LOWEST def of the three (reckless).
 *   - base    : the neutral form, BYTE-IDENTICAL to the tier's linear
 *               baseStats so a neutrally-raised / legacy monster is unchanged.
 *
 * The baby tier only ever has the "base" form (it never branches), so no baby
 * entry is defined here and `formBaseStats("baby", ...)` falls back to base.
 *
 * `formBaseStats` is a TOTAL function: any unknown form, or "base", or a tier
 * with no variant entry, falls back to the stage's linear baseStats, so the
 * default path can never produce undefined stats.
 * ------------------------------------------------------------------------ */
export const FORM_CONFIG: Partial<
  Record<GrowthStage, Partial<Record<MonsterForm, Stats>>>
> = {
  rookie: {
    attack: { hp: 38, maxHp: 38, atk: 13, def: 4 },
    defense: { hp: 46, maxHp: 46, atk: 8, def: 9 },
    mischief: { hp: 42, maxHp: 42, atk: 12, def: 3 },
  },
  champion: {
    attack: { hp: 66, maxHp: 66, atk: 23, def: 8 },
    defense: { hp: 80, maxHp: 80, atk: 14, def: 17 },
    mischief: { hp: 74, maxHp: 74, atk: 21, def: 7 },
  },
  ultimate: {
    attack: { hp: 104, maxHp: 104, atk: 36, def: 14 },
    defense: { hp: 126, maxHp: 126, atk: 22, def: 28 },
    mischief: { hp: 116, maxHp: 116, atk: 33, def: 12 },
  },
};

/** Look up the static config for a stage. */
export function getStage(id: GrowthStage): StageConfig {
  return STAGE_BY_ID[id];
}

/**
 * Base stats for a given (tier, form). TOTAL function: returns the variant
 * stats from {@link FORM_CONFIG} when they exist, and otherwise falls back to
 * the tier's linear `baseStats`. In particular "base" (and any unknown form,
 * or the baby tier) always resolves to the stage's existing baseStats, which
 * are BYTE-IDENTICAL to the pre-#38 game so legacy/neutral monsters are
 * unaffected. The returned object is a fresh clone (safe to mutate).
 */
export function formBaseStats(stageId: GrowthStage, form: MonsterForm): Stats {
  const stage = getStage(stageId);
  const variant = FORM_CONFIG[stageId]?.[form];
  const stats = variant ?? stage.baseStats;
  return { ...stats };
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

/**
 * Predict the evolution FORM the monster would take at its NEXT tier, for the
 * StatsPanel branch hint (issue #38). Returns null when there is no branching
 * next tier to hint at:
 *   - the monster is already at the final stage, OR
 *   - the next tier is the baby tier (which never branches; not reachable in
 *     the current forward-only progression but guarded for totality).
 *
 * Otherwise it returns `chooseEvolutionForm(monster, now)` — the SAME pure
 * function the evolution engine uses to actually assign the form — so the hint
 * can never contradict the real outcome.
 */
export function predictedNextForm(monster: Monster, now: number): MonsterForm | null {
  const current = getStage(monster.stageId);
  if (current.evolveRequirement === null) {
    return null;
  }
  const next = STAGES[stageIndex(monster.stageId) + 1] ?? null;
  if (next === null || next.id === "baby") {
    return null;
  }
  return chooseEvolutionForm(monster, now);
}
