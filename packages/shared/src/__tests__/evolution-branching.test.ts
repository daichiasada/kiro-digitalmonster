/**
 * Evolution branching (issue #38 — お世話の質による進化分岐) tests.
 *
 * Proves the shared branch-decision function is PURE, DETERMINISTIC and TOTAL,
 * that every one of the three evolvable branches is reachable, that ties
 * resolve to the documented priority, and that the optional `form` field keeps
 * full backward compatibility with pre-#38 saves (mirroring the #42 affection
 * and #41 battleRecord precedents).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  chooseEvolutionForm,
  evolutionFormScores,
  EVOLUTION_FORM_PRIORITY,
} from "../evolution.ts";
import {
  FORM_DEFAULT,
  createMonster,
  formOf,
  normalizeForm,
  train,
  validateMonster,
} from "../game.ts";
import { formBaseStats, getStage, predictedNextForm } from "../stages.ts";
import type { Monster } from "../types.ts";

const T0 = 1_000_000_000_000;
const MINUTE = 60 * 1000;

function baby(): Monster {
  return createMonster("m-1", "テストモン", T0);
}

/**
 * A legacy-style monster that predates #38/#41/#42: no `form`, `affection` or
 * `battleRecord` fields at all. Mirrors the legacyMonster() factories in the
 * affection/battle-enhancements tests.
 */
function legacyMonster(): Monster {
  const m = baby();
  const legacy = { ...m } as Partial<Monster>;
  delete legacy.form;
  delete legacy.affection;
  delete legacy.battleRecord;
  return legacy as Monster;
}

/* ---------------------------------------------------------------- *
 * (a)-(c) Every branch is reachable.
 * ---------------------------------------------------------------- */

test("chooseEvolutionForm returns 'attack' for a training-heavy / high-win-rate monster", () => {
  const m: Monster = {
    ...baby(),
    trainingCount: 40,
    careCounters: { feed: 0, sleep: 0, clean: 0 },
    hungryLevel: 0,
    dirty: false,
    affection: 50,
    battleRecord: { wins: 20, losses: 0, draws: 0, streak: 20 },
  };
  assert.equal(chooseEvolutionForm(m, T0), "attack");
});

test("chooseEvolutionForm returns 'defense' for a well-rested / well-cared / affectionate monster", () => {
  const m: Monster = {
    ...baby(),
    trainingCount: 1,
    careCounters: { feed: 40, sleep: 40, clean: 40 },
    hungryLevel: 0,
    dirty: false,
    affection: 100,
    battleRecord: { wins: 0, losses: 0, draws: 0, streak: 0 },
  };
  assert.equal(chooseEvolutionForm(m, T0), "defense");
});

test("chooseEvolutionForm returns 'mischief' for a neglected monster", () => {
  const m: Monster = {
    ...baby(),
    trainingCount: 0,
    careCounters: { feed: 0, sleep: 0, clean: 0 },
    hungryLevel: 10,
    dirty: true,
    affection: 0,
    battleRecord: { wins: 0, losses: 0, draws: 0, streak: 0 },
  };
  assert.equal(chooseEvolutionForm(m, T0), "mischief");
});

/* ---------------------------------------------------------------- *
 * (d) Determinism + engineered tie resolves to the documented order.
 * ---------------------------------------------------------------- */

test("chooseEvolutionForm is deterministic for identical inputs", () => {
  const m: Monster = {
    ...baby(),
    trainingCount: 7,
    careCounters: { feed: 3, sleep: 5, clean: 2 },
    hungryLevel: 4,
    dirty: true,
    affection: 33,
    battleRecord: { wins: 3, losses: 1, draws: 0, streak: 3 },
  };
  const first = chooseEvolutionForm(m, T0);
  for (let i = 0; i < 50; i += 1) {
    assert.equal(chooseEvolutionForm(m, T0 + i * MINUTE), first);
  }
});

test("documented priority is attack > defense > mischief", () => {
  assert.deepEqual([...EVOLUTION_FORM_PRIORITY], ["attack", "defense", "mischief"]);
});

