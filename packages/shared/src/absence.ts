import type { GrowthStage, Monster, MonsterForm } from "./types.ts";
import { affectionOf, formOf, HUNGRY_CAUTION_LEVEL } from "./game.ts";

/**
 * Absence summary core (issue #40 — 不在中の出来事サマリー / おかえり画面).
 *
 * This module is the SINGLE SOURCE OF TRUTH for "what happened while the player
 * was away". Everything here is pure (no `Date.now()`, no I/O, no mutation): it
 * works purely off a BEFORE snapshot of the monster and the AFTER snapshot that
 * `applyTimePassage(before, now)` produced. The frontend welcome-back UI
 * (FEAT-002) consumes these exports rather than re-deriving the diff.
 */

/**
 * Minimum absence, in milliseconds, before the welcome-back summary is shown.
 *
 * This is `now - lastUpdatedAt` measured at load (mount): the summary is only
 * worth surfacing when the player has actually been away for a while (the
 * acceptance criterion uses 5 minutes). It is the single source of truth so the
 * frontend reuses this constant instead of hardcoding a second copy, keeping
 * the "how long is long enough" policy in one place.
 */
export const ABSENCE_SUMMARY_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * A structured, display-ready diff of a monster BEFORE vs AFTER an elapsed-time
 * advance. Produced by {@link summarizeAbsence}. Every field is derived purely
 * from the two snapshots; nothing here reads the clock or mutates its inputs.
 */
export interface AbsenceSummary {
  /**
   * How much in-game time elapsed between the two snapshots, in milliseconds:
   * `max(0, after.lastUpdatedAt - before.lastUpdatedAt)`. Derived from the
   * snapshots (not a separate `now`) so this stays a pure two-arg function.
   */
  elapsedMs: number;
  /**
   * Change in hunger: `after.hungryLevel - before.hungryLevel`. In practice
   * this is >= 0 (hunger only rises during an unattended absence).
   */
  hungerDelta: number;
  /** True iff the monster was clean before and is dirty after. */
  becameDirty: boolean;
  /**
   * Signed change in HP: `after.stats.hp - before.stats.hp`. Negative when the
   * monster lost HP (starving), positive when it recovered (sleeping).
   */
  hpDelta: number;
  /**
   * HP lost specifically to starving: `max(0, -hpDelta)` when the monster was
   * NOT sleeping, else 0. (While awake the only source of HP loss over time is
   * starvation.)
   */
  hpLostFromStarving: number;
  /**
   * HP recovered specifically from sleeping: `max(0, hpDelta)` when the monster
   * was sleeping before the advance, else 0.
   */
  hpGainedFromSleeping: number;
  /** True iff the monster was sleeping before the advance (`before.isSleeping`). */
  wasSleeping: boolean;
  /** True iff the monster's growth stage changed (`before.stageId !== after.stageId`). */
  evolved: boolean;
  /** Growth stage before the advance. */
  fromStageId: GrowthStage;
  /** Growth stage after the advance (equals `fromStageId` when not evolved). */
  toStageId: GrowthStage;
  /** Evolution form before the advance (via `formOf`, so legacy saves normalize to "base"). */
  fromForm: MonsterForm;
  /** Evolution form after the advance (via `formOf`). */
  toForm: MonsterForm;
  /**
   * Change in affection: `affectionOf(after) - affectionOf(before)`. Typically
   * <= 0 because an unattended absence decays affection. Read via `affectionOf`
   * so legacy (undefined affection) saves are handled consistently.
   */
  affectionDelta: number;
  /**
   * True iff ANY observable change occurred during the absence, i.e. the
   * welcome-back summary has something worth showing:
   * `hungerDelta !== 0 || becameDirty || hpDelta !== 0 || evolved || affectionDelta !== 0`.
   */
  hasChanges: boolean;
}

/**
 * Compute the {@link AbsenceSummary} between a monster BEFORE and AFTER an
 * elapsed-time advance.
 *
 * `after` is expected to be the result of `applyTimePassage(before, now)`;
 * because of that, `elapsedMs` is derived from the `lastUpdatedAt` difference
 * of the two snapshots rather than taking a separate `now`, which keeps this a
 * pure two-arg function of the before/after state. Pure: no mutation, no
 * `Date.now()`, no I/O. `affectionOf` / `formOf` are used so legacy saves
 * (undefined affection/form) are normalized consistently.
 */
export function summarizeAbsence(before: Monster, after: Monster): AbsenceSummary {
  const elapsedMs = Math.max(0, after.lastUpdatedAt - before.lastUpdatedAt);

  const hungerDelta = after.hungryLevel - before.hungryLevel;
  const becameDirty = !before.dirty && after.dirty;

  const hpDelta = after.stats.hp - before.stats.hp;
  const wasSleeping = before.isSleeping;
  const hpLostFromStarving = !wasSleeping ? Math.max(0, -hpDelta) : 0;
  const hpGainedFromSleeping = wasSleeping ? Math.max(0, hpDelta) : 0;

  const fromStageId = before.stageId;
  const toStageId = after.stageId;
  const evolved = fromStageId !== toStageId;

  const fromForm = formOf(before);
  const toForm = formOf(after);

  const affectionDelta = affectionOf(after) - affectionOf(before);

  const hasChanges =
    hungerDelta !== 0 ||
    becameDirty ||
    hpDelta !== 0 ||
    evolved ||
    affectionDelta !== 0;

  return {
    elapsedMs,
    hungerDelta,
    becameDirty,
    hpDelta,
    hpLostFromStarving,
    hpGainedFromSleeping,
    wasSleeping,
    evolved,
    fromStageId,
    toStageId,
    fromForm,
    toForm,
    affectionDelta,
    hasChanges,
  };
}

/**
 * A single recommended one-tap care action for the welcome-back panel.
 * "none" means there is no single clearly-useful action to suggest.
 */
export type CareRecommendation = "feed" | "clean" | "wake" | "none";

/**
 * Recommend a concrete one-tap care action from the ABSOLUTE post-advance
 * monster state (the monster AFTER `applyTimePassage`). The one-tap button in
 * the welcome-back UI maps directly to the returned action.
 *
 * Priority order (documented, highest first):
 *   1. "feed"  — the monster is at/above the hunger caution level
 *                (`hungryLevel >= HUNGRY_CAUTION_LEVEL`): hunger is the most
 *                urgent need, so まずはごはんをあげよう.
 *   2. "clean" — otherwise, if the monster is dirty.
 *   3. "wake"  — otherwise, if the monster is still sleeping.
 *   4. "none"  — otherwise, nothing clearly useful to suggest.
 */
export function recommendCareFromMonster(after: Monster): CareRecommendation {
  if (after.hungryLevel >= HUNGRY_CAUTION_LEVEL) {
    return "feed";
  }
  if (after.dirty) {
    return "clean";
  }
  if (after.isSleeping) {
    return "wake";
  }
  return "none";
}
