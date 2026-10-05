import type { ChatRequest, GrowthStage, Monster, Stats } from "./types.ts";
import { STAGES, evolveStage, getStage } from "./stages.ts";

/** One in-game "tick" of time passage, in milliseconds. */
const TICK_MS = 60 * 1000;

/**
 * Upper bound on hungryLevel so it does not grow without limit.
 *
 * Single source of truth for the hunger cap. Exported so the frontend fullness
 * gauge reuses this value rather than hardcoding a second copy (issue #29).
 */
export const MAX_HUNGRY_LEVEL = 10;

/**
 * hungryLevel at/above which the UI should show a caution cue (caution color,
 * aria-label) on the hunger gauge and badge. Chosen to match the existing
 * moodLabel 'とてもお腹がすいている' / 'Very hungry' boundary of >=7. This is a
 * UI-only threshold and does not affect game logic (issue #29).
 */
export const HUNGRY_CAUTION_LEVEL = 7;

/* --------------------------------------------------------------------------
 * Affection (なつき度) — issue #42.
 *
 * Affection measures how bonded the monster is with the player. These
 * exported constants are the SINGLE SOURCE OF TRUTH for the value domain and
 * every increase/decrease rule; the frontend heart gauge and the backend chat
 * tone both consume them rather than hardcoding duplicate numbers.
 * ------------------------------------------------------------------------ */

/** Lower bound on affection (0 = distant). Single source of truth for the floor. */
export const AFFECTION_MIN = 0;

/** Upper bound on affection (100 = deeply bonded). Single source of truth for the cap. */
export const AFFECTION_MAX = 100;

/**
 * Affection a freshly created monster starts with, and the default used to
 * backfill legacy saves that predate #42 (so an old monster loads as mildly
 * bonded rather than at the cold floor).
 */
export const AFFECTION_INITIAL = 20;

/** Affection gained each time the monster is fed. */
export const AFFECTION_GAIN_FEED = 2;

/** Affection gained each time the monster is trained. */
export const AFFECTION_GAIN_TRAIN = 2;

/** Affection gained each time the monster is put to sleep. */
export const AFFECTION_GAIN_SLEEP = 1;

/** Affection gained each time the monster is cleaned. */
export const AFFECTION_GAIN_CLEAN = 2;

/** Affection gained each time the monster is petted (なでる). */
export const AFFECTION_GAIN_PET = 3;

/** Affection gained each time the player chats with the monster. */
export const AFFECTION_GAIN_CHAT = 1;

/** Affection gained when the monster wins a battle. */
export const AFFECTION_GAIN_BATTLE_WIN = 5;

/**
 * Affection lost per neglect tick in `applyTimePassage` (awake monster left
 * untended). Applied once the monster is accumulating idle ticks.
 */
export const AFFECTION_DECAY_PER_NEGLECT = 1;

/**
 * EXTRA affection lost per tick while the monster is starving (hungryLevel at
 * MAX_HUNGRY_LEVEL). This is on top of AFFECTION_DECAY_PER_NEGLECT.
 */
export const AFFECTION_PENALTY_STARVING = 1;

/**
 * Band boundaries used to classify affection into a tone/level (see
 * `affectionBand`). A value < AFFECTION_COLD_THRESHOLD is "cold", a value >=
 * AFFECTION_WARM_THRESHOLD is "warm", and anything in between is "neutral".
 * Reused by the chat prompt tone and the UI heart-gauge label.
 */
export const AFFECTION_WARM_THRESHOLD = 60;

/** Lower band boundary — below this the monster is classified "cold". */
export const AFFECTION_COLD_THRESHOLD = 20;

/**
 * Upper bound on a monster's display name length, in Unicode code points.
 *
 * Issue #36 asks for a "1〜12文字程度" bound on the name the player chooses.
 * This is the single source of truth shared by the frontend naming/rename
 * dialog and the server-side `validateMonster` guard so the cap cannot be
 * bypassed by a crafted save.
 */
export const MONSTER_NAME_MAX_LENGTH = 12;

/** Lower bound on a monster's display name length (issue #36: at least 1 char). */
export const MONSTER_NAME_MIN_LENGTH = 1;