test("an engineered three-way tie resolves to the priority winner ('attack')", () => {
  // Zero every signal so all three scores are exactly 0 EXCEPT the shared
  // affection-derived terms. With affection=50: defense gets +5 (50/10) and
  // mischief gets +5 ((100-50)/10); engineer the counts so all three equal.
  // training=5 => attack=5; feed+sleep+clean+5 => set them to 0 => defense=5;
  // hungry=1,dirty=1(+4)=> mischief = 1 + 4 + ... too big. Instead zero hunger
  // and dirty and rely on the affection split to make defense==mischief==5,
  // and set training=5 so attack==5 as well => a clean three-way tie.
  const m: Monster = {
    ...baby(),
    trainingCount: 5,
    careCounters: { feed: 0, sleep: 0, clean: 0 },
    hungryLevel: 0,
    dirty: false,
    affection: 50,
    battleRecord: { wins: 0, losses: 0, draws: 0, streak: 0 },
  };
  const scores = evolutionFormScores(m);
  assert.equal(scores.attack, 5);
  assert.equal(scores.defense, 5);
  assert.equal(scores.mischief, 5);
  assert.equal(chooseEvolutionForm(m, T0), "attack", "tie breaks to the priority winner");
});

test("a defense-vs-mischief tie (attack lower) resolves to 'defense'", () => {
  // training=0 so attack=0; affection=50 => defense base 5, mischief base 5;
  // keep hunger/dirty 0 and counts 0 so defense==mischief==5 > attack==0.
  const m: Monster = {
    ...baby(),
    trainingCount: 0,
    careCounters: { feed: 0, sleep: 0, clean: 0 },
    hungryLevel: 0,
    dirty: false,
    affection: 50,
    battleRecord: { wins: 0, losses: 0, draws: 0, streak: 0 },
  };
  const scores = evolutionFormScores(m);
  assert.ok(scores.defense === scores.mischief && scores.defense > scores.attack);
  assert.equal(chooseEvolutionForm(m, T0), "defense");
});

/* ---------------------------------------------------------------- *
 * (e) Totality on a legacy / zeroed monster.
 * ---------------------------------------------------------------- */

test("chooseEvolutionForm is total: a legacy/zeroed monster still returns a valid variant", () => {
  const zeroed: Monster = {
    ...legacyMonster(),
    trainingCount: 0,
    careCounters: { feed: 0, sleep: 0, clean: 0 },
    hungryLevel: 0,
    dirty: false,
    stats: { hp: 0, maxHp: 0, atk: 0, def: 0 },
  };
  const form = chooseEvolutionForm(zeroed, T0);
  assert.ok(["attack", "defense", "mischief"].includes(form));
  // The legacy monster (no affection field) defaults to the AFFECTION default
  // (20): attack=0, defense=2, mischief=8 => mischief wins. Deterministic.
  assert.equal(form, "mischief");
});

/* ---------------------------------------------------------------- *
 * (f) formOf defaults a legacy monster and clamps unknown values.
 * ---------------------------------------------------------------- */

test("formOf defaults a legacy monster (no form) to 'base'", () => {
  assert.equal(formOf(legacyMonster()), "base");
  assert.equal(FORM_DEFAULT, "base");
});

test("formOf clamps an unknown form value to 'base'", () => {
  const weird = { ...baby(), form: "mega" as Monster["form"] };
  assert.equal(formOf(weird), "base");
  const nullish = { ...baby(), form: null as unknown as Monster["form"] };
  assert.equal(formOf(nullish), "base");
});

test("formOf returns a known variant unchanged", () => {
  for (const f of ["base", "attack", "defense", "mischief"] as const) {
    assert.equal(formOf({ ...baby(), form: f }), f);
  }
});

/* ---------------------------------------------------------------- *
 * (g) normalizeForm fills 'base', is idempotent and non-mutating.
 * ---------------------------------------------------------------- */

test("normalizeForm fills 'base' for a legacy monster, idempotent and non-mutating", () => {
  const legacy = legacyMonster();
  assert.equal(legacy.form, undefined);
  const once = normalizeForm(legacy);
  assert.equal(once.form, "base");
  // non-mutating: the input is untouched.
  assert.equal(legacy.form, undefined);
  assert.notEqual(once, legacy, "returns a new object");
  // idempotent: running again yields an equal result.
  const twice = normalizeForm(once);
  assert.deepEqual(twice, once);
  // clones nested objects like normalizeAffection/normalizeBattleRecord.
  assert.notEqual(once.stats, legacy.stats);
  assert.notEqual(once.careCounters, legacy.careCounters);
});

/* ---------------------------------------------------------------- *
 * (h) validateMonster backward-compat policy for `form`.
 * ---------------------------------------------------------------- */

test("validateMonster accepts a monster with form absent (legacy)", () => {
  assert.equal(validateMonster(legacyMonster()), true);
});

test("validateMonster accepts each known form variant", () => {
  for (const f of ["base", "attack", "defense", "mischief"] as const) {
    assert.equal(validateMonster({ ...baby(), form: f }), true, `form=${f} should validate`);
  }
});

