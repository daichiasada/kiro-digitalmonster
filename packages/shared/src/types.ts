/**
 * Core domain types for the AI Monster game.
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

/**
 * Evolution FORM / branch (issue #38 — お世話の質による進化分岐).
 *
 * The linear growth TIER (baby -> rookie -> champion -> ultimate) is kept in
 * `Monster.stageId`; `form` is an ORTHOGONAL axis describing WHICH variant a
 * monster evolved into based on how it was raised:
 * - "base"      : the neutral canonical form. Used for the baby tier (which
 *                 never branches) and as the backward-compat default for
 *                 legacy pre-#38 saves. Its per-tier stats/sprite/prompt are
 *                 BYTE-IDENTICAL to the pre-#38 game.
 * - "attack"    : 攻撃型 — raised with heavy training / a high battle win rate.
 * - "defense"   : 防御型 — raised well-rested, well-fed, clean and affectionate.
 * - "mischief"  : やんちゃ型 — raised somewhat neglected (hungry, dirty, distant).
 *
 * The variant a monster takes at each non-baby evolution is chosen by the
 * pure, deterministic `chooseEvolutionForm` function in evolution.ts.
 */
export type MonsterForm = "base" | "attack" | "defense" | "mischief";

/**
 * Battle difficulty the player chooses before challenging an enemy (issue #41).
 * Maps to the JA labels 弱い (easy) / 普通 (normal) / 強い (hard). A harder enemy
 * is stronger but yields a bigger reward on a win (強い相手ほど上昇が大きい).
 */
export type Difficulty = "easy" | "normal" | "hard";

/**
 * Cumulative battle record for a monster (issue #41).
 *
 * `streak` is the CURRENT consecutive-win streak: it increments on a win and
 * resets to 0 on a loss or a draw.
 */
export interface BattleRecord {
  /** Total battles won. */
  wins: number;
  /** Total battles lost. */
  losses: number;
  /** Total battles drawn. */
  draws: number;
  /** Current consecutive-win streak (0 after a loss or draw). */
  streak: number;
}

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
  /**
   * Affection (なつき度): how deeply bonded the monster is with the player.
   *
   * Range is 0..100 (0 = distant, 100 = deeply bonded). Raised by care
   * actions (feed/train/sleep/clean), chatting, the pet/なでる action, and
   * battle wins; lowered by neglect and especially by being left starving
   * (issue #42).
   *
   * OPTIONAL on legacy saves: monsters persisted before #42 have no
   * `affection` field. On load it is defaulted to `AFFECTION_INITIAL` via
   * `normalizeAffection` / `affectionOf`, and `validateMonster` accepts a
   * monster whose `affection` is simply absent (see game.ts for the policy).
   */
  affection?: number;
  /**
   * Cumulative battle record (issue #41). OPTIONAL on legacy pre-#41 saves;
   * defaulted to an all-zeros record via `battleRecordOf` / `normalizeBattleRecord`
   * on load, and `validateMonster` accepts a monster whose `battleRecord` is
   * simply absent (mirrors how #42 handled the optional `affection` field).
   */
  battleRecord?: BattleRecord;
  /**
   * Evolution form / branch (issue #38). See {@link MonsterForm}.
   *
   * OPTIONAL on legacy saves: monsters persisted before #38 have no `form`
   * field. On load it is defaulted to `"base"` via `normalizeForm` / `formOf`,
   * and `validateMonster` accepts a monster whose `form` is simply absent
   * (mirrors how #42 handled the optional `affection` field and #41 the
   * optional `battleRecord`). A fresh baby starts as `"base"`; the variant is
   * assigned when the monster evolves into a non-baby tier.
   */
  form?: MonsterForm;
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

/** UI / chat language. Defaults to "ja" when absent for backward compatibility. */
export type Lang = "ja" | "en";

/** Chat with the monster (POST /chat). */
export interface ChatRequest {
  monsterId: string;
  stageId: GrowthStage;
  monsterName: string;
  message: string;
  /**
   * Preferred reply language. Optional for backward compatibility: when absent
   * the backend defaults to "ja", so already-deployed clients behave as before.
   */
  lang?: Lang;
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
  /**
   * Id of the monster to battle with (issue #41). The new POST body carries
   * `{ monsterId, difficulty, seed }`; the server loads the real monster and
   * generates the enemy via the shared `generateEnemy`. Optional for back-compat
   * with the legacy `{ player, enemy }` shape.
   */
  monsterId?: string;
  /** Chosen difficulty (issue #41). Defaults server-side when absent. */
  difficulty?: Difficulty;
}

export type BattleWinner = "player" | "enemy" | "draw";

export interface BattleResult {
  winner: BattleWinner;
  log: string[];
  playerHpAfter: number;
  enemyHpAfter: number;
  turns: number;
}