/**
 * Trim leading/trailing whitespace from a candidate monster name.
 *
 * Pure helper (no I/O, no mutation). Used by the naming/rename UI before
 * persisting and by `isValidMonsterName` so validation and the stored value
 * agree on what "the name" is.
 */
export function normalizeMonsterName(name: string): string {
  return name.trim();
}

/**
 * Return true iff `name` is a usable monster name per issue #36:
 * a string whose trimmed, whitespace-stripped length is within
 * [MONSTER_NAME_MIN_LENGTH, MONSTER_NAME_MAX_LENGTH] code points
 * (so a whitespace-only name is rejected).
 *
 * Length is counted with `Array.from(trimmed).length` (code points) rather
 * than `String.prototype.length` (UTF-16 code units) so multi-byte Japanese
 * characters each count as one, matching the "1〜12文字程度" intent (the
 * default name 'でじたん' is 4 code points -> valid).
 */
export function isValidMonsterName(name: unknown): boolean {
  if (typeof name !== "string") {
    return false;
  }
  const trimmed = normalizeMonsterName(name);
  const length = Array.from(trimmed).length;
  return length >= MONSTER_NAME_MIN_LENGTH && length <= MONSTER_NAME_MAX_LENGTH;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to an integer to keep stats tidy. */
function toInt(value: number): number {
  return Math.round(value);
}

/** Clone stats, clamping hp into [0, maxHp] and keeping non-negative values. */
function normalizeStats(stats: Stats): Stats {
  const maxHp = Math.max(1, toInt(stats.maxHp));
  return {
    maxHp,
    hp: clamp(toInt(stats.hp), 0, maxHp),
    atk: Math.max(0, toInt(stats.atk)),
    def: Math.max(0, toInt(stats.def)),
  };
}

/** Shallow-clone a monster so callers never mutate the input. */
function cloneMonster(monster: Monster): Monster {
  return {
    ...monster,
    stats: { ...monster.stats },
    careCounters: { ...monster.careCounters },
  };
}

/**
 * Clamp an arbitrary number into the affection domain [AFFECTION_MIN,
 * AFFECTION_MAX], returning an integer.
 *
 * A non-finite input (NaN / ±Infinity, e.g. a corrupted save) is treated as
 * AFFECTION_INITIAL rather than being clamped to an edge, so bad data loads as
 * the neutral starting value instead of 0 or 100.
 */
export function clampAffection(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return AFFECTION_INITIAL;
  }
  return clamp(Math.round(value), AFFECTION_MIN, AFFECTION_MAX);
}

/**
 * Apply a delta to a current affection value, clamping the result into the
 * valid domain. All affection increase/decrease rules go through this helper
 * so clamping lives in exactly one place.
 */
export function adjustAffection(current: number, delta: number): number {
  return clampAffection(current + delta);
}

/**
 * Read a monster's affection, defaulting a missing/undefined value to
 * AFFECTION_INITIAL and clamping a present one. Use this everywhere a
 * monster's affection is read so legacy saves (no `affection` field) behave
 * consistently with fresh monsters.
 */
export function affectionOf(monster: Monster): number {
  const raw = monster.affection;
  if (raw === undefined || raw === null) {
    return AFFECTION_INITIAL;
  }
  return clampAffection(raw);
}

/**
 * Return a NEW monster whose `affection` is `affectionOf(monster)` — i.e. the
 * default is filled in for legacy saves and a present value is clamped. Cheap
 * and idempotent (running it twice yields the same result). Used by the load
 * path (FEAT-002) after `validateMonster` to normalize pre-#42 saves.
 */
export function normalizeAffection(monster: Monster): Monster {
  const next = cloneMonster(monster);
  next.affection = affectionOf(monster);
  return next;
}

/**
 * Classify an affection value into a tone/level band using
 * AFFECTION_COLD_THRESHOLD / AFFECTION_WARM_THRESHOLD:
 * - value < AFFECTION_COLD_THRESHOLD  => "cold"
 * - value >= AFFECTION_WARM_THRESHOLD => "warm"
 * - otherwise                          => "neutral"
 *
 * Reused by the chat prompt tone (backend) and the UI heart-gauge label so
 * both agree on the band boundaries.
 */