test("validateMonster rejects a monster whose form is an unknown string", () => {
  assert.equal(validateMonster({ ...baby(), form: "mega" }), false);
  assert.equal(validateMonster({ ...baby(), form: 123 }), false);
});

/* ---------------------------------------------------------------- *
 * (i) formBaseStats differs per variant and falls back to base.
 * ---------------------------------------------------------------- */

test("formBaseStats returns differing stats per variant for a given tier", () => {
  const atk = formBaseStats("champion", "attack");
  const def = formBaseStats("champion", "defense");
  const mis = formBaseStats("champion", "mischief");
  // meaningfully different: attack has the highest atk, defense the highest def+hp.
  assert.ok(atk.atk > def.atk, "attack variant has higher atk than defense");
  assert.ok(def.def > atk.def, "defense variant has higher def than attack");
  assert.ok(def.maxHp > atk.maxHp, "defense variant has higher hp than attack");
  assert.ok(mis.def < atk.def && mis.def < def.def, "mischief has the lowest def");
  assert.notDeepEqual(atk, def);
  assert.notDeepEqual(atk, mis);
  assert.notDeepEqual(def, mis);
});

test("formBaseStats 'base' is byte-identical to the stage's linear baseStats", () => {
  for (const stage of ["baby", "rookie", "champion", "ultimate"] as const) {
    assert.deepEqual(formBaseStats(stage, "base"), getStage(stage).baseStats);
  }
});

test("formBaseStats falls back to the stage baseStats for an unknown form and for baby", () => {
  // baby has no variant config -> every form falls back to baby baseStats.
  assert.deepEqual(formBaseStats("baby", "attack"), getStage("baby").baseStats);
  // unknown form -> fallback (total function).
  assert.deepEqual(
    formBaseStats("rookie", "mega" as Monster["form"] as never),
    getStage("rookie").baseStats,
  );
});

/* ---------------------------------------------------------------- *
 * (j) End-to-end train()->evolve and base-form byte-identity.
 * ---------------------------------------------------------------- */

test("train()->evolve: a training-heavy monster lands on 'attack' with attack-type stats", () => {
  // Build a monster that is kept fed/clean so neglect never overrides the
  // training signal, then push it over the baby->rookie threshold.
  let m: Monster = {
    ...baby(),
    trainingCount: 10,
    affection: 60,
    battleRecord: { wins: 10, losses: 0, draws: 0, streak: 10 },
  };
  // Evolve by training once more past the age gate.
  m = train(m, T0 + getStage("baby").evolveRequirement!.minAgeMs + MINUTE);
  assert.equal(m.stageId, "rookie");
  assert.equal(m.form, "attack", "training-heavy, battle-winning monster -> attack branch");
  assert.deepEqual(
    { maxHp: m.stats.maxHp },
    { maxHp: formBaseStats("rookie", "attack").maxHp },
    "stats rebased onto the attack variant base",
  );
});

test("a neutrally-raised monster's 'base' stats stay byte-identical to pre-#38 stage baseStats", () => {
  // The 'base' form is the backward-compat anchor: for every tier its base
  // stats must equal exactly today's STAGES baseStats so legacy/neutral
  // monsters are byte-for-byte unchanged.
  assert.deepEqual(formBaseStats("baby", "base"), { hp: 20, maxHp: 20, atk: 5, def: 3 });
  assert.deepEqual(formBaseStats("rookie", "base"), { hp: 40, maxHp: 40, atk: 10, def: 6 });
  assert.deepEqual(formBaseStats("champion", "base"), { hp: 70, maxHp: 70, atk: 18, def: 12 });
  assert.deepEqual(formBaseStats("ultimate", "base"), { hp: 110, maxHp: 110, atk: 28, def: 20 });
});

/* ---------------------------------------------------------------- *
 * predictedNextForm: UI hint derives from the SAME function.
 * ---------------------------------------------------------------- */

test("predictedNextForm matches chooseEvolutionForm for a non-final monster", () => {
  const m: Monster = {
    ...baby(),
    stageId: "rookie",
    trainingCount: 30,
    battleRecord: { wins: 15, losses: 0, draws: 0, streak: 15 },
  };
  assert.equal(predictedNextForm(m, T0), chooseEvolutionForm(m, T0));
  assert.equal(predictedNextForm(m, T0), "attack");
});

test("predictedNextForm returns null at the final stage", () => {
  const m: Monster = { ...baby(), stageId: "ultimate", trainingCount: 50 };
  assert.equal(predictedNextForm(m, T0), null);
});
