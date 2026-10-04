import { test } from "node:test";
import assert from "node:assert/strict";

import { simulateBattle } from "../battle.ts";
import { createMonster } from "../game.ts";
import type { Monster } from "../types.ts";

const T0 = 1_000_000_000_000;

function monster(name: string, overrides: Partial<Monster["stats"]>): Monster {
  const m = createMonster(`id-${name}`, name, T0);
  m.stats = { ...m.stats, ...overrides };
  return m;
}

test("a much stronger player beats a weaker enemy", () => {
  const player = monster("Strong", { hp: 100, maxHp: 100, atk: 40, def: 20 });
  const enemy = monster("Weak", { hp: 20, maxHp: 20, atk: 3, def: 1 });
  const result = simulateBattle(player, enemy, 42);
  assert.equal(result.winner, "player");
  assert.ok(result.playerHpAfter > 0);
  assert.equal(result.enemyHpAfter, 0);
  assert.ok(result.log.length > 0);
});

test("a much stronger enemy beats a weaker player", () => {
  const player = monster("Weak", { hp: 20, maxHp: 20, atk: 3, def: 1 });
  const enemy = monster("Strong", { hp: 100, maxHp: 100, atk: 40, def: 20 });
  const result = simulateBattle(player, enemy, 42);
  assert.equal(result.winner, "enemy");
  assert.equal(result.playerHpAfter, 0);
});

test("same seed yields identical results (deterministic)", () => {
  const player = monster("A", { hp: 50, maxHp: 50, atk: 15, def: 8 });
  const enemy = monster("B", { hp: 50, maxHp: 50, atk: 14, def: 9 });
  const r1 = simulateBattle(player, enemy, 123);
  const r2 = simulateBattle(player, enemy, 123);
  assert.deepEqual(r1, r2);
});

test("different seeds can produce different battle logs", () => {
  const player = monster("A", { hp: 50, maxHp: 50, atk: 15, def: 8 });
  const enemy = monster("B", { hp: 50, maxHp: 50, atk: 15, def: 8 });
  const r1 = simulateBattle(player, enemy, 1);
  const r2 = simulateBattle(player, enemy, 999999);
  // Not strictly guaranteed, but with these seeds the logs differ.
  assert.notDeepEqual(r1.log, r2.log);
});

test("battle always terminates and reports a valid winner", () => {
  const player = monster("Tank1", { hp: 200, maxHp: 200, atk: 1, def: 100 });
  const enemy = monster("Tank2", { hp: 200, maxHp: 200, atk: 1, def: 100 });
  const result = simulateBattle(player, enemy, 7);
  assert.ok(["player", "enemy", "draw"].includes(result.winner));
  assert.ok(result.turns <= 100);
});