export function affectionBand(value: number): "cold" | "neutral" | "warm" {
  const v = clampAffection(value);
  if (v < AFFECTION_COLD_THRESHOLD) {
    return "cold";
  }
  if (v >= AFFECTION_WARM_THRESHOLD) {
    return "warm";
  }
  return "neutral";
}

/**
 * Advance a monster's derived state by the real time elapsed since
 * lastUpdatedAt. Hunger and dirtiness rise over time; a very hungry monster
 * slowly loses HP. The monster may also evolve if it now meets the
 * requirements. Returns a NEW monster; the input is not mutated.
 */
export function applyTimePassage(monster: Monster, now: number): Monster {
  const next = cloneMonster(monster);
  const elapsed = Math.max(0, now - monster.lastUpdatedAt);
  const ticks = Math.floor(elapsed / TICK_MS);

  if (ticks > 0 && !next.isSleeping) {
    next.hungryLevel = clamp(next.hungryLevel + ticks, 0, MAX_HUNGRY_LEVEL);
    if (ticks >= 3) {
      next.dirty = true;
    }
    // A starving monster slowly loses HP.
    if (next.hungryLevel >= MAX_HUNGRY_LEVEL) {
      next.stats = normalizeStats({
        ...next.stats,
        hp: next.stats.hp - ticks,
      });
    }
    // Neglect erodes affection: an awake monster left untended loses affection
    // every tick, and a starving one (hunger at MAX) loses an extra amount on
    // top. adjustAffection clamps at AFFECTION_MIN so even a long offline gap
    // can never drive affection negative. Sleeping does NOT decay (resting).
    let affectionLoss = AFFECTION_DECAY_PER_NEGLECT * ticks;
    if (next.hungryLevel >= MAX_HUNGRY_LEVEL) {
      affectionLoss += AFFECTION_PENALTY_STARVING * ticks;
    }
    next.affection = adjustAffection(affectionOf(next), -affectionLoss);
  } else if (ticks > 0 && next.isSleeping) {
    // Sleeping recovers HP over time.
    next.stats = normalizeStats({
      ...next.stats,
      hp: next.stats.hp + ticks * 2,
    });
  }

  next.lastUpdatedAt = now;

  applyAllEvolutions(next, now);
  return next;
}

/**
 * Advance a monster through EVERY stage it currently qualifies for, rebasing
 * stats at each step. `evolveStage` only moves one step per call, so after a
 * long offline gap a monster could qualify for several evolutions at once;
 * this loop resolves all of them in a single update instead of waiting for
 * subsequent ticks. Each iteration still goes through `applyEvolution`, so
 * the stat block is rebased at every stage. The loop is bounded by the number
 * of stages (STAGES.length) as a safety guard against any mis-config.
 */
function applyAllEvolutions(monster: Monster, now: number): void {
  for (let guard = 0; guard < STAGES.length; guard += 1) {
    const newStage = evolveStage(monster, now);
    if (newStage === monster.stageId) {
      return;
    }
    applyEvolution(monster, newStage);
  }
}

/** Rebase a monster onto a new stage, boosting its base stats. */
function applyEvolution(monster: Monster, stageId: Monster["stageId"]): void {
  const stage = getStage(stageId);
  monster.stageId = stageId;
  // Keep current HP ratio when rebasing to the new (larger) stat block.
  const ratio = monster.stats.maxHp > 0 ? monster.stats.hp / monster.stats.maxHp : 1;
  monster.stats = normalizeStats({
    maxHp: stage.baseStats.maxHp,
    hp: stage.baseStats.maxHp * ratio,
    atk: Math.max(stage.baseStats.atk, monster.stats.atk),
    def: Math.max(stage.baseStats.def, monster.stats.def),
  });
}

/**
 * Feed the monster: reduces hunger and restores a little HP.
 * Returns a NEW monster.
 */
