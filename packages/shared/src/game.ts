import type { ChatRequest, GrowthStage, Monster, Stats } from "./types.ts";
import { STAGES, evolveStage, getStage } from "./stages.ts";

/** One in-game "tick" of time passage, in milliseconds. */
const TICK_MS = 60 * 1000;

/** Upper bound on hungryLevel so it does not grow without limit. */
const MAX_HUNGRY_LEVEL = 10;

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
    typeof m.name === "string" &&
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
    return { stageId: loaded.stageId, name: loaded.name, fromServer: true };
  }
  const stageId = asGrowthStage(request.stageId) ?? "baby";
  const name =
    typeof request.monsterName === "string" && request.monsterName.trim() !== ""
      ? request.monsterName
      : "モンスター";
  return { stageId, name, fromServer: false };
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
  };
}
