import { test } from "node:test";
import assert from "node:assert/strict";

import {
  battleRecordOf,
  battleReward,
  DIFFICULTY_CONFIG,
  generateEnemy,
  normalizeBattleRecord,
  recordBattleOutcome,
} from "../battle-enhancements.ts";
import { createMonster, validateMonster } from "../game.ts";
import type { BattleRecord, Difficulty, GrowthStage, Monster } from "../types.ts";

const T0 = 1_000_000_000_000; // fixed epoch ms for deterministic tests
const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

function baseBaby(): Monster {
  return createMonster("m-1", "テストモン", T0);
}

/** A legacy (pre-#41) monster object with no `battleRecord` field. */
function legacyMonster(): Monster {
  const m = baseBaby();
  const { battleRecord: _omit, ...rest } = m;
  return rest as Monster;
}

function statSum(m: Monster): number {
  return m.stats.atk + m.stats.def + m.stats.maxHp;
}

/* -------------------------------------------------------------------------- */
/* generateEnemy determinism                                                   */
/* -------------------------------------------------------------------------- */

test("generateEnemy is deterministic for the same (stage, difficulty, seed)", () => {
  const a = generateEnemy("rookie", "normal", 12345);
  const b = generateEnemy("rookie", "normal", 12345);
  assert.deepEqual(a, b);
});

test("generateEnemy can differ for a different seed or difficulty", () => {
  const base = generateEnemy("rookie", "normal", 1);
  const otherSeed = generateEnemy("rookie", "normal", 999999);
  const otherDiff = generateEnemy("rookie", "hard", 1);
  assert.notDeepEqual(base, otherSeed);
  assert.notDeepEqual(base, otherDiff);
});

test("generateEnemy produces valid stats for every difficulty and stage", () => {
  const stages: GrowthStage[] = ["baby", "rookie", "champion", "ultimate"];
  for (const stage of stages) {
    for (const difficulty of DIFFICULTIES) {
      const enemy = generateEnemy(stage, difficulty, 7);
      assert.equal(enemy.stageId, stage, "stageId reuses player stage sprite");
      assert.ok(enemy.stats.maxHp >= 1, "maxHp >= 1");
      assert.equal(enemy.stats.hp, enemy.stats.maxHp, "starts at full HP");
      assert.ok(enemy.stats.atk >= 1, "atk >= 1");
      assert.ok(enemy.stats.def >= 0, "def >= 0");
      assert.ok(Number.isInteger(enemy.stats.maxHp), "integer maxHp");
      assert.ok(Number.isInteger(enemy.stats.atk), "integer atk");
      assert.ok(Number.isInteger(enemy.stats.def), "integer def");
      assert.equal(enemy.id, `enemy-${difficulty}-${stage}`);
      assert.ok(enemy.name.includes("野生の"), "JA name follows the 野生の convention");
    }
  }
});

test("generateEnemy name carries the difficulty JA prefix (弱い/普通/強い)", () => {
  assert.ok(generateEnemy("rookie", "easy", 1).name.startsWith("弱い"));
  assert.ok(generateEnemy("rookie", "normal", 1).name.startsWith("普通"));
  assert.ok(generateEnemy("rookie", "hard", 1).name.startsWith("強い"));
});

test("a hard enemy is stronger than an easy one for the same stage/seed", () => {
  const easy = generateEnemy("champion", "easy", 42);
  const hard = generateEnemy("champion", "hard", 42);
  // Compare total strength as atk+def+maxHp so a single jittered stat cannot
  // flip the comparison.
  assert.ok(statSum(hard) > statSum(easy), "hard total strength > easy total strength");
});

/* -------------------------------------------------------------------------- */
/* battleReward                                                                */
/* -------------------------------------------------------------------------- */

test("battleReward on a win returns the configured per-difficulty deltas", () => {
  for (const difficulty of DIFFICULTIES) {
    const reward = battleReward(difficulty, true);
    assert.equal(reward.atk, DIFFICULTY_CONFIG[difficulty].rewardAtk);
    assert.equal(reward.def, DIFFICULTY_CONFIG[difficulty].rewardDef);
  }
});

test("battleReward scales hard >= normal >= easy on a win", () => {
  const total = (d: Difficulty) => {
    const r = battleReward(d, true);
    return r.atk + r.def;
  };
  assert.ok(total("hard") >= total("normal"), "hard >= normal");
  assert.ok(total("normal") >= total("easy"), "normal >= easy");
  assert.ok(total("hard") > total("easy"), "hard strictly > easy");
});

test("battleReward on a loss returns zeros for every difficulty", () => {
  for (const difficulty of DIFFICULTIES) {
    assert.deepEqual(battleReward(difficulty, false), { atk: 0, def: 0 });
  }
});