export function feed(monster: Monster, now: number = Date.now()): Monster {
  const next = cloneMonster(monster);
  next.careCounters.feed += 1;
  next.hungryLevel = clamp(next.hungryLevel - 3, 0, MAX_HUNGRY_LEVEL);
  next.stats = normalizeStats({ ...next.stats, hp: next.stats.hp + 5 });
  next.affection = adjustAffection(affectionOf(next), AFFECTION_GAIN_FEED);
  next.lastUpdatedAt = now;
  return next;
}

/**
 * Train the monster: increments trainingCount and raises ATK/DEF.
 * Training also makes the monster hungrier. Returns a NEW monster.
 */
export function train(monster: Monster, now: number = Date.now()): Monster {
  const next = cloneMonster(monster);
  next.trainingCount += 1;
  next.hungryLevel = clamp(next.hungryLevel + 1, 0, MAX_HUNGRY_LEVEL);
  next.stats = normalizeStats({
    ...next.stats,
    atk: next.stats.atk + 2,
    def: next.stats.def + 1,
  });
  next.affection = adjustAffection(affectionOf(next), AFFECTION_GAIN_TRAIN);
  next.lastUpdatedAt = now;

  applyAllEvolutions(next, now);
  return next;
}

/**
 * Put the monster to sleep (toggles sleeping on). Returns a NEW monster.
 */
export function sleep(monster: Monster, now: number = Date.now()): Monster {
  const next = cloneMonster(monster);
  next.careCounters.sleep += 1;
  next.isSleeping = true;
  next.affection = adjustAffection(affectionOf(next), AFFECTION_GAIN_SLEEP);
  next.lastUpdatedAt = now;
  return next;
}

/**
 * Wake the monster up. Returns a NEW monster.
 */
export function wake(monster: Monster, now: number = Date.now()): Monster {
  const next = cloneMonster(monster);
  next.isSleeping = false;
  next.lastUpdatedAt = now;
  return next;
}

/**
 * Clean the monster: clears the dirty flag. Returns a NEW monster.
 */
export function clean(monster: Monster, now: number = Date.now()): Monster {
  const next = cloneMonster(monster);
  next.careCounters.clean += 1;
  next.dirty = false;
  next.affection = adjustAffection(affectionOf(next), AFFECTION_GAIN_CLEAN);
  next.lastUpdatedAt = now;
  return next;
}

/**
 * Pet / なでる the monster: raises affection by AFFECTION_GAIN_PET and bumps
 * lastUpdatedAt. Returns a NEW monster; the input is not mutated.
 *
 * BOUNDARY: pet() itself is UNCAPPED and purely raises affection. The
 * "once-per-day limit" from issue #42 is a UI concern enforced in the frontend
 * (FEAT-002) via localStorage; it deliberately does NOT live on the Monster
 * model, so no per-day counter is added to the type here.
 */
export function pet(monster: Monster, now: number = Date.now()): Monster {
  const next = cloneMonster(monster);
  next.affection = adjustAffection(affectionOf(next), AFFECTION_GAIN_PET);
  next.lastUpdatedAt = now;
  return next;
}

/**
 * Record a battle win's affection gain: returns a NEW monster with affection
 * raised by AFFECTION_GAIN_BATTLE_WIN. The backend battle handler (FEAT-002)
 * calls this on a player win before persisting the updated monster. Input is
 * not mutated.
 */
export function recordBattleWinAffection(monster: Monster, now: number = Date.now()): Monster {
  const next = cloneMonster(monster);
  next.affection = adjustAffection(affectionOf(next), AFFECTION_GAIN_BATTLE_WIN);
  next.lastUpdatedAt = now;
  return next;
}

/**
 * Record a chat interaction's affection gain: returns a NEW monster with
 * affection raised by AFFECTION_GAIN_CHAT. Input is not mutated.
 */
export function gainAffectionFromChat(monster: Monster, now: number = Date.now()): Monster {
  const next = cloneMonster(monster);
  next.affection = adjustAffection(affectionOf(next), AFFECTION_GAIN_CHAT);
  next.lastUpdatedAt = now;
  return next;
}

