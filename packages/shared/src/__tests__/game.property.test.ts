/**
 * Property-based tests for the shared game logic (Kiro University レッスン4:
 * プロパティベーステスト / Property-based testing — the IDE-only lesson).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A HAND-ROLLED HARNESS?
 * This repository was generated in a NETWORK-LOCKED sandbox (INTEGRATIONS_ONLY)
 * where external package registries are blocked, so `fast-check` (the usual
 * property-testing library) CANNOT be installed. To still demonstrate the
 * lesson with a test that actually RUNS and PASSES offline, we hand-roll a
 * tiny, dependency-free PBT harness below:
 *   - a seeded PRNG (mulberry32) so every run is reproducible,
 *   - a few value generators (ints, monsters), and
 *   - a `forAll(...)` runner that drives each property over many randomized
 *     inputs and, on failure, prints the exact seed + offending case so it
 *     can be replayed.
 *
 * In the Kiro IDE, the built-in property-based-testing feature is what this
 * represents: it would generate and shrink these randomized cases for you
 * (typically via fast-check) instead of the manual loop here. The PROPERTIES
 * asserted are the lesson's substance; the harness is only the offline
 * delivery mechanism.
 *
 * Run with:
 *   env -u NODE_OPTIONS node --experimental-strip-types --test \
 *     packages/shared/src/__tests__/*.ts
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createMonster,
  feed,
  train,
  sleep,
  wake,
  clean,
  applyTimePassage,
  reviveMonster,
} from "../game.ts";
import { STAGES, evolveStage, stageIndex } from "../stages.ts";
import { simulateBattle } from "../battle.ts";
import type { GrowthStage, Monster } from "../types.ts";

/* ------------------------------------------------------------------------ *
 * Tiny, dependency-free property-testing harness.
 * ------------------------------------------------------------------------ */

/** Deterministic PRNG (mulberry32): same seed -> same sequence. */
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

/** A generator maps a 0..1 random source to a value of type T. */
type Gen<T> = (rand: () => number) => T;

/** Integer in [min, max] inclusive. */
function intGen(min: number, max: number): Gen<number> {
  return (rand) => min + Math.floor(rand() * (max - min + 1));
}

/** Pick one element of a non-empty array. */
function pick<T>(items: readonly T[]): Gen<T> {
  return (rand) => items[Math.floor(rand() * items.length)]!;
}

const STAGE_IDS: readonly GrowthStage[] = STAGES.map((s) => s.id);

/**
 * Generate an arbitrary-but-well-formed monster. `bornAt` is kept in the past
 * relative to T0 so time-passage / evolution logic has room to work.
 */
const T0 = 1_700_000_000_000;

function monsterGen(rand: () => number): Monster {
  const stageId = pick(STAGE_IDS)(rand);
  const maxHp = intGen(1, 200)(rand);
  const hp = intGen(0, maxHp)(rand);
  const bornAt = T0 - intGen(0, 60)(rand) * 60 * 1000; // up to 60 min ago
  return {
    id: `m-${intGen(1, 1_000_000)(rand)}`,
    name: pick(["アグモン", "ガブモン", "テント", "ピヨ", "モン"])(rand),
    stageId,
    stats: {
      maxHp,
      hp,
      atk: intGen(0, 60)(rand),
      def: intGen(0, 60)(rand),
    },
    trainingCount: intGen(0, 30)(rand),
    careCounters: {
      feed: intGen(0, 50)(rand),
      sleep: intGen(0, 50)(rand),
      clean: intGen(0, 50)(rand),
    },
    bornAt,
    lastUpdatedAt: bornAt + intGen(0, 30)(rand) * 60 * 1000,
    isSleeping: rand() < 0.5,
    dirty: rand() < 0.5,
    hungryLevel: intGen(0, 10)(rand),
  };
}

/** Number of randomized cases each property is checked against. */
const RUNS = 500;

/**
 * Drive `property` over `RUNS` randomized inputs produced by `gen`. On the
 * first failure, throw an assertion that includes the seed and the input so
 * the exact case can be replayed.
 */
function forAll<T>(
  baseSeed: number,
  gen: Gen<T>,
  property: (value: T) => void,
): void {
  for (let i = 0; i < RUNS; i += 1) {
    const seed = baseSeed + i;
    const rand = createRng(seed);
    const value = gen(rand);
    try {
      property(value);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new assert.AssertionError({
        message:
          `Property failed on seed=${seed} (case #${i}).\n` +
          `Input: ${JSON.stringify(value)}\n` +
          `Reason: ${detail}`,
      });
    }
  }
}

/** Assert a stat block is internally consistent (used by several properties). */
function assertStatsValid(m: Monster): void {
  const { hp, maxHp, atk, def } = m.stats;
  assert.ok(maxHp >= 1, `maxHp must be >= 1, got ${maxHp}`);
  assert.ok(hp >= 0, `hp must be >= 0, got ${hp}`);
  assert.ok(hp <= maxHp, `hp (${hp}) must be <= maxHp (${maxHp})`);
  assert.ok(atk >= 0, `atk must be >= 0, got ${atk}`);
  assert.ok(def >= 0, `def must be >= 0, got ${def}`);
}

