import { test } from "node:test";
import assert from "node:assert/strict";

import {
  adjustAffection,
  affectionBand,
  affectionOf,
  AFFECTION_COLD_THRESHOLD,
  AFFECTION_DECAY_PER_NEGLECT,
  AFFECTION_GAIN_BATTLE_WIN,
  AFFECTION_GAIN_CHAT,
  AFFECTION_GAIN_CLEAN,
  AFFECTION_GAIN_FEED,
  AFFECTION_GAIN_PET,
  AFFECTION_GAIN_SLEEP,
  AFFECTION_GAIN_TRAIN,
  AFFECTION_INITIAL,
  AFFECTION_MAX,
  AFFECTION_MIN,
  AFFECTION_PENALTY_STARVING,
  AFFECTION_WARM_THRESHOLD,
  applyTimePassage,
  clampAffection,
  clean,
  createMonster,
  feed,
  gainAffectionFromChat,
  MAX_HUNGRY_LEVEL,
  normalizeAffection,
  pet,
  recordBattleWinAffection,
  sleep,
  train,
  validateMonster,
} from "../game.ts";
import type { Monster } from "../types.ts";

const T0 = 1_000_000_000_000; // fixed epoch ms for deterministic tests
const TICK_MS = 60 * 1000;

function baseBaby(): Monster {
  return createMonster("m-1", "テストモン", T0);
}

/** A legacy (pre-#42) monster object with no `affection` field. */
function legacyMonster(): Monster {
  const m = baseBaby();
  const { affection: _omit, ...rest } = m;
  return rest as Monster;
}

test("createMonster sets affection to AFFECTION_INITIAL", () => {
  assert.equal(baseBaby().affection, AFFECTION_INITIAL);
});

test("clampAffection clamps at both ends", () => {
  assert.equal(clampAffection(AFFECTION_MAX + 50), AFFECTION_MAX, "clamps high");
  assert.equal(clampAffection(AFFECTION_MIN - 50), AFFECTION_MIN, "clamps low");
  assert.equal(clampAffection(42), 42, "in-range unchanged");
});

test("clampAffection rounds and treats non-finite as AFFECTION_INITIAL", () => {
  assert.equal(clampAffection(42.6), 43, "rounds");
  assert.equal(clampAffection(Number.NaN), AFFECTION_INITIAL, "NaN -> initial");
  assert.equal(clampAffection(Number.POSITIVE_INFINITY), AFFECTION_INITIAL, "Inf -> initial");
  assert.equal(clampAffection(Number.NEGATIVE_INFINITY), AFFECTION_INITIAL, "-Inf -> initial");
});

test("adjustAffection applies delta and clamps", () => {
  assert.equal(adjustAffection(50, 10), 60);
  assert.equal(adjustAffection(AFFECTION_MAX, 10), AFFECTION_MAX, "clamp high");
  assert.equal(adjustAffection(AFFECTION_MIN, -10), AFFECTION_MIN, "clamp low");
});

test("affectionOf defaults a missing field and clamps a present one", () => {
  assert.equal(affectionOf(legacyMonster()), AFFECTION_INITIAL, "legacy default");
  assert.equal(affectionOf({ ...baseBaby(), affection: 70 }), 70, "present value");
  assert.equal(affectionOf({ ...baseBaby(), affection: 999 }), AFFECTION_MAX, "clamps present");
  assert.equal(
    affectionOf({ ...baseBaby(), affection: undefined }),
    AFFECTION_INITIAL,
    "explicit undefined",
  );
});

test("feed raises affection by AFFECTION_GAIN_FEED and returns a NEW monster", () => {
  const m = { ...baseBaby(), affection: 30 };
  const fed = feed(m, T0 + 1000);
  assert.equal(fed.affection, 30 + AFFECTION_GAIN_FEED);
  assert.equal(m.affection, 30, "input not mutated");
  assert.notEqual(fed, m, "new object");
});

test("train raises affection by AFFECTION_GAIN_TRAIN", () => {
  const m = { ...baseBaby(), affection: 30 };
  const trained = train(m, T0 + 1000);
  assert.equal(trained.affection, 30 + AFFECTION_GAIN_TRAIN);
  assert.equal(m.affection, 30, "input not mutated");
});

test("sleep raises affection by AFFECTION_GAIN_SLEEP", () => {
  const m = { ...baseBaby(), affection: 30 };
  const asleep = sleep(m, T0 + 1000);
  assert.equal(asleep.affection, 30 + AFFECTION_GAIN_SLEEP);
  assert.equal(m.affection, 30, "input not mutated");
});

test("clean raises affection by AFFECTION_GAIN_CLEAN", () => {
  const m = { ...baseBaby(), affection: 30, dirty: true };
  const cleaned = clean(m, T0 + 1000);
  assert.equal(cleaned.affection, 30 + AFFECTION_GAIN_CLEAN);
  assert.equal(m.affection, 30, "input not mutated");
});