/**
 * Validate that an unknown value is a well-formed Monster.
 *
 * This is a deeper check than a shallow structural guard: it verifies the
 * nested `stats` and `careCounters` fields exist with the right numeric
 * members and that `stageId` is a known stage. It is used server-side before
 * persisting a client-authored save so an obviously malformed monster
 * (missing required nested fields) is rejected rather than silently stored.
 *
 * NOTE: saves are client-authoritative by design (there is no auth; the
 * browser owns the monsterId and the full payload). This predicate only
 * guards structural integrity, not anti-tamper.
 *
 * The `name` field must additionally satisfy `isValidMonsterName` (issue #36):
 * a non-whitespace-only string of 1..MONSTER_NAME_MAX_LENGTH code points, so a
 * name that is empty, whitespace-only, or over the length cap is rejected
 * server-side before it can be persisted.
 */
export function validateMonster(value: unknown): value is Monster {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const m = value as Record<string, unknown>;
  const stats = m.stats as Record<string, unknown> | undefined;
  const care = m.careCounters as Record<string, unknown> | undefined;

  const okTop =
    typeof m.id === "string" &&
    m.id !== "" &&
    isValidMonsterName(m.name) &&
    asGrowthStage(m.stageId) !== undefined &&
    typeof m.trainingCount === "number" &&
    Number.isFinite(m.trainingCount) &&
    typeof m.bornAt === "number" &&
    Number.isFinite(m.bornAt) &&
    typeof m.lastUpdatedAt === "number" &&
    Number.isFinite(m.lastUpdatedAt) &&
    typeof m.isSleeping === "boolean" &&
    typeof m.dirty === "boolean" &&
    typeof m.hungryLevel === "number" &&
    Number.isFinite(m.hungryLevel);
  if (!okTop) {
    return false;
  }

  // BACKWARD COMPAT (issue #42): `affection` is OPTIONAL-with-default.
  //
  // Saves persisted before #42 (localStorage and DynamoDB records) have no
  // `affection` field, so requiring it here would reject every legacy monster
  // and lock players out of their save. Policy: ACCEPT a monster whose
  // `affection` is absent (legacy) OR a finite number, and REJECT only when it
  // is present but not a finite number (e.g. a string or NaN from a corrupted
  // payload). The load path (FEAT-002) runs `normalizeAffection` after this
  // guard to backfill AFFECTION_INITIAL for legacy saves.
  if (m.affection !== undefined && m.affection !== null) {
    if (typeof m.affection !== "number" || !Number.isFinite(m.affection)) {
      return false;
    }
  }

  // BACKWARD COMPAT (issue #41): `battleRecord` is OPTIONAL-with-default,
  // following the exact same precedent as `affection` (#42) above. Saves
  // persisted before #41 have no `battleRecord` field, so requiring it would
  // reject every legacy monster. Policy: ACCEPT a monster whose `battleRecord`
  // is absent (legacy) OR an object whose present wins/losses/draws/streak
  // members are finite numbers, and REJECT only when it is present-but-malformed
  // (not an object, or a member that is a non-finite number / wrong type). The
  // load path runs `normalizeBattleRecord` after this guard to backfill a
  // zeroed record for legacy saves.
  if (m.battleRecord !== undefined && m.battleRecord !== null) {
    if (typeof m.battleRecord !== "object") {
      return false;
    }
    const rec = m.battleRecord as Record<string, unknown>;
    const member = (value: unknown): boolean =>
      value === undefined || (typeof value === "number" && Number.isFinite(value));
    if (
      !member(rec.wins) ||
      !member(rec.losses) ||
      !member(rec.draws) ||
      !member(rec.streak)
    ) {
      return false;
    }
  }

  if (typeof stats !== "object" || stats === null) {
    return false;
  }
  const okStats =
    typeof stats.hp === "number" &&
    Number.isFinite(stats.hp) &&
    typeof stats.maxHp === "number" &&
    Number.isFinite(stats.maxHp) &&
    typeof stats.atk === "number" &&
    Number.isFinite(stats.atk) &&
    typeof stats.def === "number" &&
    Number.isFinite(stats.def);
  if (!okStats) {
    return false;
  }

  if (typeof care !== "object" || care === null) {
    return false;
  }
  return (
    typeof care.feed === "number" &&
    Number.isFinite(care.feed) &&
    typeof care.sleep === "number" &&
    Number.isFinite(care.sleep) &&
    typeof care.clean === "number" &&
    Number.isFinite(care.clean)
  );
}