/* ------------------------------------------------------------------------ *
 * Properties.
 * ------------------------------------------------------------------------ */

test("property: care actions keep stats within bounds (0<=hp<=maxHp, atk/def>=0)", () => {
  forAll(0xc0ffee, monsterGen, (m) => {
    const now = m.lastUpdatedAt + 1000;
    // Each care action, applied independently, must preserve stat invariants.
    for (const action of [feed, train, sleep, wake, clean]) {
      const after = action(m, now);
      assertStatsValid(after);
    }
    // Chained application should also stay valid.
    const chained = clean(sleep(train(feed(m, now), now), now), now);
    assertStatsValid(chained);
  });
});

test("property: applyTimePassage never de-evolves (stage index monotonic non-decreasing)", () => {
  forAll(0x5eed01, monsterGen, (m) => {
    const before = stageIndex(m.stageId);
    // Advance deterministically by at least one tick so time passage runs.
    const after = applyTimePassage(m, m.lastUpdatedAt + 60 * 1000);
    const afterIdx = stageIndex(after.stageId);
    assert.ok(
      afterIdx >= before,
      `stage index went backwards: ${before} -> ${afterIdx}`,
    );
    assertStatsValid(after);
  });
});

test("property: a single evolveStage() call advances at most one stage index", () => {
  forAll(0xa11ce, monsterGen, (m) => {
    const before = stageIndex(m.stageId);
    // Evaluate against a far-future time so the threshold is as satisfiable
    // as it can be; the one-step contract must still hold.
    const nextStage = evolveStage(m, m.bornAt + 1_000 * 60 * 1000);
    const afterIdx = stageIndex(nextStage);
    assert.ok(afterIdx >= before, `evolveStage de-evolved: ${before} -> ${afterIdx}`);
    assert.ok(
      afterIdx - before <= 1,
      `evolveStage advanced more than one stage: ${before} -> ${afterIdx}`,
    );
  });
});

test("property: simulateBattle is deterministic for a fixed seed, terminates, valid winner & player HP", () => {
  // Generate (player, enemy, seed) triples.
  const tripleGen: Gen<{ player: Monster; enemy: Monster; seed: number }> = (
    rand,
  ) => ({
    player: monsterGen(rand),
    enemy: monsterGen(rand),
    seed: intGen(1, 2_000_000_000)(rand),
  });

  forAll(0xba7711e, tripleGen, ({ player, enemy, seed }) => {
    const r1 = simulateBattle(player, enemy, seed);
    const r2 = simulateBattle(player, enemy, seed);

    // Determinism: identical inputs + seed -> identical result.
    assert.deepEqual(r1, r2, "simulateBattle not deterministic for a fixed seed");

    // Termination: turns are bounded.
    assert.ok(r1.turns >= 0 && r1.turns <= 100, `turns out of range: ${r1.turns}`);

    // Valid winner.
    assert.ok(
      r1.winner === "player" || r1.winner === "enemy" || r1.winner === "draw",
      `invalid winner: ${r1.winner}`,
    );

    // Player HP after battle is within [0, player's starting hp (<=maxHp)].
    const startHp = Math.max(0, Math.round(player.stats.hp));
    assert.ok(
      r1.playerHpAfter >= 0,
      `playerHpAfter negative: ${r1.playerHpAfter}`,
    );
    assert.ok(
      r1.playerHpAfter <= player.stats.maxHp,
      `playerHpAfter (${r1.playerHpAfter}) exceeds maxHp (${player.stats.maxHp})`,
    );
    assert.ok(
      r1.playerHpAfter <= startHp,
      `playerHpAfter (${r1.playerHpAfter}) exceeds starting hp (${startHp})`,
    );
  });
});

test("property: reviveMonster yields hp>=1 whenever input hp==0", () => {
  forAll(0xdead, monsterGen, (m) => {
    const fainted: Monster = { ...m, stats: { ...m.stats, hp: 0 } };
    const revived = reviveMonster(fainted, fainted.lastUpdatedAt + 1000);
    assert.ok(revived.stats.hp >= 1, `revive left hp < 1: ${revived.stats.hp}`);
    assertStatsValid(revived);
    // And it must be a no-op (same hp) when hp is already positive.
    if (m.stats.hp > 0) {
      const noop = reviveMonster(m, m.lastUpdatedAt + 1000);
      assert.equal(noop.stats.hp, m.stats.hp, "revive changed an already-alive monster");
    }
  });
});

test("property: createMonster always produces a valid baby monster", () => {
  forAll(0xbabe, intGen(0, 1_000_000), (n) => {
    const m = createMonster(`id-${n}`, `name-${n}`, T0 + n);
    assert.equal(m.stageId, "baby", "fresh monster must start at baby stage");
    assertStatsValid(m);
    assert.equal(m.trainingCount, 0);
  });
});