test("care actions work on legacy monsters (default initial then add delta)", () => {
  const fed = feed(legacyMonster(), T0 + 1000);
  assert.equal(fed.affection, AFFECTION_INITIAL + AFFECTION_GAIN_FEED);
});

test("pet raises affection by AFFECTION_GAIN_PET and returns a NEW monster", () => {
  const m = { ...baseBaby(), affection: 30 };
  const petted = pet(m, T0 + 1000);
  assert.equal(petted.affection, 30 + AFFECTION_GAIN_PET);
  assert.equal(petted.lastUpdatedAt, T0 + 1000);
  assert.equal(m.affection, 30, "input not mutated");
  assert.notEqual(petted, m, "new object");
});

test("recordBattleWinAffection raises affection by AFFECTION_GAIN_BATTLE_WIN", () => {
  const m = { ...baseBaby(), affection: 30 };
  const won = recordBattleWinAffection(m, T0 + 1000);
  assert.equal(won.affection, 30 + AFFECTION_GAIN_BATTLE_WIN);
  assert.equal(m.affection, 30, "input not mutated");
});

test("gainAffectionFromChat raises affection by AFFECTION_GAIN_CHAT", () => {
  const m = { ...baseBaby(), affection: 30 };
  const chatted = gainAffectionFromChat(m, T0 + 1000);
  assert.equal(chatted.affection, 30 + AFFECTION_GAIN_CHAT);
  assert.equal(m.affection, 30, "input not mutated");
});

test("applyTimePassage decays affection by AFFECTION_DECAY_PER_NEGLECT per neglect tick", () => {
  const m = { ...baseBaby(), affection: 50 };
  const ticks = 4;
  const later = applyTimePassage(m, T0 + ticks * TICK_MS);
  // hunger rises to 4 (< MAX), so only the neglect decay applies.
  assert.equal(later.affection, 50 - AFFECTION_DECAY_PER_NEGLECT * ticks);
});

test("applyTimePassage applies the extra starving penalty at MAX hunger", () => {
  const m = { ...baseBaby(), affection: 90, hungryLevel: MAX_HUNGRY_LEVEL };
  const ticks = 2;
  const later = applyTimePassage(m, T0 + ticks * TICK_MS);
  const expectedLoss = (AFFECTION_DECAY_PER_NEGLECT + AFFECTION_PENALTY_STARVING) * ticks;
  assert.equal(later.affection, 90 - expectedLoss);
});

test("applyTimePassage does NOT decay affection while sleeping", () => {
  const m = { ...baseBaby(), affection: 50, isSleeping: true };
  const later = applyTimePassage(m, T0 + 10 * TICK_MS);
  assert.equal(later.affection, 50, "resting does not erode the bond");
});

test("applyTimePassage clamps affection at AFFECTION_MIN over a huge gap", () => {
  const m = { ...baseBaby(), affection: 50 };
  const later = applyTimePassage(m, T0 + 10_000 * TICK_MS);
  assert.equal(later.affection, AFFECTION_MIN, "never goes negative");
});

test("affectionBand classifies at the documented boundaries", () => {
  assert.equal(affectionBand(AFFECTION_COLD_THRESHOLD - 1), "cold", "below cold");
  assert.equal(affectionBand(AFFECTION_COLD_THRESHOLD), "neutral", "at cold boundary is neutral");
  assert.equal(affectionBand(AFFECTION_WARM_THRESHOLD - 1), "neutral", "just below warm");
  assert.equal(affectionBand(AFFECTION_WARM_THRESHOLD), "warm", "at warm boundary is warm");
  assert.equal(affectionBand(AFFECTION_MIN), "cold", "floor is cold");
  assert.equal(affectionBand(AFFECTION_MAX), "warm", "cap is warm");
});

test("validateMonster accepts a legacy monster with NO affection field", () => {
  assert.equal(validateMonster(legacyMonster()), true);
});

test("validateMonster accepts a monster with a valid numeric affection", () => {
  assert.equal(validateMonster({ ...baseBaby(), affection: 55 }), true);
});

test("validateMonster rejects a monster with a non-number / non-finite affection", () => {
  assert.equal(validateMonster({ ...baseBaby(), affection: "40" as unknown as number }), false, "string");
  assert.equal(validateMonster({ ...baseBaby(), affection: Number.NaN }), false, "NaN");
});

test("normalizeAffection fills the default for a legacy monster", () => {
  const normalized = normalizeAffection(legacyMonster());
  assert.equal(normalized.affection, AFFECTION_INITIAL);
});

test("normalizeAffection leaves a valid affection unchanged and is idempotent", () => {
  const m = { ...baseBaby(), affection: 77 };
  const once = normalizeAffection(m);
  assert.equal(once.affection, 77);
  const twice = normalizeAffection(once);
  assert.equal(twice.affection, 77, "idempotent");
  assert.equal(m.affection, 77, "input not mutated");
  assert.notEqual(once, m, "new object");
});