/** Narrow an arbitrary string to a known GrowthStage, or undefined. */
function asGrowthStage(value: unknown): GrowthStage | undefined {
  return STAGES.some((s) => s.id === value) ? (value as GrowthStage) : undefined;
}

/**
 * The resolved context the chat handler should use to build a personality
 * prompt and pick a Bedrock model.
 *
 * - `stageId` / `name` are authoritative when a server record exists (so a
 *   client cannot spoof a higher stage to unlock a bigger model); otherwise
 *   they fall back to the client-sent request fields.
 * - `fromServer` records which source was used (useful for logging/tests).
 */
export interface ChatContext {
  stageId: GrowthStage;
  name: string;
  fromServer: boolean;
  /**
   * The monster's affection (なつき度), taken from the loaded server record
   * via `affectionOf` when present, else defaulted to `AFFECTION_INITIAL`
   * (client chat requests do not carry affection). The chat handler (FEAT-002)
   * reads this together with `affectionBand` to pick the reply tone.
   */
  affection: number;
}

/**
 * Choose the chat context from the (optional) server-loaded monster and the
 * client-sent request. The server record wins when it exists; otherwise we
 * fall back to the client fields so a brand-new monster that was never saved
 * can still chat on its first message instead of 404ing.
 *
 * Pure function: no I/O, no mutation. The returned stageId is always a valid
 * GrowthStage, defaulting to "baby" if the client sent something unknown.
 */
export function chooseChatContext(
  loaded: Monster | null,
  request: Pick<ChatRequest, "stageId" | "monsterName">,
): ChatContext {
  if (loaded !== null) {
    return {
      stageId: loaded.stageId,
      name: loaded.name,
      fromServer: true,
      affection: affectionOf(loaded),
    };
  }
  const stageId = asGrowthStage(request.stageId) ?? "baby";
  const name =
    typeof request.monsterName === "string" && request.monsterName.trim() !== ""
      ? request.monsterName
      : "モンスター";
  return { stageId, name, fromServer: false, affection: AFFECTION_INITIAL };
}

/** Fraction of maxHp a fainted monster is revived to, so it is never stranded. */
export const REVIVE_HP_FRACTION = 0.25;

/**
 * Ensure a monster is never stranded unusable at 0 HP.
 *
 * A monster can reach 0 HP after losing a battle or starving. Rather than
 * leaving it permanently fainted (unable to battle again), restore a small
 * floor of HP (a fraction of maxHp, at least 1) so the player can keep
 * playing while still paying a penalty for the loss. If the monster already
 * has positive HP this is a no-op. Returns a NEW monster; input is unchanged.
 */
export function reviveMonster(monster: Monster, now: number = Date.now()): Monster {
  if (monster.stats.hp > 0) {
    return monster;
  }
  const next = cloneMonster(monster);
  const floor = Math.max(1, Math.round(next.stats.maxHp * REVIVE_HP_FRACTION));
  next.stats = normalizeStats({ ...next.stats, hp: floor });
  next.lastUpdatedAt = now;
  return next;
}

/**
 * Create a fresh baby monster with sensible defaults.
 */
export function createMonster(id: string, name: string, now: number = Date.now()): Monster {
  const stage = getStage("baby");
  return {
    id,
    name,
    stageId: "baby",
    stats: { ...stage.baseStats },
    trainingCount: 0,
    careCounters: { feed: 0, sleep: 0, clean: 0 },
    bornAt: now,
    lastUpdatedAt: now,
    isSleeping: false,
    dirty: false,
    hungryLevel: 0,
    affection: AFFECTION_INITIAL,
    // Fresh monsters start with a zeroed battle record (issue #41). Defined
    // inline (not imported from battle-enhancements.ts) to avoid a circular
    // import, since battle-enhancements.ts imports from this module.
    battleRecord: { wins: 0, losses: 0, draws: 0, streak: 0 },
  };
}
