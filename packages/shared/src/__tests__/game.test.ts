import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyTimePassage,
  clean,
  createMonster,
  feed,
  isValidMonsterName,
  MONSTER_NAME_MAX_LENGTH,
  MONSTER_NAME_MIN_LENGTH,
  normalizeMonsterName,
  sleep,
  train,
  validateMonster,
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

test("name length constants reflect the issue #36 1..12 bound", () => {
  assert.equal(MONSTER_NAME_MIN_LENGTH, 1);
  assert.equal(MONSTER_NAME_MAX_LENGTH, 12);
});

test("normalizeMonsterName trims leading and trailing whitespace", () => {
  assert.equal(normalizeMonsterName("  でじたん  "), "でじたん");
  assert.equal(normalizeMonsterName("\tHero\n"), "Hero");
  assert.equal(normalizeMonsterName("A"), "A");
});

test("isValidMonsterName accepts valid 1..12 names (code-point counted)", () => {
  assert.equal(isValidMonsterName("でじたん"), true, "default JA name is valid");
  assert.equal(isValidMonsterName("A"), true, "single char is valid");
  assert.equal(isValidMonsterName("  トリム  "), true, "trims before measuring");
  assert.equal(isValidMonsterName("あいうえおかきくけこさし"), true, "12 JA code points");
  assert.equal(isValidMonsterName("A".repeat(12)), true, "12 ASCII chars");
});

test("isValidMonsterName rejects empty, whitespace-only, too-long and non-strings", () => {
  assert.equal(isValidMonsterName(""), false, "empty");
  assert.equal(isValidMonsterName("   "), false, "whitespace only");
  assert.equal(isValidMonsterName("あいうえおかきくけこさしす"), false, "13 JA code points");
  assert.equal(isValidMonsterName("A".repeat(13)), false, "13 ASCII chars");
  assert.equal(isValidMonsterName(null), false, "null");
  assert.equal(isValidMonsterName(42), false, "number");
  assert.equal(isValidMonsterName(undefined), false, "undefined");
});

test("validateMonster enforces the name rule", () => {
  assert.equal(
    validateMonster(createMonster("m-1", "でじたん", T0)),
    true,
    "default-named monster validates",
  );
  assert.equal(validateMonster({ ...baseBaby(), name: "" }), false, "empty name");
  assert.equal(
    validateMonster({ ...baseBaby(), name: "   " }),
    false,
    "whitespace-only name",
  );
  assert.equal(
    validateMonster({ ...baseBaby(), name: "A".repeat(13) }),
    false,
    "name over 12 chars",
  );
});
