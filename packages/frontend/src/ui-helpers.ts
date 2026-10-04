/**
 * Pure, dependency-free UI helpers.
 *
 * These contain NO DOM / React so they can be unit-tested with the Node
 * built-in test runner (see game-ui.test.ts).
 */
import type { BattleWinner, GrowthStage, Monster } from "@ddm/shared";

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

/** Japanese headline for a finished battle, keyed by winner. */
export function winnerLabelJa(winner: BattleWinner): string {
  switch (winner) {
    case "player":
      return "勝利！ 🎉";
    case "enemy":
      return "敗北… 💥";
    default:
      return "引き分け 🤝";
  }
}

// Matches a per-turn attack line emitted by @ddm/shared simulateBattle, e.g.
//   "T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)"
const TURN_LINE_RE =
  /^T(\d+): (.+) hits (.+) for (\d+) \((enemy|player) HP (\d+)\)$/;
// Matches the final result line, e.g. "Result: player".
const RESULT_LINE_RE = /^Result: (player|enemy|draw)$/;

/**
 * Localize a single battle-log line produced by the backend (which emits
 * English developer strings) into Japanese for display. Unknown lines are
 * returned unchanged so nothing is ever silently dropped.
 */
export function battleLogLineJa(line: string): string {
  const turn = TURN_LINE_RE.exec(line);
  if (turn !== null) {
    const [, n, attacker, defender, dmg, side, hp] = turn;
    const target = side === "enemy" ? "相手" : "自分";
    return `${n}ターン目: ${attacker} の攻撃！ ${defender} に ${dmg} ダメージ（${target}の残りHP ${hp}）`;
  }
  const result = RESULT_LINE_RE.exec(line);
  if (result !== null) {
    return `結果: ${winnerLabelJa(result[1] as BattleWinner)}`;
  }
  return line;
}

/** Localize an entire battle log. */
export function battleLogJa(log: readonly string[]): string[] {
  return log.map(battleLogLineJa);
}

/**
 * Format a duration in milliseconds as a whole-minute Japanese string, e.g.
 * `150000` -> `"2分"`. Rounds DOWN (Math.floor). Non-finite or negative input
 * is guarded to `"0分"`.
 */
export function formatMinutesJa(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "0分";
  }
  return `${Math.floor(ms / 60000)}分`;
}

/** A care action the player can perform on the monster. */
export type CareAction = "feed" | "train" | "sleep" | "clean";

/**
 * Visual-effect descriptor for a care action. Drives the transient overlay
 * animation (FEAT-002 consumes this): a CSS class name, an overlay emoji, and
 * how long the effect stays on screen in milliseconds.
 */
export interface CareEffect {
  className: string;
  emoji: string;
  durationMs: number;
}

/** Fixed visual-effect descriptor per care action. */
const CARE_EFFECTS: Record<CareAction, CareEffect> = {
  feed: { className: "fx-feed", emoji: "🍖", durationMs: 700 },
  train: { className: "fx-train", emoji: "💪", durationMs: 600 },
  sleep: { className: "fx-sleep", emoji: "💤", durationMs: 700 },
  clean: { className: "fx-clean", emoji: "✨", durationMs: 700 },
};

/**
 * Map a care action to its visual-effect descriptor. Durations are kept short
 * and non-blocking so the overlay never gets in the player's way.
 */
export function careEffect(action: CareAction): CareEffect {
  return CARE_EFFECTS[action];
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
