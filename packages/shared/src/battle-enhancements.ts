import type { BattleRecord, BattleWinner, Difficulty, GrowthStage, Monster } from "./types.ts";
import { getStage } from "./stages.ts";

/* --------------------------------------------------------------------------
 * Battle enhancements (相手選択・難易度・戦績) — issue #41.
 *
 * Pure, deterministic domain logic shared by the backend battle handler and
 * the frontend battle UI/preview. Nothing here touches battle.ts's
 * `simulateBattle` or its structured log line format (the #9 frontend
 * animation parses that format), so the simulation stays untouched.
 *
 * This module mirrors the #42 `affection` precedent in game.ts: the battle
 * record is an OPTIONAL field on Monster with a defensive `battleRecordOf` /
 * `normalizeBattleRecord` default helper, and `validateMonster` accepts a
 * monster whose `battleRecord` is absent or valid (never rejects legacy saves).
 * ------------------------------------------------------------------------ */

/**
 * Per-difficulty tuning — the SINGLE SOURCE OF TRUTH for how strong the enemy
 * is and how big the win reward is at each difficulty. Both the backend
 * (enemy generation + reward) and the frontend (preview) read these numbers
 * rather than hardcoding duplicate copies.
 *
 * Invariants (enforced by tests):
 *   - enemyScale rises with difficulty (easy < normal < hard), so a harder
 *     enemy is strictly stronger for the same stage/seed.
 *   - The win reward (rewardAtk + rewardDef total) satisfies
 *     hard > normal >= easy, so 強い相手ほど勝利時のステータス上昇が大きい.
 *
 * `normal` is kept at atk+1/def+1 to preserve today's win reward exactly
 * (the pre-#41 handler granted +1/+1 on a win); `easy` is smaller (atk+1/def+0)
 * and `hard` is larger (atk+2/def+2).
 */
export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { enemyScale: number; rewardAtk: number; rewardDef: number }
> = {
  easy: { enemyScale: 0.75, rewardAtk: 1, rewardDef: 0 },
  normal: { enemyScale: 0.95, rewardAtk: 1, rewardDef: 1 },
  hard: { enemyScale: 1.15, rewardAtk: 2, rewardDef: 2 },
};

/** JA label prefix for each difficulty (弱い/普通/強い), used in the enemy name. */
const DIFFICULTY_LABEL_JA: Record<Difficulty, string> = {
  easy: "弱い",
  normal: "普通",
  hard: "強い",
};

/** All-zeros battle record used as the default for fresh and legacy monsters. */
function zeroBattleRecord(): BattleRecord {
  return { wins: 0, losses: 0, draws: 0, streak: 0 };
}

/**
 * Small deterministic pseudo-random number generator (mulberry32), the same
 * approach as battle.ts's `createRng`. A tiny local copy keeps battle.ts
 * untouched while giving `generateEnemy` reproducible seed-derived jitter.
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Coerce a possibly non-finite value to a non-negative integer with a floor. */
function toStat(value: number, min: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) {
    return min;
  }
  return Math.max(min, rounded);
}

/**
 * Deterministically generate the enemy for a given player stage, difficulty
 * and seed. The SAME (playerStage, difficulty, seed) always yields a deeply
 * equal Monster, so the frontend can preview exactly what the battle will face.
 *
 * The enemy is based on the stage's base stats scaled by the difficulty's
 * `enemyScale`, with a small ±10% seed-derived jitter per stat. `stageId` is
 * the player's stage so the frontend reuses that stage's sprite. The JA
 * `name` follows the existing `野生の{labelJa}モンスター` convention with a
 * difficulty prefix (弱い/普通/強い); the frontend renders its own localized
 * display name via i18n, so this is the server/JA canonical name.
 */
