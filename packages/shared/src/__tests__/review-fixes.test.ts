import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REVIVE_HP_FRACTION,
  applyTimePassage,
  chooseChatContext,
  createMonster,
  reviveMonster,
  validateMonster,
} from "../game.ts";
import { getStage } from "../stages.ts";
import type { Monster } from "../types.ts";

const T0 = 1_000_000_000_000;

function baseBaby(): Monster {
  return createMonster("m-1", "テストモン", T0);
}

/* ------------------------------------------------------------------ */
/* reviveMonster (Issue 5): never strand a monster unusable at 0 HP.  */
/* ------------------------------------------------------------------ */

test("reviveMonster restores a 0-HP monster to a fraction of maxHp", () => {
  const m = { ...baseBaby(), stats: { hp: 0, maxHp: 40, atk: 10, def: 6 } };
  const revived = reviveMonster(m, T0 + 1000);
  const expected = Math.max(1, Math.round(40 * REVIVE_HP_FRACTION));
  assert.equal(revived.stats.hp, expected);
  assert.ok(revived.stats.hp > 0, "monster can battle again");
  assert.equal(revived.lastUpdatedAt, T0 + 1000);
  // immutability: original untouched
  assert.equal(m.stats.hp, 0);
});

test("reviveMonster is a no-op when HP is already positive", () => {
  const m = { ...baseBaby(), stats: { hp: 12, maxHp: 40, atk: 10, def: 6 } };
  const revived = reviveMonster(m, T0 + 1000);
  assert.equal(revived, m, "same reference returned (no clone)");
  assert.equal(revived.stats.hp, 12);
});

test("reviveMonster floor is at least 1 HP for tiny maxHp", () => {
  const m = { ...baseBaby(), stats: { hp: 0, maxHp: 1, atk: 1, def: 0 } };
  const revived = reviveMonster(m, T0);
  assert.ok(revived.stats.hp >= 1);
});

/* ------------------------------------------------------------------ */
/* chooseChatContext (Issue 2): server record wins, client fallback.  */
/* ------------------------------------------------------------------ */

test("chooseChatContext trusts the loaded record when it exists", () => {
  const loaded: Monster = {
    ...baseBaby(),
    name: "本物",
    stageId: "champion",
  };
  // Client tries to spoof a higher stage / different name.
  const ctx = chooseChatContext(loaded, { stageId: "ultimate", monsterName: "偽物" });
  assert.equal(ctx.stageId, "champion", "cannot spoof a higher stage");
  assert.equal(ctx.name, "本物");
  assert.equal(ctx.fromServer, true);
});

test("chooseChatContext falls back to client fields when record is missing", () => {
  const ctx = chooseChatContext(null, { stageId: "rookie", monsterName: "でじたん" });
  assert.equal(ctx.stageId, "rookie");
  assert.equal(ctx.name, "でじたん");
  assert.equal(ctx.fromServer, false);
});

test("chooseChatContext defaults an unknown client stage to baby", () => {
  const ctx = chooseChatContext(null, {
    stageId: "mega" as Monster["stageId"],
    monsterName: "",
  });
  assert.equal(ctx.stageId, "baby");
  assert.equal(getStage(ctx.stageId).canChat, false, "baby stays non-chat");
  assert.equal(ctx.name, "モンスター", "blank name gets a sensible default");
});

/* ------------------------------------------------------------------ */
/* validateMonster (Issues 3/4): reject malformed saves.              */
/* ------------------------------------------------------------------ */

test("validateMonster accepts a well-formed monster", () => {
  assert.equal(validateMonster(baseBaby()), true);
});

test("validateMonster rejects missing nested stats fields", () => {
  const bad = { ...baseBaby(), stats: { hp: 10, maxHp: 20, atk: 5 } };
  assert.equal(validateMonster(bad), false);
});

test("validateMonster rejects missing careCounters", () => {
  const { careCounters, ...rest } = baseBaby();
  void careCounters;
  assert.equal(validateMonster(rest), false);
});

test("validateMonster rejects an unknown stageId", () => {
  const bad = { ...baseBaby(), stageId: "mega" };
  assert.equal(validateMonster(bad), false);
});

test("validateMonster rejects non-object / null", () => {
  assert.equal(validateMonster(null), false);
  assert.equal(validateMonster("nope"), false);
  assert.equal(validateMonster(42), false);
});

/* ------------------------------------------------------------------ */
/* Issue 1 regression: single evolution path rebases stats.           */
/* ------------------------------------------------------------------ */

test("applyTimePassage catches up MULTIPLE stages after a long offline gap", () => {
  // Qualifies for baby->rookie->champion->ultimate all at once:
  // trainingCount >= 12 (champion->ultimate threshold) and age >= 15min.
  const m: Monster = {
    ...baseBaby(),
    trainingCount: 20,
    stats: { hp: 20, maxHp: 20, atk: 5, def: 3 },
  };
  const after = applyTimePassage(m, T0 + 30 * 60 * 1000);
  assert.equal(after.stageId, "ultimate", "advanced all the way in one call");
  const ultimate = getStage("ultimate");
  assert.equal(
    after.stats.maxHp,
    ultimate.baseStats.maxHp,
    "stats rebased to the final stage base",
  );
  // original untouched
  assert.equal(m.stageId, "baby");
});

test("applyTimePassage stops at the stage whose thresholds are met", () => {
  // Enough training for ultimate, but only old enough for rookie (>=1min, <5min).
  const m: Monster = {
    ...baseBaby(),
    trainingCount: 20,
    stats: { hp: 20, maxHp: 20, atk: 5, def: 3 },
  };
  const after = applyTimePassage(m, T0 + 2 * 60 * 1000);
  assert.equal(after.stageId, "rookie", "age gate still holds per stage");
});

test("applyTimePassage evolves one stage AND rebases stats to the new base", () => {
  // Meets baby->rookie: trainingCount>=2 and age>=1min.
  const m: Monster = {
    ...baseBaby(),
    trainingCount: 2,
    stats: { hp: 20, maxHp: 20, atk: 5, def: 3 },
  };
  const after = applyTimePassage(m, T0 + 2 * 60 * 1000);
  assert.equal(after.stageId, "rookie", "advanced exactly one stage");
  const rookie = getStage("rookie");
  // Stats were rebased to the rookie base (maxHp), not left at the baby block.
  assert.equal(after.stats.maxHp, rookie.baseStats.maxHp);
  assert.ok(
    after.stats.atk >= rookie.baseStats.atk,
    "atk rebased to at least the new stage base",
  );
});
