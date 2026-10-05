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
  BABY_SPEECH_TEXT,
  BABY_SPEECH_TEXT_EN,
  babySpeechText,
  battleLogJa,
  battleLogLine,
  battleLogLineJa,
  battleLogList,
  canChat,
  careEffect,
  formatMinutes,
  formatMinutesJa,
  fullnessPercent,
  hpPercent,
  isHungerCaution,
  latestMonsterReply,
  moodLabel,
  moodLabelJa,
  parseBattleEvents,
  playerStartHpFromLog,
  stageLabel,
  stageLabelJa,
  statBarPercent,
  winnerLabel,
  winnerLabelJa,
} from "./ui-helpers.ts";
import type { CareAction } from "./ui-helpers.ts";
import { HUNGRY_CAUTION_LEVEL, MAX_HUNGRY_LEVEL } from "@ddm/shared";
import { DEFAULT_LANG, MESSAGES, t } from "./i18n.ts";
import type { Lang, MessageKey } from "./i18n.ts";

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

// The mood helpers are now HP-aware (issue #29): the signature requires a
// `stats: { hp, maxHp }` field. Full HP (20/20) is used here so the low-HP
// branch never fires and these previously-asserted outcomes are preserved.
test("moodLabelJa reflects the monster state in priority order", () => {
  assert.equal(moodLabelJa({ isSleeping: true, dirty: true, hungryLevel: 9, stats: { hp: 20, maxHp: 20 } }), "すやすや睡眠中");
  assert.equal(moodLabelJa({ isSleeping: false, dirty: true, hungryLevel: 9, stats: { hp: 20, maxHp: 20 } }), "よごれている");
  assert.equal(moodLabelJa({ isSleeping: false, dirty: false, hungryLevel: 8, stats: { hp: 20, maxHp: 20 } }), "とてもお腹がすいている");
  assert.equal(moodLabelJa({ isSleeping: false, dirty: false, hungryLevel: 4, stats: { hp: 20, maxHp: 20 } }), "お腹がすいてきた");
  assert.equal(moodLabelJa({ isSleeping: false, dirty: false, hungryLevel: 0, stats: { hp: 20, maxHp: 20 } }), "ごきげん");
});

test("winnerLabelJa maps each winner to a Japanese headline", () => {
  assert.equal(winnerLabelJa("player"), "勝利！ 🎉");
  assert.equal(winnerLabelJa("enemy"), "敗北… 💥");
  assert.equal(winnerLabelJa("draw"), "引き分け 🤝");
});