export function generateEnemy(
  playerStage: GrowthStage,
  difficulty: Difficulty,
  seed: number,
): Monster {
  const stage = getStage(playerStage);
  const config = DIFFICULTY_CONFIG[difficulty];
  const rng = createRng(seed);

  // Per-stat jitter in roughly [0.9, 1.1], derived from the seed so it is
  // reproducible. Draw a fresh roll per stat in a fixed order.
  const jitter = (): number => 0.9 + rng() * 0.2;

  const maxHp = toStat(stage.baseStats.maxHp * config.enemyScale * jitter(), 1);
  const atk = toStat(stage.baseStats.atk * config.enemyScale * jitter(), 1);
  const def = toStat(stage.baseStats.def * config.enemyScale * jitter(), 0);

  // bornAt/lastUpdatedAt are seeded deterministically (0) rather than from the
  // clock so the generated enemy is fully reproducible for a fixed seed.
  const now = 0;
  return {
    id: `enemy-${difficulty}-${playerStage}`,
    name: `${DIFFICULTY_LABEL_JA[difficulty]}野生の${stage.labelJa}モンスター`,
    stageId: playerStage,
    stats: { maxHp, hp: maxHp, atk, def },
    trainingCount: 0,
    careCounters: { feed: 0, sleep: 0, clean: 0 },
    bornAt: now,
    lastUpdatedAt: now,
    isSleeping: false,
    dirty: false,
    hungryLevel: 0,
  };
}

/**
 * Return the stat deltas to apply for a battle outcome at a given difficulty.
 * On a loss returns {atk:0,def:0}; on a win returns the configured per-difficulty
 * reward from DIFFICULTY_CONFIG. Pure, no RNG.
 */
export function battleReward(difficulty: Difficulty, won: boolean): { atk: number; def: number } {
  if (!won) {
    return { atk: 0, def: 0 };
  }
  const config = DIFFICULTY_CONFIG[difficulty];
  return { atk: config.rewardAtk, def: config.rewardDef };
}

/**
 * Read a monster's battle record, defaulting a missing/undefined/partial one
 * to an all-zeros record and coercing non-finite members to 0 (mirrors
 * `affectionOf`'s defensive defaulting). Use this everywhere a record is read
 * so legacy saves (no `battleRecord` field) behave like fresh monsters.
 */
export function battleRecordOf(monster: Monster): BattleRecord {
  const raw = monster.battleRecord;
  if (raw === undefined || raw === null || typeof raw !== "object") {
    return zeroBattleRecord();
  }
  const coerce = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return {
    wins: coerce(raw.wins),
    losses: coerce(raw.losses),
    draws: coerce(raw.draws),
    streak: coerce(raw.streak),
  };
}

/**
 * Return a NEW monster whose `battleRecord` is `battleRecordOf(monster)` — the
 * default is filled in for legacy saves and a partial/corrupted one is
 * coerced. Idempotent (running it twice yields the same result). Used on the
 * load path like `normalizeAffection`.
 */
export function normalizeBattleRecord(monster: Monster): Monster {
  return {
    ...monster,
    stats: { ...monster.stats },
    careCounters: { ...monster.careCounters },
    battleRecord: battleRecordOf(monster),
  };
}

/**
 * Return a NEW monster with its battle record updated for the given outcome
 * (never mutates the input):
 *   - winner === "player" : wins++ and streak++ (continue the win streak)
 *   - winner === "enemy"  : losses++ and streak reset to 0
 *   - winner === "draw"   : draws++ and streak reset to 0
 *
 * A draw resets the streak because `streak` tracks CONSECUTIVE WINS; a battle
 * that was not won breaks the run. Also bumps `lastUpdatedAt` to `now`. This
 * does NOT touch stats/affection; the handler composes it with `battleReward`
 * and `recordBattleWinAffection`.
 */
export function recordBattleOutcome(
  monster: Monster,
  winner: BattleWinner,
  now: number = Date.now(),
): Monster {
  const record = battleRecordOf(monster);
  const next: BattleRecord = { ...record };
  if (winner === "player") {
    next.wins += 1;
    next.streak += 1;
  } else if (winner === "enemy") {
    next.losses += 1;
    next.streak = 0;
  } else {
    next.draws += 1;
    next.streak = 0;
  }
  return {
    ...monster,
    stats: { ...monster.stats },
    careCounters: { ...monster.careCounters },
    battleRecord: next,
    lastUpdatedAt: now,
  };
}
