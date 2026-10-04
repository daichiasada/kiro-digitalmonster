/**
 * Core domain types for the digital monster.
 *
 * Growth stages follow a Digimon-style progression. Each stage has a stable
 * identifier (used in code, APIs, and persistence) and a Japanese display label.
 */

/**
 * The four growth stages, in evolution order.
 *
 * Stable identifiers are used everywhere (DB, API, logic). The Japanese labels
 * are for display only; see {@link STAGE_LABELS}.
 *
 * - BABY     幼年期 (卵→赤ちゃん) — no conversation / no Bedrock model
 * - ROOKIE   成長期 — Claude 3 Haiku
 * - CHAMPION 成熟期 — Claude 3.5 Sonnet
 * - ULTIMATE 完全体 — Claude 3 Opus
 */
export enum Stage {
  BABY = 'BABY',
  ROOKIE = 'ROOKIE',
  CHAMPION = 'CHAMPION',
  ULTIMATE = 'ULTIMATE',
}

/**
 * Ordered list of stages from youngest to most evolved. The index of a stage
 * in this array is its "rank"; evolution advances by exactly one rank at a time
 * and never skips.
 */
export const STAGE_ORDER: readonly Stage[] = [
  Stage.BABY,
  Stage.ROOKIE,
  Stage.CHAMPION,
  Stage.ULTIMATE,
] as const;

/** Japanese display labels per stage. */
export const STAGE_LABELS: Readonly<Record<Stage, string>> = {
  [Stage.BABY]: '幼年期',
  [Stage.ROOKIE]: '成長期',
  [Stage.CHAMPION]: '成熟期',
  [Stage.ULTIMATE]: '完全体',
};

/**
 * Persisted monster model. One monster per browser (identified by a
 * client-generated `clientId`, which is the DynamoDB partition key). No auth.
 */
export interface Monster {
  /** Client-generated unique id (localStorage); DynamoDB partition key. */
  clientId: string;
  /** User-chosen display name. */
  name: string;
  /** Current growth stage. */
  stage: Stage;
  /** Number of completed training sessions. */
  trainingCount: number;
  /** Creation time, epoch milliseconds. */
  createdAt: number;
  /** Last update time, epoch milliseconds. */
  updatedAt: number;
  /** Optional happiness stat (0-100). */
  happiness?: number;
  /** Optional fullness stat (0-100). */
  fullness?: number;
}