/* -------------------------------------------------------------------------- */
/* recordBattleOutcome                                                         */
/* -------------------------------------------------------------------------- */

test("recordBattleOutcome: a win increments wins and streak", () => {
  const m: Monster = { ...baseBaby(), battleRecord: { wins: 2, losses: 1, draws: 0, streak: 2 } };
  const after = recordBattleOutcome(m, "player", T0 + 1000);
  assert.deepEqual(after.battleRecord, { wins: 3, losses: 1, draws: 0, streak: 3 });
  assert.equal(after.lastUpdatedAt, T0 + 1000, "bumps lastUpdatedAt");
  assert.deepEqual(m.battleRecord, { wins: 2, losses: 1, draws: 0, streak: 2 }, "input not mutated");
  assert.notEqual(after, m, "new object");
});

test("recordBattleOutcome: a loss increments losses and zeroes streak", () => {
  const m: Monster = { ...baseBaby(), battleRecord: { wins: 5, losses: 2, draws: 1, streak: 4 } };
  const after = recordBattleOutcome(m, "enemy", T0 + 1000);
  assert.deepEqual(after.battleRecord, { wins: 5, losses: 3, draws: 1, streak: 0 });
  assert.deepEqual(m.battleRecord, { wins: 5, losses: 2, draws: 1, streak: 4 }, "input not mutated");
});

test("recordBattleOutcome: a draw increments draws and zeroes streak", () => {
  const m: Monster = { ...baseBaby(), battleRecord: { wins: 5, losses: 2, draws: 1, streak: 4 } };
  const after = recordBattleOutcome(m, "draw", T0 + 1000);
  assert.deepEqual(after.battleRecord, { wins: 5, losses: 2, draws: 2, streak: 0 });
  assert.deepEqual(m.battleRecord, { wins: 5, losses: 2, draws: 1, streak: 4 }, "input not mutated");
});

test("recordBattleOutcome defaults a legacy monster's record before updating", () => {
  const after = recordBattleOutcome(legacyMonster(), "player", T0 + 1000);
  assert.deepEqual(after.battleRecord, { wins: 1, losses: 0, draws: 0, streak: 1 });
});

/* -------------------------------------------------------------------------- */
/* battleRecordOf / normalizeBattleRecord                                      */
/* -------------------------------------------------------------------------- */

test("battleRecordOf defaults a monster with NO record to all-zeros", () => {
  assert.deepEqual(battleRecordOf(legacyMonster()), { wins: 0, losses: 0, draws: 0, streak: 0 });
});

test("battleRecordOf coerces a partial / NaN record defensively", () => {
  const partial = {
    ...baseBaby(),
    battleRecord: { wins: 3, draws: Number.NaN } as unknown as BattleRecord,
  };
  assert.deepEqual(battleRecordOf(partial), { wins: 3, losses: 0, draws: 0, streak: 0 });
});

test("normalizeBattleRecord fills the default for a legacy monster", () => {
  const normalized = normalizeBattleRecord(legacyMonster());
  assert.deepEqual(normalized.battleRecord, { wins: 0, losses: 0, draws: 0, streak: 0 });
});

test("normalizeBattleRecord is idempotent and does not mutate the input", () => {
  const m: Monster = { ...baseBaby(), battleRecord: { wins: 4, losses: 1, draws: 2, streak: 1 } };
  const once = normalizeBattleRecord(m);
  const twice = normalizeBattleRecord(once);
  assert.deepEqual(once.battleRecord, { wins: 4, losses: 1, draws: 2, streak: 1 });
  assert.deepEqual(twice.battleRecord, once.battleRecord, "idempotent");
  assert.notEqual(once, m, "new object");
});

/* -------------------------------------------------------------------------- */
/* validateMonster back-compat                                                 */
/* -------------------------------------------------------------------------- */

test("validateMonster accepts a legacy monster with NO battleRecord field", () => {
  assert.equal(validateMonster(legacyMonster()), true);
});

test("validateMonster accepts a monster with a valid battleRecord", () => {
  assert.equal(
    validateMonster({ ...baseBaby(), battleRecord: { wins: 1, losses: 2, draws: 3, streak: 0 } }),
    true,
  );
});

test("validateMonster rejects a monster whose battleRecord member is malformed", () => {
  assert.equal(
    validateMonster({ ...baseBaby(), battleRecord: { wins: Number.NaN } as unknown as BattleRecord }),
    false,
    "NaN member",
  );
  assert.equal(
    validateMonster({ ...baseBaby(), battleRecord: { wins: "1" } as unknown as BattleRecord }),
    false,
    "string member",
  );
  assert.equal(
    validateMonster({ ...baseBaby(), battleRecord: 5 as unknown as BattleRecord }),
    false,
    "non-object record",
  );
});
