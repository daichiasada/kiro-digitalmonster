/**
 * Core domain types for the Digital Monster game.
 *
 * These types are shared between the frontend (React) and the backend (Lambda)
 * so that the save data shape and the DTOs over the API are defined once.
 */

/**
 * Growth stages, from egg/baby through to the final form.
 * - baby      幼年期 : no chat
 * - rookie    成長期 : Bedrock Claude Haiku
 * - champion  成熟期 : Bedrock Claude Sonnet
 * - ultimate  完全体 : Bedrock Claude Opus
 */
export type GrowthStage = "baby" | "rookie" | "champion" | "ultimate";

/** Which Bedrock model tier a stage uses ("none" means the monster cannot chat). */
export type BedrockModelKey = "none" | "haiku" | "sonnet" | "opus";

/** Combat / care statistics. Deliberately minimal: HP, ATK, DEF only. */
export interface Stats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
}

/** How many times each care action has been performed over the monster's life. */
export interface CareCounters {
  feed: number;
  sleep: number;
  clean: number;
}

/**
 * The persisted monster. `id` is a browser-generated UUID used as the
 * DynamoDB partition key (there is no auth / user management).
 */
export interface Monster {
  id: string;
  name: string;
  stageId: GrowthStage;
  stats: Stats;
  /** Total number of completed training sessions (drives evolution). */
  trainingCount: number;
  careCounters: CareCounters;
  /** Epoch milliseconds when the monster was created (hatched). */
  bornAt: number;
  /** Epoch milliseconds of the last state mutation (drives time passage). */
  lastUpdatedAt: number;
  /** True while asleep; care actions may be limited while sleeping. */
  isSleeping: boolean;
  /** True when the monster needs cleaning. */
  dirty: boolean;
  /** 0 = full, higher = hungrier. Used only to flavour time passage. */
  hungryLevel: number;
}

/* --------------------------------------------------------------------------
 * Request / response DTOs for the HTTP API.
 * ------------------------------------------------------------------------ */

/** Persist a monster (PUT /monster). */
export interface SaveMonsterRequest {
  monster: Monster;
}

export interface SaveMonsterResponse {
  ok: boolean;
  monster: Monster;
}

/** Alias kept for symmetry with the step spec. */
export type SaveMonster = SaveMonsterRequest;

/** Load a monster (GET /monster/{id}). */
export interface GetMonsterRequest {
  id: string;
}

export interface GetMonsterResponse {
  monster: Monster | null;
}

/** Alias kept for symmetry with the step spec. */
export type GetMonster = GetMonsterRequest;

/** Chat with the monster (POST /chat). */
export interface ChatRequest {
  monsterId: string;
  stageId: GrowthStage;
  monsterName: string;
  message: string;
}

export interface ChatResponse {
  reply: string;
  /** Which Bedrock model answered, for display / debugging. */
  modelId: string;
}

/** Run a battle (POST /battle). */
export interface BattleRequest {
  player: Monster;
  enemy: Monster;
  /** Optional seed for deterministic simulation (mostly for tests). */
  seed?: number;
}

export type BattleWinner = "player" | "enemy" | "draw";

export interface BattleResult {
  winner: BattleWinner;
  log: string[];
  playerHpAfter: number;
  enemyHpAfter: number;
  turns: number;
}