test("formatMinutesJa floors to whole minutes and guards bad input", () => {
  assert.equal(formatMinutesJa(0), "0分");
  assert.equal(formatMinutesJa(60000), "1分");
  assert.equal(formatMinutesJa(150000), "2分");
  assert.equal(formatMinutesJa(-1), "0分");
  assert.equal(formatMinutesJa(Number.NaN), "0分");
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

test("careEffect maps each care action to its exact visual-effect descriptor", () => {
  assert.deepEqual(careEffect("feed"), { className: "fx-feed", emoji: "🍖", durationMs: 700 });
  assert.deepEqual(careEffect("train"), { className: "fx-train", emoji: "💪", durationMs: 600 });
  assert.deepEqual(careEffect("sleep"), { className: "fx-sleep", emoji: "💤", durationMs: 700 });
  assert.deepEqual(careEffect("wake"), { className: "fx-wake", emoji: "⏰", durationMs: 600 });
  assert.deepEqual(careEffect("clean"), { className: "fx-clean", emoji: "✨", durationMs: 700 });
});

test("careEffect gives sleep and wake distinct cues", () => {
  // The sleep button is a toggle, so waking must not show the 💤 sleep cue.
  assert.notEqual(careEffect("sleep").emoji, careEffect("wake").emoji);
  assert.notEqual(careEffect("sleep").className, careEffect("wake").className);
});

test("careEffect returns a distinct className and emoji per action", () => {
  const actions: CareAction[] = ["feed", "train", "sleep", "wake", "clean"];
  const classNames = actions.map((a) => careEffect(a).className);
  const emojis = actions.map((a) => careEffect(a).emoji);
  assert.equal(new Set(classNames).size, actions.length);
  assert.equal(new Set(emojis).size, actions.length);
});

test("careEffect durations are short and non-blocking", () => {
  const actions: CareAction[] = ["feed", "train", "sleep", "wake", "clean"];
  for (const action of actions) {
    const { durationMs } = careEffect(action);
    assert.ok(durationMs > 0 && durationMs <= 1000, `${action} duration out of range`);
  }
});

test("parseBattleEvents maps a player-attack line to attacker player/defender enemy", () => {
  const { events, winner } = parseBattleEvents([
    "T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)",
  ]);
  assert.equal(winner, null);
  assert.deepEqual(events, [
    { turn: 1, attacker: "player", defender: "enemy", dmg: 11, defenderHpAfter: 7 },
  ]);
});

test("parseBattleEvents maps an enemy-attack line to attacker enemy/defender player", () => {
  const { events } = parseBattleEvents([
    "T2: 野生の幼年期モンスター hits でじたん for 2 (player HP 18)",
  ]);
  assert.deepEqual(events, [
    { turn: 2, attacker: "enemy", defender: "player", dmg: 2, defenderHpAfter: 18 },
  ]);
});

test("parseBattleEvents parses a full multi-turn log with a Result line", () => {
  const { events, winner } = parseBattleEvents([
    "T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)",
    "T2: 野生の幼年期モンスター hits でじたん for 2 (player HP 18)",
    "T3: でじたん hits 野生の幼年期モンスター for 7 (enemy HP 0)",
    "Result: player",
  ]);
  assert.equal(winner, "player");
  assert.deepEqual(events, [
    { turn: 1, attacker: "player", defender: "enemy", dmg: 11, defenderHpAfter: 7 },
    { turn: 2, attacker: "enemy", defender: "player", dmg: 2, defenderHpAfter: 18 },
    { turn: 3, attacker: "player", defender: "enemy", dmg: 7, defenderHpAfter: 0 },
  ]);
});

test("parseBattleEvents ignores unknown lines without throwing", () => {
  const { events, winner } = parseBattleEvents([
    "T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)",
    "something unexpected",
    "T2: 野生の幼年期モンスター hits でじたん for 2 (player HP 18)",
    "Result: enemy",
  ]);
  assert.equal(winner, "enemy");
  assert.deepEqual(events, [
    { turn: 1, attacker: "player", defender: "enemy", dmg: 11, defenderHpAfter: 7 },
    { turn: 2, attacker: "enemy", defender: "player", dmg: 2, defenderHpAfter: 18 },
  ]);
});

test("parseBattleEvents returns empty events and null winner for an empty log", () => {
  assert.deepEqual(parseBattleEvents([]), { events: [], winner: null });
});

test("parseBattleEvents leaves winner null when there is no Result line", () => {
  const { events, winner } = parseBattleEvents([
    "T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)",
  ]);
  assert.equal(winner, null);
  assert.equal(events.length, 1);
});

test("playerStartHpFromLog derives start HP from the first player-defender event", () => {
  // Player enters damaged: first time the player is hit it drops to 18 after a
  // 2-damage hit, so the pre-battle HP was 20 — not the max of 25.
  const log = [
    "T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)",
    "T2: 野生の幼年期モンスター hits でじたん for 2 (player HP 18)",
    "T3: でじたん hits 野生の幼年期モンスター for 7 (enemy HP 0)",
    "Result: player",
  ];
  assert.equal(playerStartHpFromLog(log, 25), 20);
});

test("playerStartHpFromLog uses the FIRST player-defender event when hit twice", () => {
  const log = [
    "T1: 野生の幼年期モンスター hits でじたん for 4 (player HP 16)",
    "T2: 野生の幼年期モンスター hits でじたん for 3 (player HP 13)",
    "Result: enemy",
  ];
  // First hit: 16 + 4 = 20, ignoring the later 13 + 3.
  assert.equal(playerStartHpFromLog(log, 25), 20);
});

test("playerStartHpFromLog falls back to max HP when the player is never hit", () => {
  const log = [
    "T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)",
    "T2: でじたん hits 野生の幼年期モンスター for 7 (enemy HP 0)",
    "Result: player",
  ];
  assert.equal(playerStartHpFromLog(log, 25), 25);
});

test("playerStartHpFromLog falls back to max HP for an empty log", () => {
  assert.equal(playerStartHpFromLog([], 25), 25);
});

test("latestMonsterReply returns null for an empty log", () => {
  assert.equal(latestMonsterReply([]), null);
});

test("latestMonsterReply returns null when the log has only player lines", () => {
  assert.equal(
    latestMonsterReply([
      { role: "player", text: "こんにちは" },
      { role: "player", text: "元気？" },
    ]),
    null,
  );
});

test("latestMonsterReply returns the single monster line text", () => {
  assert.equal(
    latestMonsterReply([
      { role: "player", text: "こんにちは" },
      { role: "monster", text: "やあ！" },
    ]),
    "やあ！",
  );
});

test("latestMonsterReply returns the LAST monster line when interleaved", () => {
  assert.equal(
    latestMonsterReply([
      { role: "player", text: "やあ" },
      { role: "monster", text: "こんにちは！" },
      { role: "player", text: "元気？" },
      { role: "monster", text: "とっても元気だよ！" },
      { role: "player", text: "よかった" },
    ]),
    "とっても元気だよ！",
  );
});

test("latestMonsterReply returns the baby canned text when it is the last monster line", () => {
  assert.equal(
    latestMonsterReply([
      { role: "player", text: "はなしかけてみる" },
      { role: "monster", text: BABY_SPEECH_TEXT },
    ]),
    "…！（まだ言葉を話せないみたい。もっと育ててあげよう！）",
  );
});

test("BABY_SPEECH_TEXT equals the exact backend canned non-verbal reply", () => {
  assert.equal(BABY_SPEECH_TEXT, "…！（まだ言葉を話せないみたい。もっと育ててあげよう！）");
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

// --- i18n / language-aware helpers ----------------------------------------

// Mood is HP-aware since issue #29, so each sample carries a `stats` block.
// Full HP (20/20) keeps the low-HP branch from firing, preserving the existing
// asserted mood outcomes below.
const SAMPLE_MONSTERS: ReadonlyArray<{
  isSleeping: boolean;
  dirty: boolean;
  hungryLevel: number;
  stats: { hp: number; maxHp: number };
}> = [
  { isSleeping: true, dirty: true, hungryLevel: 9, stats: { hp: 20, maxHp: 20 } },
  { isSleeping: false, dirty: true, hungryLevel: 9, stats: { hp: 20, maxHp: 20 } },
  { isSleeping: false, dirty: false, hungryLevel: 8, stats: { hp: 20, maxHp: 20 } },
  { isSleeping: false, dirty: false, hungryLevel: 4, stats: { hp: 20, maxHp: 20 } },
  { isSleeping: false, dirty: false, hungryLevel: 0, stats: { hp: 20, maxHp: 20 } },
];

const SAMPLE_LOG = [
  "T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)",
  "T2: 野生の幼年期モンスター hits でじたん for 2 (player HP 18)",
  "Result: player",
];

test("stageLabel('en') returns the English stage labels", () => {
  assert.equal(stageLabel("baby", "en"), "Baby");
  assert.equal(stageLabel("rookie", "en"), "Rookie");
  assert.equal(stageLabel("champion", "en"), "Champion");
  assert.equal(stageLabel("ultimate", "en"), "Ultimate");
});

test("stageLabel('ja') is byte-identical to stageLabelJa", () => {
  for (const id of ["baby", "rookie", "champion", "ultimate"] as const) {
    assert.equal(stageLabel(id, "ja"), stageLabelJa(id));
  }
});

test("winnerLabel('ja') equals winnerLabelJa and ('en') returns English headlines", () => {
  for (const w of ["player", "enemy", "draw"] as const) {
    assert.equal(winnerLabel(w, "ja"), winnerLabelJa(w));
  }
  assert.equal(winnerLabel("player", "en"), "Victory! 🎉");
  assert.equal(winnerLabel("enemy", "en"), "Defeat… 💥");
  assert.equal(winnerLabel("draw", "en"), "Draw 🤝");
});

test("battleLogLine('ja') equals battleLogLineJa for every sample line", () => {
  for (const line of SAMPLE_LOG) {
    assert.equal(battleLogLine(line, "ja"), battleLogLineJa(line));
  }
});

test("battleLogLine('en') renders English turn and result lines", () => {
  assert.equal(
    battleLogLine("T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)", "en"),
    "Turn 1: でじたん attacks! 野生の幼年期モンスター takes 11 damage (enemy HP 7)",
  );
  assert.equal(
    battleLogLine("T2: 野生の幼年期モンスター hits でじたん for 2 (player HP 18)", "en"),
    "Turn 2: 野生の幼年期モンスター attacks! でじたん takes 2 damage (player HP 18)",
  );
  assert.equal(battleLogLine("Result: player", "en"), "Result: Victory! 🎉");
  assert.equal(battleLogLine("Result: enemy", "en"), "Result: Defeat… 💥");
  assert.equal(battleLogLine("Result: draw", "en"), "Result: Draw 🤝");
});

test("battleLogLine('en') returns unknown lines unchanged", () => {
  assert.equal(battleLogLine("something unexpected", "en"), "something unexpected");
});

test("battleLogList('ja') equals battleLogJa", () => {
  assert.deepEqual(battleLogList(SAMPLE_LOG, "ja"), battleLogJa(SAMPLE_LOG));
});

test("formatMinutes('ja') equals formatMinutesJa and ('en') returns '{n} min'", () => {
  for (const ms of [0, 60000, 150000, -1, Number.NaN]) {
    assert.equal(formatMinutes(ms, "ja"), formatMinutesJa(ms));
  }
  assert.equal(formatMinutes(0, "en"), "0 min");
  assert.equal(formatMinutes(60000, "en"), "1 min");
  assert.equal(formatMinutes(150000, "en"), "2 min");
  assert.equal(formatMinutes(-1, "en"), "0 min");
  assert.equal(formatMinutes(Number.NaN, "en"), "0 min");
});

test("moodLabel('ja') equals moodLabelJa for all states", () => {
  for (const m of SAMPLE_MONSTERS) {
    assert.equal(moodLabel(m, "ja"), moodLabelJa(m));
  }
});

test("moodLabel('en') maps the same priority order to English", () => {
  assert.equal(moodLabel(SAMPLE_MONSTERS[0], "en"), "Sleeping soundly");
  assert.equal(moodLabel(SAMPLE_MONSTERS[1], "en"), "Dirty");
  assert.equal(moodLabel(SAMPLE_MONSTERS[2], "en"), "Very hungry");
  assert.equal(moodLabel(SAMPLE_MONSTERS[3], "en"), "Getting hungry");
  assert.equal(moodLabel(SAMPLE_MONSTERS[4], "en"), "Happy");
});

test("moodLabel surfaces the low-HP mood when HP is low (issue #29)", () => {
  // Not sleeping, not dirty, modest hunger, but HP at 20% (< 30% threshold):
  // the monster reads as unwell rather than merely hungry.
  const lowHp = { isSleeping: false, dirty: false, hungryLevel: 4, stats: { hp: 4, maxHp: 20 } };
  assert.equal(moodLabelJa(lowHp), "元気がない");
  assert.equal(moodLabel(lowHp, "ja"), "元気がない");
  assert.equal(moodLabel(lowHp, "en"), "Low energy");
});

test("mood priority is sleeping > dirty > low-HP > hunger", () => {
  const lowHp = { hp: 1, maxHp: 20 }; // ~5% -> below the low-HP threshold
  // Sleeping wins over everything, even dirty + low HP + starving.
  assert.equal(
    moodLabelJa({ isSleeping: true, dirty: true, hungryLevel: 10, stats: lowHp }),
    "すやすや睡眠中",
  );
  // Dirty wins over low HP + hunger when awake.
  assert.equal(
    moodLabelJa({ isSleeping: false, dirty: true, hungryLevel: 10, stats: lowHp }),
    "よごれている",
  );
  // Low HP wins over hunger when awake and clean.
  assert.equal(
    moodLabelJa({ isSleeping: false, dirty: false, hungryLevel: 10, stats: lowHp }),
    "元気がない",
  );
  // With healthy HP the same hunger shows the hunger mood instead.
  assert.equal(
    moodLabelJa({ isSleeping: false, dirty: false, hungryLevel: 10, stats: { hp: 20, maxHp: 20 } }),
    "とてもお腹がすいている",
  );
});

test("fullnessPercent maps hungryLevel to a fullness percentage", () => {
  assert.equal(fullnessPercent(0), 100); // full
  assert.equal(fullnessPercent(MAX_HUNGRY_LEVEL), 0); // starving
  assert.equal(fullnessPercent(5), 50); // mid (MAX=10)
  assert.equal(fullnessPercent(MAX_HUNGRY_LEVEL + 5), 0); // clamps above MAX
  assert.equal(fullnessPercent(-3), 100); // clamps below 0
});

test("fullnessPercent guards non-finite input to 0", () => {
  assert.equal(fullnessPercent(Number.NaN), 0);
  assert.equal(fullnessPercent(Number.POSITIVE_INFINITY), 0);
});

test("isHungerCaution is true at/above the caution threshold and false below", () => {
  assert.equal(isHungerCaution(HUNGRY_CAUTION_LEVEL), true);
  assert.equal(isHungerCaution(HUNGRY_CAUTION_LEVEL + 1), true);
  assert.equal(isHungerCaution(HUNGRY_CAUTION_LEVEL - 1), false);
  assert.equal(isHungerCaution(0), false);
});

test("babySpeechText returns the correct canned reply per language", () => {
  assert.equal(babySpeechText("ja"), BABY_SPEECH_TEXT);
  assert.equal(babySpeechText("en"), BABY_SPEECH_TEXT_EN);
  assert.notEqual(BABY_SPEECH_TEXT_EN, BABY_SPEECH_TEXT);
});

test("MESSAGES.ja and MESSAGES.en have identical key sets", () => {
  const jaKeys = Object.keys(MESSAGES.ja).sort();
  const enKeys = Object.keys(MESSAGES.en).sort();
  assert.deepEqual(jaKeys, enKeys);
});

test("chat.disabledHint has no stray leading/trailing whitespace in either language", () => {
  // The JA value must match the original inline literal byte-for-byte (the
  // JSX source stripped surrounding whitespace), so no leading space is allowed.
  const ja = t("ja", "chat.disabledHint");
  const en = t("en", "chat.disabledHint");
  assert.equal(ja, ja.trim());
  assert.equal(en, en.trim());
  assert.equal(
    ja,
    "幼年期のあいだはまだ言葉を話せません。トレーニングと時間経過で成長期へ進化すると会話できるようになります。",
  );
});

test("t() returns the dictionary value for a known key", () => {
  assert.equal(t("ja", "app.title"), "AIモンスター育成");
  assert.equal(t("en", "app.title"), "AI Monster Raising");
});

test("t() falls back to the JA value when a language is missing the key", () => {
  // Force a missing EN key via a cast to exercise the fallback path.
  const bogus = "nonexistent.key" as MessageKey;
  // When the key is absent from BOTH dictionaries, t() returns the key itself.
  assert.equal(t("en", bogus), "nonexistent.key");
  assert.equal(t("ja", bogus), "nonexistent.key");
});

test("t() never returns undefined for any defined key in any language", () => {
  const langs: Lang[] = ["ja", "en"];
  for (const lang of langs) {
    for (const key of Object.keys(MESSAGES.ja) as MessageKey[]) {
      const value = t(lang, key);
      assert.equal(typeof value, "string");
      assert.ok(value.length > 0, `${lang}:${key} is empty`);
    }
  }
});

test("DEFAULT_LANG is 'ja'", () => {
  assert.equal(DEFAULT_LANG, "ja");
});
