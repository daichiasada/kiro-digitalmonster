/**
 * Dependency-free unit tests for the pure frontend UI helpers.
 *
 * Run with:
 *   env -u NODE_OPTIONS node --experimental-strip-types --test src/game-ui.test.ts
 *
 * Keep DOM / React OUT of this file so it runs under the Node test runner
 * with zero external dependencies.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  battleLogJa,
  battleLogLineJa,
  canChat,
  hpPercent,
  moodLabelJa,
  stageLabelJa,
  statBarPercent,
  winnerLabelJa,
} from "./ui-helpers.ts";

test("stageLabelJa maps each stage to its Japanese label", () => {
  assert.equal(stageLabelJa("baby"), "幼年期");
  assert.equal(stageLabelJa("rookie"), "成長期");
  assert.equal(stageLabelJa("champion"), "成熟期");
  assert.equal(stageLabelJa("ultimate"), "完全体");
});

test("canChat is false only for the baby stage", () => {
  assert.equal(canChat("baby"), false);
  assert.equal(canChat("rookie"), true);
  assert.equal(canChat("champion"), true);
  assert.equal(canChat("ultimate"), true);
});

test("hpPercent clamps and rounds", () => {
  assert.equal(hpPercent(20, 20), 100);
  assert.equal(hpPercent(10, 20), 50);
  assert.equal(hpPercent(0, 20), 0);
  assert.equal(hpPercent(-5, 20), 0);
  assert.equal(hpPercent(30, 20), 100);
  assert.equal(hpPercent(1, 3), 33);
});

test("hpPercent guards against invalid maxHp", () => {
  assert.equal(hpPercent(10, 0), 0);
  assert.equal(hpPercent(10, -4), 0);
  assert.equal(hpPercent(Number.NaN, 20), 0);
});

test("statBarPercent scales against a reference and clamps", () => {
  assert.equal(statBarPercent(14, 28), 50);
  assert.equal(statBarPercent(40, 28), 100);
  assert.equal(statBarPercent(0, 28), 0);
  assert.equal(statBarPercent(10, 0), 0);
});

test("moodLabelJa reflects the monster state in priority order", () => {
  assert.equal(moodLabelJa({ isSleeping: true, dirty: true, hungryLevel: 9 }), "すやすや睡眠中");
  assert.equal(moodLabelJa({ isSleeping: false, dirty: true, hungryLevel: 9 }), "よごれている");
  assert.equal(moodLabelJa({ isSleeping: false, dirty: false, hungryLevel: 8 }), "とてもお腹がすいている");
  assert.equal(moodLabelJa({ isSleeping: false, dirty: false, hungryLevel: 4 }), "お腹がすいてきた");
  assert.equal(moodLabelJa({ isSleeping: false, dirty: false, hungryLevel: 0 }), "ごきげん");
});

test("winnerLabelJa maps each winner to a Japanese headline", () => {
  assert.equal(winnerLabelJa("player"), "勝利！ 🎉");
  assert.equal(winnerLabelJa("enemy"), "敗北… 💥");
  assert.equal(winnerLabelJa("draw"), "引き分け 🤝");
});

test("battleLogLineJa localizes a player attack turn line", () => {
  assert.equal(
    battleLogLineJa("T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)"),
    "1ターン目: でじたん の攻撃！ 野生の幼年期モンスター に 11 ダメージ（相手の残りHP 7）",
  );
});

test("battleLogLineJa localizes an enemy attack turn line", () => {
  assert.equal(
    battleLogLineJa("T2: 野生の幼年期モンスター hits でじたん for 2 (player HP 18)"),
    "2ターン目: 野生の幼年期モンスター の攻撃！ でじたん に 2 ダメージ（自分の残りHP 18）",
  );
});

test("battleLogLineJa localizes the result line for each winner", () => {
  assert.equal(battleLogLineJa("Result: player"), "結果: 勝利！ 🎉");
  assert.equal(battleLogLineJa("Result: enemy"), "結果: 敗北… 💥");
  assert.equal(battleLogLineJa("Result: draw"), "結果: 引き分け 🤝");
});

test("battleLogLineJa returns unknown lines unchanged", () => {
  assert.equal(battleLogLineJa("something unexpected"), "something unexpected");
});

test("battleLogJa localizes a full log", () => {
  const out = battleLogJa([
    "T1: でじたん hits 野生の幼年期モンスター for 9 (enemy HP 0)",
    "Result: player",
  ]);
  assert.deepEqual(out, [
    "1ターン目: でじたん の攻撃！ 野生の幼年期モンスター に 9 ダメージ（相手の残りHP 0）",
    "結果: 勝利！ 🎉",
  ]);
});
