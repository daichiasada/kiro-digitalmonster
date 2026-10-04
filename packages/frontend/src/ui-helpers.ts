/**
 * Pure, dependency-free UI helpers.
 *
 * These contain NO DOM / React so they can be unit-tested with the Node
 * built-in test runner (see game-ui.test.ts).
 */
import type { GrowthStage, Monster } from "@ddm/shared";

/** Japanese display label per growth stage. */
const STAGE_LABELS_JA: Record<GrowthStage, string> = {
  baby: "幼年期",
  rookie: "成長期",
  champion: "成熟期",
  ultimate: "完全体",
};

/** Human-friendly Japanese stage label. */
export function stageLabelJa(stageId: GrowthStage): string {
  return STAGE_LABELS_JA[stageId] ?? stageId;
}

/** Whether the monster can chat (everything except the baby stage). */
export function canChat(stageId: GrowthStage): boolean {
  return stageId !== "baby";
}

/**
 * HP as an integer percentage in [0, 100]. Guards against zero/negative maxHp.
 */
export function hpPercent(hp: number, maxHp: number): number {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
    return 0;
  }
  const pct = (hp / maxHp) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Scale an arbitrary stat value to a bar width percentage against a reference
 * maximum, clamped to [0, 100]. Used by StatsPanel for ATK/DEF bars.
 */
export function statBarPercent(value: number, reference: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((value / reference) * 100)));
}

/** A short, friendly Japanese mood string derived from the monster's state. */
export function moodLabelJa(monster: Pick<Monster, "isSleeping" | "dirty" | "hungryLevel">): string {
  if (monster.isSleeping) {
    return "すやすや睡眠中";
  }
  if (monster.dirty) {
    return "よごれている";
  }
  if (monster.hungryLevel >= 7) {
    return "とてもお腹がすいている";
  }
  if (monster.hungryLevel >= 3) {
    return "お腹がすいてきた";
  }
  return "ごきげん";
}
