import { test } from "node:test";
import assert from "node:assert/strict";

import { STAGES, evolveStage, getStage, stageIndex } from "../stages.ts";
import { createMonster, train } from "../game.ts";
import {
  BEDROCK_MODEL_IDS,
  modelKeyForStage,
  resolveModelId,
  resolveModelIdForStage,
} from "../bedrock-models.ts";
import type { Monster } from "../types.ts";

const T0 = 1_000_000_000_000;
const MINUTE = 60 * 1000;

function baby(): Monster {
  return createMonster("m-1", "テストモン", T0);
}

test("STAGES is ordered baby->rookie->champion->ultimate with Japanese labels", () => {
  assert.deepEqual(
    STAGES.map((s) => s.id),
    ["baby", "rookie", "champion", "ultimate"],
  );
  assert.equal(getStage("baby").labelJa, "幼年期");
  assert.equal(getStage("rookie").labelJa, "成長期");
  assert.equal(getStage("champion").labelJa, "成熟期");
  assert.equal(getStage("ultimate").labelJa, "完全体");
  assert.equal(stageIndex("champion"), 2);
});

test("baby cannot chat; later stages can", () => {
  assert.equal(getStage("baby").canChat, false);
  assert.equal(getStage("rookie").canChat, true);
  assert.equal(getStage("champion").canChat, true);
  assert.equal(getStage("ultimate").canChat, true);
});

test("evolution requires BOTH training count AND elapsed time", () => {
  const req = getStage("baby").evolveRequirement;
  assert.ok(req);

  // Enough training but not enough time -> no evolution.
  const trainedButYoung: Monster = { ...baby(), trainingCount: req.minTrainingCount };
  assert.equal(evolveStage(trainedButYoung, T0 + req.minAgeMs - 1), "baby");

  // Enough time but not enough training -> no evolution.
  const oldButUntrained: Monster = { ...baby(), trainingCount: req.minTrainingCount - 1 };
  assert.equal(evolveStage(oldButUntrained, T0 + req.minAgeMs + 1), "baby");

  // Both satisfied -> evolves to rookie.
  const ready: Monster = { ...baby(), trainingCount: req.minTrainingCount };
  assert.equal(evolveStage(ready, T0 + req.minAgeMs), "rookie");
});

test("ultimate is terminal (no further evolution)", () => {
  const m: Monster = {
    ...baby(),
    stageId: "ultimate",
    trainingCount: 9999,
  };
  assert.equal(evolveStage(m, T0 + 999 * MINUTE), "ultimate");
  assert.equal(getStage("ultimate").evolveRequirement, null);
});

test("training enough and letting time pass actually evolves via train()", () => {
  let m = baby();
  const req = getStage("baby").evolveRequirement;
  assert.ok(req);
  // Train up to threshold but keep "now" early -> still baby.
  for (let i = 0; i < req.minTrainingCount; i++) {
    m = train(m, T0 + 1000);
  }
  assert.equal(m.stageId, "baby");
  // One more train AFTER enough time -> should evolve.
  m = train(m, T0 + req.minAgeMs + 1000);
  assert.equal(m.stageId, "rookie");
  // Stats rebased to at least rookie base.
  assert.ok(m.stats.maxHp >= getStage("rookie").baseStats.maxHp);
});

test("bedrock model mapping per stage", () => {
  assert.equal(modelKeyForStage("baby"), "none");
  assert.equal(modelKeyForStage("rookie"), "haiku");
  assert.equal(modelKeyForStage("champion"), "sonnet");
  assert.equal(modelKeyForStage("ultimate"), "opus");

  assert.equal(resolveModelId("haiku"), BEDROCK_MODEL_IDS.haiku);
  assert.equal(resolveModelId("sonnet"), BEDROCK_MODEL_IDS.sonnet);
  assert.equal(resolveModelId("opus"), BEDROCK_MODEL_IDS.opus);

  // baby stage -> null (cannot chat)
  assert.equal(resolveModelIdForStage("baby"), null);
  assert.equal(resolveModelIdForStage("rookie"), BEDROCK_MODEL_IDS.haiku);
});

test("resolveModelId honours explicit overrides first", () => {
  const overrides = { haiku: "my-custom-haiku-id" };
  assert.equal(resolveModelId("haiku", overrides), "my-custom-haiku-id");
  // tier without override falls back to default
  assert.equal(resolveModelId("sonnet", overrides), BEDROCK_MODEL_IDS.sonnet);
});

test("resolveModelId throws for the 'none' tier", () => {
  assert.throws(() => resolveModelId("none"), /cannot resolve/i);
});
