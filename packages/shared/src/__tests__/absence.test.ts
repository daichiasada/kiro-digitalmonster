import { test } from "node:test";
import assert from "node:assert/strict";

import { applyTimePassage, createMonster, MAX_HUNGRY_LEVEL } from "../game.ts";
import {
  ABSENCE_SUMMARY_THRESHOLD_MS,
  recommendCareFromMonster,
  summarizeAbsence,
} from "../absence.ts";
import type { Monster } from "../types.ts";

const T0 = 1_000_000_000_000; // fixed epoch ms for deterministic tests
const TICK_MS = 60 * 1000;

function baseBaby(): Monster {
  return createMonster("m-1", "テストモン", T0);
}

/** Advance `before` by `ticks` whole ticks and summarize the before/after pair. */
function summarizeOverTicks(before: Monster, ticks: number) {
  const after = applyTimePassage(before, before.lastUpdatedAt + ticks * TICK_MS);
  return { after, summary: summarizeAbsence(before, after) };
}

test("ABSENCE_SUMMARY_THRESHOLD_MS is 5 minutes (300000ms)", () => {
  assert.equal(ABSENCE_SUMMARY_THRESHOLD_MS, 300_000);
});

test("no-change: zero gap yields no observable changes", () => {
  const before = baseBaby();
  const after = applyTimePassage(before, T0);
  const summary = summarizeAbsence(before, after);
  assert.equal(summary.elapsedMs, 0);
  assert.equal(summary.hungerDelta, 0);
  assert.equal(summary.becameDirty, false);
  assert.equal(summary.hpDelta, 0);
  assert.equal(summary.evolved, false);
  assert.equal(summary.affectionDelta, 0);
  assert.equal(summary.hasChanges, false);
});

test("no-change: sub-tick gap yields no observable changes", () => {
  const before = baseBaby();
  const after = applyTimePassage(before, T0 + TICK_MS - 1); // < 1 tick
  const summary = summarizeAbsence(before, after);
  assert.ok(summary.elapsedMs > 0, "elapsed is positive but under a tick");
  assert.equal(summary.hungerDelta, 0);
  assert.equal(summary.becameDirty, false);
  assert.equal(summary.hpDelta, 0);
  assert.equal(summary.hasChanges, false);
});

test("hunger-only: a couple awake ticks raise hunger without dirt or HP loss", () => {
  const before = baseBaby();
  const { summary } = summarizeOverTicks(before, 2);
  assert.equal(summary.hungerDelta, 2);
  assert.equal(summary.becameDirty, false, "under 3 ticks stays clean");
  assert.equal(summary.hpDelta, 0, "not starving yet, so no HP loss");
  assert.equal(summary.hpLostFromStarving, 0);
  assert.equal(summary.evolved, false);
  assert.equal(summary.elapsedMs, 2 * TICK_MS);
  assert.equal(summary.hasChanges, true, "hunger and affection decay are changes");
});

test("became-dirty: 3+ awake ticks set the dirty flag", () => {
  const before = baseBaby();
  const { summary } = summarizeOverTicks(before, 3);
  assert.equal(summary.becameDirty, true);
  assert.equal(summary.hungerDelta, 3);
  assert.equal(summary.hasChanges, true);
});

test("starving HP loss: hunger at MAX then more ticks drains HP while awake", () => {
  // Pre-set hunger near MAX so a modest gap pushes it to MAX and then drains HP.
  const before: Monster = { ...baseBaby(), hungryLevel: MAX_HUNGRY_LEVEL };
  const { summary } = summarizeOverTicks(before, 4);
  assert.ok(summary.hpDelta < 0, "awake + starving loses HP");
  assert.ok(summary.hpLostFromStarving > 0);
  assert.equal(summary.hpGainedFromSleeping, 0);
  assert.equal(summary.wasSleeping, false);
  assert.equal(summary.hpLostFromStarving, -summary.hpDelta);
  assert.equal(summary.hasChanges, true);
});

test("sleeping HP gain: an asleep monster recovers HP with no hunger change", () => {
  const before: Monster = {
    ...baseBaby(),
    isSleeping: true,
    stats: { hp: 5, maxHp: 20, atk: 5, def: 3 },
  };
  const { summary } = summarizeOverTicks(before, 3);
  assert.ok(summary.hpDelta > 0, "sleeping recovers HP");
  assert.ok(summary.hpGainedFromSleeping > 0);
  assert.equal(summary.hpGainedFromSleeping, summary.hpDelta);
  assert.equal(summary.hpLostFromStarving, 0);
  assert.equal(summary.wasSleeping, true);
  assert.equal(summary.hungerDelta, 0, "sleeping does not raise hunger");
  assert.equal(summary.affectionDelta, 0, "sleeping does not decay affection");
  assert.equal(summary.hasChanges, true);
});

test("evolution: a trained, aged baby evolves to rookie during the gap", () => {
  // trainingCount >= 2 AND age >= 1min evolves baby -> rookie.
  const before: Monster = { ...baseBaby(), trainingCount: 2 };
  const after = applyTimePassage(before, T0 + 2 * TICK_MS);
  const summary = summarizeAbsence(before, after);
  assert.equal(summary.evolved, true);
  assert.equal(summary.fromStageId, "baby");
  assert.equal(summary.toStageId, "rookie");
  assert.equal(summary.fromForm, "base");
  assert.ok(
    ["base", "attack", "defense", "mischief"].includes(summary.toForm),
    "toForm is a known form",
  );
  assert.equal(summary.hasChanges, true);
});

test("combined: hunger rises, becomes dirty, and affection decays in one gap", () => {
  const before = baseBaby();
  const { summary } = summarizeOverTicks(before, 5);
  assert.ok(summary.hungerDelta > 0);
  assert.equal(summary.becameDirty, true);
  assert.ok(summary.affectionDelta < 0, "neglect decays affection");
  assert.equal(summary.hasChanges, true);
});

test("summarizeAbsence does not mutate its inputs", () => {
  const before = baseBaby();
  const beforeSnapshot = JSON.stringify(before);
  const after = applyTimePassage(before, T0 + 3 * TICK_MS);
  const afterSnapshot = JSON.stringify(after);
  summarizeAbsence(before, after);
  assert.equal(JSON.stringify(before), beforeSnapshot);
  assert.equal(JSON.stringify(after), afterSnapshot);
});

test("recommendCareFromMonster: feed when hungry at/above caution", () => {
  const m: Monster = { ...baseBaby(), hungryLevel: 8, dirty: true, isSleeping: true };
  assert.equal(recommendCareFromMonster(m), "feed");
});

test("recommendCareFromMonster: clean when dirty but not hungry", () => {
  const m: Monster = { ...baseBaby(), hungryLevel: 2, dirty: true, isSleeping: true };
  assert.equal(recommendCareFromMonster(m), "clean");
});

test("recommendCareFromMonster: wake when sleeping but not hungry/dirty", () => {
  const m: Monster = { ...baseBaby(), hungryLevel: 0, dirty: false, isSleeping: true };
  assert.equal(recommendCareFromMonster(m), "wake");
});

test("recommendCareFromMonster: none when healthy", () => {
  const m: Monster = { ...baseBaby(), hungryLevel: 0, dirty: false, isSleeping: false };
  assert.equal(recommendCareFromMonster(m), "none");
});
