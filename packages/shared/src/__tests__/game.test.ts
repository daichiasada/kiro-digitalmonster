import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyTimePassage,
  clean,
  createMonster,
  feed,
  sleep,
  train,
  wake,
} from "../game.ts";
import type { Monster } from "../types.ts";

const T0 = 1_000_000_000_000; // fixed epoch ms for deterministic tests

function baseBaby(): Monster {
  return createMonster("m-1", "テストモン", T0);
}

test("createMonster produces a baby with default stats", () => {
  const m = baseBaby();
  assert.equal(m.stageId, "baby");
  assert.equal(m.trainingCount, 0);
  assert.equal(m.stats.hp, m.stats.maxHp);
  assert.equal(m.isSleeping, false);
  assert.equal(m.dirty, false);
  assert.equal(m.hungryLevel, 0);
});

test("feed increments feed counter, reduces hunger and heals", () => {
  const m = { ...baseBaby(), hungryLevel: 5, stats: { hp: 10, maxHp: 20, atk: 5, def: 3 } };
  const fed = feed(m, T0 + 1000);
  assert.equal(fed.careCounters.feed, 1);
  assert.equal(fed.hungryLevel, 2);
  assert.equal(fed.stats.hp, 15);
  // immutability: original untouched
  assert.equal(m.careCounters.feed, 0);
  assert.equal(m.hungryLevel, 5);
});

test("train increments trainingCount and raises atk/def", () => {
  const m = baseBaby();
  const trained = train(m, T0 + 1000);
  assert.equal(trained.trainingCount, 1);
  assert.equal(trained.stats.atk, m.stats.atk + 2);
  assert.equal(trained.stats.def, m.stats.def + 1);
  // original untouched
  assert.equal(m.trainingCount, 0);
});

test("sleep sets isSleeping and wake clears it", () => {
  const m = baseBaby();
  const asleep = sleep(m, T0 + 1000);
  assert.equal(asleep.isSleeping, true);
  assert.equal(asleep.careCounters.sleep, 1);
  const awake = wake(asleep, T0 + 2000);
  assert.equal(awake.isSleeping, false);
});

test("clean clears dirty flag and counts", () => {
  const m = { ...baseBaby(), dirty: true };
  const cleaned = clean(m, T0 + 1000);
  assert.equal(cleaned.dirty, false);
  assert.equal(cleaned.careCounters.clean, 1);
  assert.equal(m.dirty, true, "original not mutated");
});

test("applyTimePassage increases hunger over elapsed ticks", () => {
  const m = baseBaby();
  const later = applyTimePassage(m, T0 + 4 * 60 * 1000); // 4 ticks
  assert.equal(later.hungryLevel, 4);
  assert.equal(later.dirty, true, "3+ ticks make the monster dirty");
  assert.equal(later.lastUpdatedAt, T0 + 4 * 60 * 1000);
});

test("applyTimePassage drains HP when starving", () => {
  const m = { ...baseBaby(), hungryLevel: 10, stats: { hp: 20, maxHp: 20, atk: 5, def: 3 } };
  const later = applyTimePassage(m, T0 + 5 * 60 * 1000); // 5 ticks
  assert.ok(later.stats.hp < 20, "starving monster loses HP");
  assert.ok(later.stats.hp >= 0, "HP never negative");
});

test("sleeping recovers HP over time", () => {
  const m = { ...baseBaby(), isSleeping: true, stats: { hp: 5, maxHp: 20, atk: 5, def: 3 } };
  const later = applyTimePassage(m, T0 + 3 * 60 * 1000); // 3 ticks
  assert.ok(later.stats.hp > 5, "sleeping heals");
  assert.ok(later.stats.hp <= 20, "capped at maxHp");
});

test("time passage never produces negative elapsed effects for past 'now'", () => {
  const m = baseBaby();
  const same = applyTimePassage(m, T0 - 5000); // now before lastUpdated
  assert.equal(same.hungryLevel, 0);
});
