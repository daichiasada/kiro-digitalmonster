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
  DIFFICULTIES,
  LOW_HP_BATTLE_PERCENT,
  PET_DAILY_CAP,
  affectionLevelLabel,
  affectionPercent,
  babySpeechText,
  battleLogJa,
  battleLogLine,
  battleLogLineJa,
  battleLogList,
  battleRecordSummary,
  busyStatusLabel,
  canChat,
  difficultyLabel,
  isLowHp,
  pickBattleSeed,
  canPet,
  canPetNow,
  careEffect,
  dayStamp,
  evolutionReqAriaLabel,
  formLabel,
  formatDuration,
  formatDurationJa,
  formatMinutes,
  formatMinutesJa,
  fullnessPercent,
  recommendLabelKey,
  hpPercent,
  isHungerCaution,
  latestMonsterReply,
  nextPetRecord,
  petCapReachedLabel,
  petSpriteLabel,
  petsRemaining,
  parseZukan,
  recordMonsterAppearance,
  zukanCountLabel,
  daysRaisedLabel,
  firstSeenDateLabel,
  ZUKAN_STORAGE_KEY,
  chatStorageKey,
  parseChatLog,
  serializeChatLog,
  readPetRecord,
  moodLabel,
  moodLabelJa,
  onboardingCta,
  parseBattleEvents,
  playerStartHpFromLog,
  resolveAnimationEnemy,
  shouldShowOnboarding,
  stageLabel,
  stageLabelJa,
  statBarPercent,
  timeOfDay,
  winnerLabel,
  winnerLabelJa,
  clampVolume,
  shouldPlaySound,
  soundTone,
  DEFAULT_SOUND_VOLUME,
  parseSettings,
  DEFAULT_SETTINGS,
  msUntilHungerCaution,
  hungerCautionTargetTimestamp,
  HUNGER_TICK_MS,
} from "./ui-helpers.ts";
import type { CareAction, SoundEvent, SoundTone } from "./ui-helpers.ts";
import {
  AFFECTION_COLD_THRESHOLD,
  AFFECTION_MAX,
  AFFECTION_WARM_THRESHOLD,
  HUNGRY_CAUTION_LEVEL,
  MAX_CHAT_TURNS,
  MAX_HUNGRY_LEVEL,
  battleRecordOf,
  createMonster,
  discoveredCount,
  evolutionProgress,
  monsterAppearanceKey,
  predictedNextForm,
} from "@ddm/shared";
import type { Monster } from "@ddm/shared";
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

test("monster naming (issue #36) keys have non-empty ja and en entries", () => {
  const nameKeys: MessageKey[] = [
    "name.firstRunTitle",
    "name.renameTitle",
    "name.label",
    "name.placeholder",
    "name.save",
    "name.skip",
    "name.cancel",
    "name.validation",
    "name.renameButton",
    "name.renameButtonAria",
  ];
  for (const key of nameKeys) {
    const ja = MESSAGES.ja[key];
    const en = MESSAGES.en[key];
    assert.equal(typeof ja, "string", `${key} ja missing`);
    assert.equal(typeof en, "string", `${key} en missing`);
    assert.ok(ja.length > 0, `${key} ja empty`);
    assert.ok(en.length > 0, `${key} en empty`);
  }
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

// --- Onboarding hint helpers -----------------------------------------------

test("shouldShowOnboarding truth table", () => {
  // Not onboarded + monster loaded => show.
  assert.equal(shouldShowOnboarding(false, true), true);
  // Already onboarded => never show, regardless of monster.
  assert.equal(shouldShowOnboarding(true, true), false);
  assert.equal(shouldShowOnboarding(true, false), false);
  // No monster yet => do not show even when not onboarded.
  assert.equal(shouldShowOnboarding(false, false), false);
});

// Minimal Monster factory for the pure evolutionProgress-driven CTA tests.
function makeMonster(overrides: Partial<Monster>): Monster {
  return {
    id: "test",
    name: "でじたん",
    stageId: "baby",
    stats: { hp: 20, maxHp: 20, atk: 5, def: 3 },
    trainingCount: 0,
    careCounters: { feed: 0, sleep: 0, clean: 0 },
    bornAt: 0,
    lastUpdatedAt: 0,
    isSleeping: false,
    dirty: false,
    hungryLevel: 0,
    ...overrides,
  };
}

test("onboardingCta summarizes a fresh baby's remaining training and minutes", () => {
  // bornAt == now => 0 elapsed; baby requires 2 training and 1 minute.
  const now = 1_000_000;
  const prog = evolutionProgress(makeMonster({ bornAt: now, trainingCount: 0 }), now);
  assert.equal(onboardingCta(prog, "ja"), "成長期まで あと トレーニング2回・1分");
  assert.equal(onboardingCta(prog, "en"), "To reach Rookie: 2 more training, 1 min");
});

test("onboardingCta clamps remaining training and minutes to >= 0", () => {
  const now = 10 * 60 * 1000; // 10 minutes elapsed, well past the 1-minute gate.
  const prog = evolutionProgress(makeMonster({ bornAt: 0, trainingCount: 5 }), now);
  assert.equal(onboardingCta(prog, "ja"), "成長期まで あと トレーニング0回・0分");
  assert.equal(onboardingCta(prog, "en"), "To reach Rookie: 0 more training, 0 min");
});

// --- Accessibility label helpers -------------------------------------------

test("evolutionReqAriaLabel returns the exact met/unmet strings per language", () => {
  assert.equal(evolutionReqAriaLabel(true, "ja"), "達成");
  assert.equal(evolutionReqAriaLabel(false, "ja"), "未達成");
  assert.equal(evolutionReqAriaLabel(true, "en"), "met");
  assert.equal(evolutionReqAriaLabel(false, "en"), "not met");
});

test("evolutionReqAriaLabel matches the i18n evolution keys", () => {
  assert.equal(evolutionReqAriaLabel(true, "ja"), t("ja", "evolution.met"));
  assert.equal(evolutionReqAriaLabel(false, "ja"), t("ja", "evolution.unmet"));
  assert.equal(evolutionReqAriaLabel(true, "en"), t("en", "evolution.met"));
  assert.equal(evolutionReqAriaLabel(false, "en"), t("en", "evolution.unmet"));
});

test("busyStatusLabel returns the localized working string", () => {
  assert.equal(busyStatusLabel("ja"), "処理中…");
  assert.equal(busyStatusLabel("en"), "Working…");
  assert.equal(busyStatusLabel("ja"), t("ja", "status.busy"));
  assert.equal(busyStatusLabel("en"), t("en", "status.busy"));
});

test("onboardingCta returns the final-stage line at the ultimate stage", () => {
  const now = 100 * 60 * 1000;
  const prog = evolutionProgress(makeMonster({ stageId: "ultimate", bornAt: 0 }), now);
  assert.equal(prog.isFinalStage, true);
  assert.equal(onboardingCta(prog, "ja"), "もう完全に育ちきっているよ！");
  assert.equal(onboardingCta(prog, "en"), "It's already fully grown!");
});

// --- Affection (なつき度) gauge helpers (issue #42) -------------------------

test("affectionPercent scales against AFFECTION_MAX, clamps, and rounds", () => {
  assert.equal(affectionPercent(0), 0);
  assert.equal(affectionPercent(AFFECTION_MAX), 100);
  assert.equal(affectionPercent(AFFECTION_MAX / 2), 50);
  assert.equal(affectionPercent(AFFECTION_MAX + 50), 100); // clamps above MAX
  assert.equal(affectionPercent(-10), 0); // clamps below 0
});

test("affectionPercent guards non-finite input to 0", () => {
  assert.equal(affectionPercent(Number.NaN), 0);
  assert.equal(affectionPercent(Number.POSITIVE_INFINITY), 0);
});

test("affectionLevelLabel returns the localized band label for each band", () => {
  // cold band: below the cold threshold.
  assert.equal(affectionLevelLabel(AFFECTION_COLD_THRESHOLD - 1, "ja"), "よそよそしい");
  assert.equal(affectionLevelLabel(AFFECTION_COLD_THRESHOLD - 1, "en"), "Distant");
  // neutral band: at the cold threshold, below the warm threshold.
  assert.equal(affectionLevelLabel(AFFECTION_COLD_THRESHOLD, "ja"), "ふつう");
  assert.equal(affectionLevelLabel(AFFECTION_COLD_THRESHOLD, "en"), "Friendly");
  assert.equal(affectionLevelLabel(AFFECTION_WARM_THRESHOLD - 1, "ja"), "ふつう");
  assert.equal(affectionLevelLabel(AFFECTION_WARM_THRESHOLD - 1, "en"), "Friendly");
  // warm band: at/above the warm threshold.
  assert.equal(affectionLevelLabel(AFFECTION_WARM_THRESHOLD, "ja"), "なかよし");
  assert.equal(affectionLevelLabel(AFFECTION_WARM_THRESHOLD, "en"), "Bonded");
});

test("affectionLevelLabel matches the i18n affection.* keys", () => {
  assert.equal(affectionLevelLabel(0, "ja"), t("ja", "affection.cold"));
  assert.equal(affectionLevelLabel(AFFECTION_COLD_THRESHOLD, "ja"), t("ja", "affection.neutral"));
  assert.equal(affectionLevelLabel(AFFECTION_MAX, "ja"), t("ja", "affection.warm"));
  assert.equal(affectionLevelLabel(0, "en"), t("en", "affection.cold"));
  assert.equal(affectionLevelLabel(AFFECTION_COLD_THRESHOLD, "en"), t("en", "affection.neutral"));
  assert.equal(affectionLevelLabel(AFFECTION_MAX, "en"), t("en", "affection.warm"));
});

// --- Pet (なでる) daily-cap helpers (issue #42) ----------------------------

test("dayStamp is deterministic YYYY-MM-DD for a fixed timestamp", () => {
  // Build a local-midday timestamp so the local date is unambiguous regardless
  // of the host timezone, then assert dayStamp echoes those local parts.
  const d = new Date(2026, 9, 5, 12, 0, 0); // 2026-10-05 local noon
  const stamp = dayStamp(d.getTime());
  assert.equal(stamp, "2026-10-05");
  // Same instant always yields the same stamp.
  assert.equal(dayStamp(d.getTime()), stamp);
});

test("dayStamp zero-pads single-digit months and days", () => {
  const d = new Date(2026, 0, 3, 9, 30, 0); // 2026-01-03 local
  assert.equal(dayStamp(d.getTime()), "2026-01-03");
});

// --- Time-of-day background phase (issue #43) ------------------------------

test("timeOfDay classifies each boundary hour into the right phase", () => {
  // night wraps midnight (20:00-04:59)
  assert.equal(timeOfDay(4), "night");
  assert.equal(timeOfDay(5), "morning");
  assert.equal(timeOfDay(9), "morning");
  assert.equal(timeOfDay(10), "day");
  assert.equal(timeOfDay(16), "day");
  assert.equal(timeOfDay(17), "evening");
  assert.equal(timeOfDay(19), "evening");
  assert.equal(timeOfDay(20), "night");
  assert.equal(timeOfDay(23), "night");
  assert.equal(timeOfDay(0), "night");
});

test("timeOfDay accepts a Date and reads its local hour", () => {
  // 08:00 local -> morning. Build with local parts so the host timezone is
  // irrelevant (getHours is local, matching the helper).
  assert.equal(timeOfDay(new Date(2026, 9, 5, 8, 0, 0)), "morning");
  assert.equal(timeOfDay(new Date(2026, 9, 5, 13, 0, 0)), "day");
  assert.equal(timeOfDay(new Date(2026, 9, 5, 18, 0, 0)), "evening");
  assert.equal(timeOfDay(new Date(2026, 9, 5, 2, 0, 0)), "night");
});

test("timeOfDay falls back to 'day' for non-finite input", () => {
  assert.equal(timeOfDay(Number.NaN), "day");
  assert.equal(timeOfDay(Number.POSITIVE_INFINITY), "day");
});

test("readPetRecord returns a zero-count record for null/empty raw", () => {
  const now = new Date(2026, 9, 5, 8, 0, 0).getTime();
  assert.deepEqual(readPetRecord(null, now), { day: "2026-10-05", count: 0 });
  assert.deepEqual(readPetRecord("", now), { day: "2026-10-05", count: 0 });
});

test("readPetRecord keeps a same-day stored count", () => {
  const now = new Date(2026, 9, 5, 8, 0, 0).getTime();
  const raw = JSON.stringify({ day: "2026-10-05", count: 3 });
  assert.deepEqual(readPetRecord(raw, now), { day: "2026-10-05", count: 3 });
});

test("readPetRecord resets the count on a new day", () => {
  const now = new Date(2026, 9, 5, 8, 0, 0).getTime();
  const raw = JSON.stringify({ day: "2026-10-04", count: 5 });
  assert.deepEqual(readPetRecord(raw, now), { day: "2026-10-05", count: 0 });
});

test("readPetRecord resets on malformed JSON", () => {
  const now = new Date(2026, 9, 5, 8, 0, 0).getTime();
  assert.deepEqual(readPetRecord("not json", now), { day: "2026-10-05", count: 0 });
});

test("petsRemaining / canPet at 0, under cap, and at cap", () => {
  const now = new Date(2026, 9, 5, 8, 0, 0).getTime();
  const today = dayStamp(now);
  // Fresh (0 used): full cap remaining, can pet.
  assert.equal(petsRemaining({ day: today, count: 0 }, now), PET_DAILY_CAP);
  assert.equal(canPet({ day: today, count: 0 }, now), true);
  // Under cap: still has remaining and can pet.
  assert.equal(petsRemaining({ day: today, count: PET_DAILY_CAP - 1 }, now), 1);
  assert.equal(canPet({ day: today, count: PET_DAILY_CAP - 1 }, now), true);
  // At cap: none remaining, cannot pet.
  assert.equal(petsRemaining({ day: today, count: PET_DAILY_CAP }, now), 0);
  assert.equal(canPet({ day: today, count: PET_DAILY_CAP }, now), false);
  // Over cap (defensive): clamped to 0, cannot pet.
  assert.equal(petsRemaining({ day: today, count: PET_DAILY_CAP + 3 }, now), 0);
  assert.equal(canPet({ day: today, count: PET_DAILY_CAP + 3 }, now), false);
});

test("petsRemaining / canPet treat a prior-day record as a fresh day", () => {
  const now = new Date(2026, 9, 5, 8, 0, 0).getTime();
  const stale = { day: "2026-10-04", count: PET_DAILY_CAP };
  assert.equal(petsRemaining(stale, now), PET_DAILY_CAP);
  assert.equal(canPet(stale, now), true);
});

test("nextPetRecord increments today's count and resets on a new day", () => {
  const now = new Date(2026, 9, 5, 8, 0, 0).getTime();
  const today = dayStamp(now);
  // Same-day increment.
  assert.deepEqual(nextPetRecord({ day: today, count: 2 }, now), { day: today, count: 3 });
  // From zero.
  assert.deepEqual(nextPetRecord({ day: today, count: 0 }, now), { day: today, count: 1 });
  // Prior-day record resets to a 1-count record for today.
  assert.deepEqual(
    nextPetRecord({ day: "2026-10-04", count: PET_DAILY_CAP }, now),
    { day: today, count: 1 },
  );
});

test("canPetNow is true only when a finite, positive number of pets remain", () => {
  assert.equal(canPetNow(PET_DAILY_CAP), true);
  assert.equal(canPetNow(1), true);
  assert.equal(canPetNow(0), false);
  assert.equal(canPetNow(-1), false);
  // Non-finite input is treated as "unavailable" defensively.
  assert.equal(canPetNow(Number.NaN), false);
  assert.equal(canPetNow(Number.POSITIVE_INFINITY), false);
});

test("petSpriteLabel invites petting while pets remain, else shows the cap message", () => {
  // Pets remaining -> the "なでる" action label (JA/EN).
  assert.equal(petSpriteLabel(1, "ja"), t("ja", "action.petAria"));
  assert.equal(petSpriteLabel(PET_DAILY_CAP, "ja"), "なでる");
  assert.equal(petSpriteLabel(1, "en"), t("en", "action.petAria"));
  assert.equal(petSpriteLabel(PET_DAILY_CAP, "en"), "Pet");
  // Cap reached (0 or less) -> the cap-reached message (JA/EN), NOT "なでる".
  assert.equal(petSpriteLabel(0, "ja"), t("ja", "action.petCapReached"));
  assert.equal(petSpriteLabel(0, "ja"), "きょうはもう十分なでたよ");
  assert.equal(petSpriteLabel(0, "en"), t("en", "action.petCapReached"));
  assert.equal(petSpriteLabel(0, "en"), "You've petted it enough for today");
  assert.notEqual(petSpriteLabel(0, "ja"), petSpriteLabel(1, "ja"));
});

test("petCapReachedLabel sources the cap message from the action.petCapReached key", () => {
  assert.equal(petCapReachedLabel("ja"), t("ja", "action.petCapReached"));
  assert.equal(petCapReachedLabel("en"), t("en", "action.petCapReached"));
});

// --- Battle enhancements (難易度・プレビュー・戦績) — issue #41 --------------

test("DIFFICULTIES lists the three difficulties in easy->normal->hard order", () => {
  assert.deepEqual(DIFFICULTIES, ["easy", "normal", "hard"]);
});

test("difficultyLabel returns the JA labels 弱い/普通/強い for each difficulty", () => {
  assert.equal(difficultyLabel("easy", "ja"), "弱い");
  assert.equal(difficultyLabel("normal", "ja"), "普通");
  assert.equal(difficultyLabel("hard", "ja"), "強い");
});

test("difficultyLabel returns the EN labels Easy/Normal/Hard for each difficulty", () => {
  assert.equal(difficultyLabel("easy", "en"), "Easy");
  assert.equal(difficultyLabel("normal", "en"), "Normal");
  assert.equal(difficultyLabel("hard", "en"), "Hard");
});

test("difficultyLabel is sourced from the difficulty.* i18n keys", () => {
  for (const d of DIFFICULTIES) {
    assert.equal(difficultyLabel(d, "ja"), t("ja", `difficulty.${d}` as const));
    assert.equal(difficultyLabel(d, "en"), t("en", `difficulty.${d}` as const));
  }
});

test("battleRecordSummary formats a sample record exactly (JA and EN)", () => {
  const record = { wins: 3, losses: 1, draws: 0, streak: 2 };
  assert.equal(battleRecordSummary(record, "ja"), "3勝 1敗 0分 / 連勝2");
  assert.equal(battleRecordSummary(record, "en"), "3W 1L 0D / Streak 2");
});

test("battleRecordSummary reads a legacy (undefined-record) monster safely via battleRecordOf", () => {
  // A pre-#41 save lacks the battleRecord field; battleRecordOf defaults it to
  // all-zeros so the summary renders without throwing.
  const legacy = {} as Monster;
  const record = battleRecordOf(legacy);
  assert.deepEqual(record, { wins: 0, losses: 0, draws: 0, streak: 0 });
  assert.equal(battleRecordSummary(record, "ja"), "0勝 0敗 0分 / 連勝0");
  assert.equal(battleRecordSummary(record, "en"), "0W 0L 0D / Streak 0");
});

test("isLowHp is true strictly below the threshold and false at/above it", () => {
  // LOW_HP_BATTLE_PERCENT is 30. hpPercent rounds, so pick values whose
  // rounded percentage lands just below / at / above the threshold.
  assert.equal(LOW_HP_BATTLE_PERCENT, 30);
  // 29% < 30 -> low.
  assert.equal(isLowHp(29, 100), true);
  // Exactly 30% is NOT below the threshold -> not low.
  assert.equal(isLowHp(30, 100), false);
  // 31% -> not low.
  assert.equal(isLowHp(31, 100), false);
  // Full HP -> not low.
  assert.equal(isLowHp(100, 100), false);
  // 0 HP -> low.
  assert.equal(isLowHp(0, 100), true);
});

test("isLowHp guards against a non-positive maxHp (treated as low)", () => {
  // hpPercent returns 0% for maxHp <= 0, which is below the threshold.
  assert.equal(isLowHp(10, 0), true);
  assert.equal(isLowHp(10, -5), true);
});

test("pickBattleSeed returns a finite integer within [0, 0xffffffff]", () => {
  // Do NOT assert the random value itself; only that it is in range and an int.
  for (let i = 0; i < 100; i += 1) {
    const seed = pickBattleSeed();
    assert.equal(Number.isFinite(seed), true);
    assert.equal(Number.isInteger(seed), true);
    assert.ok(seed >= 0, `seed ${seed} below 0`);
    assert.ok(seed <= 0xffffffff, `seed ${seed} above 0xffffffff`);
  }
});

// --- Replay enemy snapshot (issue #41 review v1 regression) -----------------
// The BattlePanel reseeds the preview the instant a fight is dispatched so a
// repeat fight faces a fresh enemy. The #9 replay must still animate the enemy
// that was ACTUALLY fought, so BattlePanel snapshots that enemy at dispatch and
// the replay resolves it via resolveAnimationEnemy. These tests encode that
// contract at the pure level; the first one FAILS under the old
// reseed-before-animate behavior (which fed the live, already-reseeded preview
// straight into the replay).

test("resolveAnimationEnemy falls back to the live preview before any fight", () => {
  const preview = { name: "普通 野生の成熟期モンスター", maxHp: 70 };
  // No fight dispatched yet: nothing to snapshot, so the preview is used.
  assert.deepEqual(resolveAnimationEnemy(preview, null), preview);
});

test("resolveAnimationEnemy prefers the fought snapshot over a reseeded preview", () => {
  // Enemy that was actually fought (snapshot captured at dispatch time).
  const fought = { name: "強い 野生の成熟期モンスター", maxHp: 73 };
  // The live preview AFTER the post-dispatch reseed: a DIFFERENT enemy with a
  // different maxHp. Under the old bug this stale-reseeded preview scaled the
  // replay HP bar; the fix must ignore it in favor of the fought snapshot.
  const reseededPreview = { name: "弱い 野生の成熟期モンスター", maxHp: 61 };
  const resolved = resolveAnimationEnemy(reseededPreview, fought);
  assert.deepEqual(resolved, fought);
  // The replay must scale against the FOUGHT enemy's maxHp, never the reseeded
  // preview's; this is the exact scaling the review flagged as wrong.
  assert.equal(resolved.maxHp, 73);
  assert.notEqual(resolved.maxHp, reseededPreview.maxHp);
  // ...and depict the fought enemy's name, not the next preview's.
  assert.equal(resolved.name, "強い 野生の成熟期モンスター");
});

// --- Evolution branch labels + StatsPanel hint (issue #38) ------------------
// formLabel maps a MonsterForm to its localized label; the StatsPanel hint is
// composed from the SAME shared predictedNextForm/chooseEvolutionForm the
// engine uses to assign the form, so the displayed hint can never contradict
// the real evolution outcome.

test("formLabel returns the JA variant labels 攻撃/防御/やんちゃ", () => {
  assert.equal(formLabel("attack", "ja"), "攻撃");
  assert.equal(formLabel("defense", "ja"), "防御");
  assert.equal(formLabel("mischief", "ja"), "やんちゃ");
});

test("formLabel returns the EN variant labels Attack/Defense/Mischief", () => {
  assert.equal(formLabel("attack", "en"), "Attack");
  assert.equal(formLabel("defense", "en"), "Defense");
  assert.equal(formLabel("mischief", "en"), "Mischief");
});

test("formLabel is sourced from the form.* i18n keys", () => {
  for (const f of ["attack", "defense", "mischief"] as const) {
    assert.equal(formLabel(f, "ja"), t("ja", `form.${f}` as const));
    assert.equal(formLabel(f, "en"), t("en", `form.${f}` as const));
  }
});

test("formLabel returns an empty string for the base form (no branch label)", () => {
  // "base" is not a branch target, so it has no variant label; the StatsPanel
  // hint only renders when a concrete (non-base) variant is predicted, so an
  // empty label can never leak an empty hint.
  assert.equal(formLabel("base", "ja"), "");
  assert.equal(formLabel("base", "en"), "");
});

/**
 * Re-compose the StatsPanel evolution hint exactly as the component does:
 * derive the predicted next form from the shared predictedNextForm (same `now`)
 * and splice its localized label into the "stats.evolveHint" template. Returns
 * null when there is no concrete variant to hint at (final stage / base).
 */
function composeEvolveHint(monster: Monster, now: number, lang: Lang): string | null {
  const predicted = predictedNextForm(monster, now);
  const label = predicted !== null ? formLabel(predicted, lang) : "";
  if (label === "") {
    return null;
  }
  return t(lang, "stats.evolveHint").replace("{form}", label);
}

test("StatsPanel hint is derived from predictedNextForm for a training-heavy baby (attack)", () => {
  const now = 1_000_000;
  // Training-heavy care pushes the branch toward the attack type.
  const monster = makeMonster({ stageId: "baby", bornAt: now, trainingCount: 50 });
  // The hint must agree with the engine's own branch decision.
  assert.equal(predictedNextForm(monster, now), "attack");
  assert.equal(composeEvolveHint(monster, now, "ja"), "今の育て方だと攻撃型に進化しそう");
  assert.equal(
    composeEvolveHint(monster, now, "en"),
    "Current care is steering toward the Attack-type evolution",
  );
});

test("StatsPanel hint reflects a calm, affectionate baby (defense)", () => {
  const now = 1_000_000;
  const monster = makeMonster({
    stageId: "baby",
    bornAt: now,
    trainingCount: 0,
    careCounters: { feed: 30, sleep: 30, clean: 30 },
    affection: 100,
  });
  assert.equal(predictedNextForm(monster, now), "defense");
  assert.equal(composeEvolveHint(monster, now, "ja"), "今の育て方だと防御型に進化しそう");
  assert.equal(
    composeEvolveHint(monster, now, "en"),
    "Current care is steering toward the Defense-type evolution",
  );
});

test("StatsPanel hint reflects a neglected baby (mischief)", () => {
  const now = 1_000_000;
  // A freshly made baby (no training, neutral affection default) scores highest
  // on the neglect-driven mischief branch.
  const monster = makeMonster({ stageId: "baby", bornAt: now, hungryLevel: 6, dirty: true });
  assert.equal(predictedNextForm(monster, now), "mischief");
  assert.equal(composeEvolveHint(monster, now, "ja"), "今の育て方だとやんちゃ型に進化しそう");
  assert.equal(
    composeEvolveHint(monster, now, "en"),
    "Current care is steering toward the Mischief-type evolution",
  );
});

test("StatsPanel hint is hidden at the final stage (predictedNextForm null)", () => {
  const now = 100 * 60 * 1000;
  const monster = makeMonster({ stageId: "ultimate", bornAt: 0, trainingCount: 50 });
  assert.equal(predictedNextForm(monster, now), null);
  assert.equal(composeEvolveHint(monster, now, "ja"), null);
  assert.equal(composeEvolveHint(monster, now, "en"), null);
});

test("stats.evolveHint template has JA and EN entries with the {form} token", () => {
  for (const lang of ["ja", "en"] as const) {
    const tpl = t(lang, "stats.evolveHint");
    assert.ok(tpl.length > 0, `${lang} evolveHint empty`);
    assert.ok(tpl.includes("{form}"), `${lang} evolveHint missing {form} token`);
  }
});

// --- Monster zukan (図鑑) persistence glue — issue #39 ----------------------
// These exercise ONLY the PURE parse/merge glue. They never touch localStorage
// so the suite stays DOM/storage-free under the plain Node test runner.

test("ZUKAN_STORAGE_KEY is the dedicated ddm.zukan key", () => {
  assert.equal(ZUKAN_STORAGE_KEY, "ddm.zukan");
});

test("parseZukan returns an empty zukan for null / empty input", () => {
  assert.deepEqual(parseZukan(null), {});
  assert.deepEqual(parseZukan(""), {});
});

test("parseZukan returns an empty zukan for malformed JSON", () => {
  assert.deepEqual(parseZukan("not json"), {});
  assert.deepEqual(parseZukan("{ broken"), {});
});

test("parseZukan round-trips canonical entries and drops malformed ones (via sanitizeZukan)", () => {
  // Build a valid zukan by recording an appearance, then serialize it and
  // inject a non-canonical key + a malformed entry to confirm sanitizeZukan
  // (delegated to by parseZukan) keeps only the valid canonical entry.
  const now = 1_000_000_000_000;
  const baby = createMonster("m-rt", "でじたん", now);
  const zukan = recordMonsterAppearance({}, baby, now);
  const babyKey = monsterAppearanceKey(baby);

  const raw = JSON.parse(JSON.stringify(zukan)) as Record<string, unknown>;
  // Non-canonical key (unreachable base at rookie) -> dropped.
  raw["rookie:base"] = {
    key: "rookie:base",
    stageId: "rookie",
    form: "base",
    firstSeenAt: now,
    daysRaised: 0,
    name: "bogus",
  };
  // Malformed entry (bad field types) -> dropped.
  raw["champion:attack"] = { key: "champion:attack", stageId: "champion", form: "attack", firstSeenAt: "x", daysRaised: null, name: 5 };

  const parsed = parseZukan(JSON.stringify(raw));
  assert.deepEqual(Object.keys(parsed), [babyKey]);
  assert.equal(parsed[babyKey].name, "でじたん");
  assert.equal(parsed[babyKey].stageId, "baby");
  assert.equal(parsed[babyKey].form, "base");
});

test("recordMonsterAppearance merges baby -> evolved to 2 entries and re-records baby as a no-op", () => {
  const t0 = 1_000_000_000_000;
  const baby = createMonster("m-merge", "でじたん", t0);
  const evolved: Monster = {
    ...baby,
    stageId: "rookie",
    form: "attack",
    name: "しんか",
    lastUpdatedAt: t0 + 86_400_000,
  };

  // {} -> baby = 1 entry.
  const afterBaby = recordMonsterAppearance({}, baby, t0);
  assert.equal(discoveredCount(afterBaby), 1);

  // baby -> evolved = 2 entries.
  const afterEvolved = recordMonsterAppearance(afterBaby, evolved, t0 + 86_400_000);
  assert.equal(discoveredCount(afterEvolved), 2);

  // Re-recording the baby appearance is a pure no-op: same object identity
  // returned (shared recordAppearance returns the input unchanged) and the
  // count does not grow.
  const afterReBaby = recordMonsterAppearance(afterEvolved, baby, t0 + 999_999);
  assert.equal(afterReBaby, afterEvolved);
  assert.equal(discoveredCount(afterReBaby), 2);
});

// --- Zukan UI formatters (issue #39, FEAT-003) -----------------------------

test("zukanCountLabel substitutes {discovered} and {total} per language", () => {
  assert.equal(zukanCountLabel(3, 10, "ja"), "発見 3 / 10");
  assert.equal(zukanCountLabel(3, 10, "en"), "Discovered 3 / 10");
  // Zero / full extremes still substitute both placeholders.
  assert.equal(zukanCountLabel(0, 10, "ja"), "発見 0 / 10");
  assert.equal(zukanCountLabel(10, 10, "en"), "Discovered 10 / 10");
});

test("daysRaisedLabel appends the localized unit suffix", () => {
  // JA unit is 日 with no space; EN unit begins with a space.
  assert.equal(daysRaisedLabel(0, "ja"), "0日");
  assert.equal(daysRaisedLabel(5, "ja"), "5日");
  assert.equal(daysRaisedLabel(0, "en"), "0 days");
  assert.equal(daysRaisedLabel(5, "en"), "5 days");
});

test("firstSeenDateLabel returns a non-empty string for finite ms and '' for non-finite", () => {
  // Do NOT assert the exact locale string (locale-data-dependent); only that a
  // finite ms yields some text and non-finite input is guarded to ''.
  assert.ok(firstSeenDateLabel(1_000_000_000_000, "ja").length > 0);
  assert.ok(firstSeenDateLabel(1_000_000_000_000, "en").length > 0);
  assert.equal(firstSeenDateLabel(Number.NaN, "ja"), "");
  assert.equal(firstSeenDateLabel(Number.POSITIVE_INFINITY, "en"), "");
});

// --- Welcome-back / おかえり summary (issue #40) ----------------------------

test("formatDurationJa renders hours+minutes, omitting hours below 1h", () => {
  assert.equal(formatDurationJa(0), "0分");
  assert.equal(formatDurationJa(150_000), "2分"); // 2.5 min -> floor 2
  assert.equal(formatDurationJa(59 * 60_000), "59分");
  assert.equal(formatDurationJa(60 * 60_000), "1時間0分");
  assert.equal(formatDurationJa(125 * 60_000), "2時間5分");
});

test("formatDurationJa guards non-finite / negative input to 0分", () => {
  assert.equal(formatDurationJa(-1), "0分");
  assert.equal(formatDurationJa(Number.NaN), "0分");
  assert.equal(formatDurationJa(Number.POSITIVE_INFINITY), "0分");
});

test("formatDuration ja matches formatDurationJa; en uses h/m form", () => {
  assert.equal(formatDuration(125 * 60_000, "ja"), formatDurationJa(125 * 60_000));
  assert.equal(formatDuration(0, "en"), "0m");
  assert.equal(formatDuration(5 * 60_000, "en"), "5m");
  assert.equal(formatDuration(125 * 60_000, "en"), "2h 5m");
  assert.equal(formatDuration(-1, "en"), "0m");
  assert.equal(formatDuration(Number.NaN, "en"), "0m");
});

test("recommendLabelKey maps each care recommendation to its welcome key or null", () => {
  assert.equal(recommendLabelKey("feed"), "welcome.recommendFeed");
  assert.equal(recommendLabelKey("clean"), "welcome.recommendClean");
  assert.equal(recommendLabelKey("wake"), "welcome.recommendWake");
  assert.equal(recommendLabelKey("none"), null);
});

test("recommendLabelKey results resolve to real messages in both languages", () => {
  for (const rec of ["feed", "clean", "wake"] as const) {
    const key = recommendLabelKey(rec);
    assert.notEqual(key, null);
    if (key !== null) {
      // The key must exist in both dictionaries (non-empty, not the raw key).
      assert.ok(t("ja", key).length > 0);
      assert.ok(t("en", key).length > 0);
      assert.notEqual(t("ja", key), key);
    }
  }
});

// --- Chat transcript persistence glue — issue #37 ---------------------------
// Pure parse/serialize/key helpers only; these never touch localStorage so the
// suite stays DOM/storage-free under the plain Node test runner.

test("chatStorageKey returns the per-monster ddm.chat.<id> key", () => {
  assert.equal(chatStorageKey("abc"), "ddm.chat.abc");
  assert.equal(chatStorageKey("m-123"), "ddm.chat.m-123");
});

test("parseChatLog returns [] for null / empty input", () => {
  assert.deepEqual(parseChatLog(null), []);
  assert.deepEqual(parseChatLog(""), []);
});

test("parseChatLog returns [] for malformed JSON or non-array payloads", () => {
  assert.deepEqual(parseChatLog("not json"), []);
  assert.deepEqual(parseChatLog("{ broken"), []);
  assert.deepEqual(parseChatLog('{"role":"player","text":"hi"}'), []);
  assert.deepEqual(parseChatLog("42"), []);
});

test("parseChatLog keeps well-formed lines and preserves monster modelId", () => {
  const raw = JSON.stringify([
    { role: "player", text: "hello" },
    { role: "monster", text: "hi there", modelId: "claude-x" },
  ]);
  assert.deepEqual(parseChatLog(raw), [
    { role: "player", text: "hello" },
    { role: "monster", text: "hi there", modelId: "claude-x" },
  ]);
});

test("parseChatLog drops entries with a bad role, non-string text, or non-object shape", () => {
  const raw = JSON.stringify([
    { role: "player", text: "keep me" },
    { role: "system", text: "bad role" },
    { role: "monster", text: 123 },
    "a string",
    null,
    { role: "monster", text: "ok", modelId: 7 },
  ]);
  // The last entry survives but with a non-string modelId stripped.
  assert.deepEqual(parseChatLog(raw), [
    { role: "player", text: "keep me" },
    { role: "monster", text: "ok" },
  ]);
});

test("serializeChatLog round-trips through parseChatLog", () => {
  const log = [
    { role: "player" as const, text: "q1" },
    { role: "monster" as const, text: "a1", modelId: "m1" },
  ];
  assert.deepEqual(parseChatLog(serializeChatLog(log)), log);
});

test("serializeChatLog trims to the most recent MAX_CHAT_TURNS lines", () => {
  const log = Array.from({ length: MAX_CHAT_TURNS + 5 }, (_, i) => ({
    role: (i % 2 === 0 ? "player" : "monster") as "player" | "monster",
    text: `t${i}`,
  }));
  const parsed = parseChatLog(serializeChatLog(log));
  assert.equal(parsed.length, MAX_CHAT_TURNS);
  // The kept window is the LAST MAX_CHAT_TURNS entries (most recent).
  assert.equal(parsed[0].text, `t${log.length - MAX_CHAT_TURNS}`);
  assert.equal(parsed[parsed.length - 1].text, `t${log.length - 1}`);
});

test("serializeChatLog leaves a short log untrimmed", () => {
  const log = [
    { role: "player" as const, text: "only" },
    { role: "monster" as const, text: "two" },
  ];
  assert.equal(parseChatLog(serializeChatLog(log)).length, 2);
});

// --- Sound effect pure helpers (issue #45) ------------------------------------
// Only the DOM/React-free logic is tested here; the AudioContext engine in
// sound.ts is intentionally NOT imported or unit-tested.

test("clampVolume clamps out-of-range values into [0, 1]", () => {
  assert.equal(clampVolume(-0.5), 0);
  assert.equal(clampVolume(-100), 0);
  assert.equal(clampVolume(1.5), 1);
  assert.equal(clampVolume(100), 1);
  assert.equal(clampVolume(0), 0);
  assert.equal(clampVolume(1), 1);
});

test("clampVolume passes mid-range values through unchanged", () => {
  assert.equal(clampVolume(0.25), 0.25);
  assert.equal(clampVolume(0.5), 0.5);
  assert.equal(clampVolume(0.9), 0.9);
});

test("clampVolume guards non-finite input to the default volume", () => {
  assert.equal(clampVolume(Number.NaN), DEFAULT_SOUND_VOLUME);
  assert.equal(clampVolume(Number.POSITIVE_INFINITY), DEFAULT_SOUND_VOLUME);
  assert.equal(clampVolume(Number.NEGATIVE_INFINITY), DEFAULT_SOUND_VOLUME);
});

test("shouldPlaySound is false unless enabled AND volume > 0", () => {
  // Disabled: never plays, regardless of volume.
  assert.equal(shouldPlaySound(false, 1), false);
  assert.equal(shouldPlaySound(false, 0), false);
  // Enabled but muted (volume 0): still silent.
  assert.equal(shouldPlaySound(true, 0), false);
  // Enabled with audible volume: plays.
  assert.equal(shouldPlaySound(true, 0.5), true);
  assert.equal(shouldPlaySound(true, 1), true);
});

test("shouldPlaySound clamps negative volume to silent and NaN to the default", () => {
  // Negative volume clamps to 0 -> not audible.
  assert.equal(shouldPlaySound(true, -1), false);
  // NaN clamps to the (positive) default volume -> audible when enabled.
  assert.equal(shouldPlaySound(true, Number.NaN), true);
});

test("soundTone defines a short tone config for every SoundEvent", () => {
  const events: SoundEvent[] = ["feed", "train", "hit", "win", "lose", "draw", "evolve"];
  const assertShortTone = (tone: SoundTone) => {
    assert.ok(tone.freq > 0, "freq must be positive");
    assert.ok(tone.durationMs > 0, "duration must be positive");
    assert.ok(tone.durationMs <= 250, "per-note duration must stay short (<= 250ms)");
    assert.ok(tone.gain > 0 && tone.gain <= 1, "gain must be within (0, 1]");
    assert.equal(typeof tone.type, "string");
  };
  for (const event of events) {
    const config = soundTone(event);
    const steps: SoundTone[] = Array.isArray(config) ? config : [config];
    assert.ok(steps.length > 0, `${event} must have at least one note`);
    for (const step of steps) {
      assertShortTone(step);
    }
  }
});

test("win and evolve are multi-note arpeggios; single events are one note", () => {
  assert.ok(Array.isArray(soundTone("win")), "win is an arpeggio");
  assert.ok(Array.isArray(soundTone("evolve")), "evolve is an arpeggio");
  assert.equal(Array.isArray(soundTone("feed")), false, "feed is a single note");
  assert.equal(Array.isArray(soundTone("hit")), false, "hit is a single note");
});

// --- parseSettings (issue #45) ---------------------------------------------

test("parseSettings round-trips a valid settings blob", () => {
  const raw = JSON.stringify({
    sfxEnabled: true,
    volume: 0.3,
    reducedMotion: true,
    notificationsEnabled: true,
  });
  assert.deepEqual(parseSettings(raw), {
    sfxEnabled: true,
    volume: 0.3,
    reducedMotion: true,
    notificationsEnabled: true,
  });
});

test("parseSettings returns defaults for null and invalid JSON", () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("not json"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("{broken"), DEFAULT_SETTINGS);
  // Valid JSON that is not an object also falls back to defaults.
  assert.deepEqual(parseSettings("42"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("null"), DEFAULT_SETTINGS);
});

test("parseSettings clamps out-of-range volume via clampVolume", () => {
  assert.equal(parseSettings(JSON.stringify({ volume: 5 })).volume, 1);
  assert.equal(parseSettings(JSON.stringify({ volume: -2 })).volume, 0);
  // NaN serializes to null, which is not a number -> default volume.
  assert.equal(parseSettings(JSON.stringify({ volume: Number.NaN })).volume, DEFAULT_SETTINGS.volume);
});

test("parseSettings coerces non-boolean flags to their defaults", () => {
  const parsed = parseSettings(JSON.stringify({ sfxEnabled: "yes", reducedMotion: 1 }));
  assert.equal(parsed.sfxEnabled, DEFAULT_SETTINGS.sfxEnabled);
  assert.equal(parsed.reducedMotion, DEFAULT_SETTINGS.reducedMotion);
});

test("parseSettings fills missing fields from the defaults", () => {
  // Only sfxEnabled provided: volume and reducedMotion come from defaults.
  assert.deepEqual(parseSettings(JSON.stringify({ sfxEnabled: true })), {
    sfxEnabled: true,
    volume: DEFAULT_SETTINGS.volume,
    reducedMotion: DEFAULT_SETTINGS.reducedMotion,
    notificationsEnabled: DEFAULT_SETTINGS.notificationsEnabled,
  });
  // Empty object yields the full defaults.
  assert.deepEqual(parseSettings("{}"), DEFAULT_SETTINGS);
});

// --- parseSettings notificationsEnabled (issue #44) ------------------------

test("parseSettings defaults notificationsEnabled to false when the key is missing", () => {
  // A stored blob predating the field (e.g. only the pre-#44 keys) must parse
  // to notificationsEnabled: false without throwing (backward compatible).
  const legacy = JSON.stringify({ sfxEnabled: true, volume: 0.3, reducedMotion: true });
  assert.equal(parseSettings(legacy).notificationsEnabled, false);
  // The default itself is OFF.
  assert.equal(DEFAULT_SETTINGS.notificationsEnabled, false);
  assert.equal(parseSettings("{}").notificationsEnabled, false);
  assert.equal(parseSettings(null).notificationsEnabled, false);
});

test("parseSettings preserves an explicit notificationsEnabled true/false", () => {
  assert.equal(
    parseSettings(JSON.stringify({ notificationsEnabled: true })).notificationsEnabled,
    true,
  );
  assert.equal(
    parseSettings(JSON.stringify({ notificationsEnabled: false })).notificationsEnabled,
    false,
  );
});

test("parseSettings coerces a non-boolean notificationsEnabled to the default", () => {
  assert.equal(
    parseSettings(JSON.stringify({ notificationsEnabled: "yes" })).notificationsEnabled,
    DEFAULT_SETTINGS.notificationsEnabled,
  );
  assert.equal(
    parseSettings(JSON.stringify({ notificationsEnabled: 1 })).notificationsEnabled,
    DEFAULT_SETTINGS.notificationsEnabled,
  );
  assert.equal(
    parseSettings(JSON.stringify({ notificationsEnabled: null })).notificationsEnabled,
    DEFAULT_SETTINGS.notificationsEnabled,
  );
});

test("parseSettings keeps existing fields intact when notificationsEnabled is added", () => {
  const raw = JSON.stringify({
    sfxEnabled: true,
    volume: 0.25,
    reducedMotion: true,
    notificationsEnabled: true,
  });
  assert.deepEqual(parseSettings(raw), {
    sfxEnabled: true,
    volume: 0.25,
    reducedMotion: true,
    notificationsEnabled: true,
  });
});

// --- msUntilHungerCaution (issue #44) --------------------------------------

test("msUntilHungerCaution returns 0 when already at/over caution", () => {
  const now = 1_000_000;
  // Exactly at the caution level.
  assert.equal(
    msUntilHungerCaution({ hungryLevel: 7, lastUpdatedAt: now, isSleeping: false }, now),
    0,
  );
  // Over the caution level (and even capped/high values).
  assert.equal(
    msUntilHungerCaution({ hungryLevel: 9, lastUpdatedAt: now, isSleeping: false }, now),
    0,
  );
  assert.equal(
    msUntilHungerCaution({ hungryLevel: 10, lastUpdatedAt: now, isSleeping: false }, now),
    0,
  );
});

test("msUntilHungerCaution returns N*HUNGER_TICK_MS when N levels away and lastUpdatedAt === now", () => {
  const now = 2_000_000;
  // hungryLevel 7 - 0 = 7 levels remaining.
  assert.equal(
    msUntilHungerCaution({ hungryLevel: 0, lastUpdatedAt: now, isSleeping: false }, now),
    7 * HUNGER_TICK_MS,
  );
  // hungryLevel 7 - 4 = 3 levels remaining.
  assert.equal(
    msUntilHungerCaution({ hungryLevel: 4, lastUpdatedAt: now, isSleeping: false }, now),
    3 * HUNGER_TICK_MS,
  );
  // One level away.
  assert.equal(
    msUntilHungerCaution({ hungryLevel: 6, lastUpdatedAt: now, isSleeping: false }, now),
    1 * HUNGER_TICK_MS,
  );
});

test("msUntilHungerCaution reduces the remaining time by elapsed since lastUpdatedAt", () => {
  const lastUpdatedAt = 5_000_000;
  // 3 levels remaining (hungryLevel 4). Half a tick has already elapsed, so the
  // remaining time is 3 ticks minus the half-tick elapsed.
  const elapsed = HUNGER_TICK_MS / 2;
  const now = lastUpdatedAt + elapsed;
  assert.equal(
    msUntilHungerCaution({ hungryLevel: 4, lastUpdatedAt, isSleeping: false }, now),
    3 * HUNGER_TICK_MS - elapsed,
  );
  // When the projected target is already in the past, the result floors at 0.
  const wayLater = lastUpdatedAt + 100 * HUNGER_TICK_MS;
  assert.equal(
    msUntilHungerCaution({ hungryLevel: 4, lastUpdatedAt, isSleeping: false }, wayLater),
    0,
  );
});

test("msUntilHungerCaution returns null while sleeping (hunger does not rise)", () => {
  const now = 3_000_000;
  assert.equal(
    msUntilHungerCaution({ hungryLevel: 0, lastUpdatedAt: now, isSleeping: true }, now),
    null,
  );
  // Sleeping takes precedence even when already at caution.
  assert.equal(
    msUntilHungerCaution({ hungryLevel: 9, lastUpdatedAt: now, isSleeping: true }, now),
    null,
  );
});

test("msUntilHungerCaution returns null for non-finite inputs", () => {
  const now = 4_000_000;
  assert.equal(
    msUntilHungerCaution({ hungryLevel: Number.NaN, lastUpdatedAt: now, isSleeping: false }, now),
    null,
  );
  assert.equal(
    msUntilHungerCaution(
      { hungryLevel: 2, lastUpdatedAt: Number.POSITIVE_INFINITY, isSleeping: false },
      now,
    ),
    null,
  );
  assert.equal(
    msUntilHungerCaution(
      { hungryLevel: 2, lastUpdatedAt: now, isSleeping: false },
      Number.NaN,
    ),
    null,
  );
});

test("hungerCautionTargetTimestamp returns now + msUntil, or null when there is no projection", () => {
  const now = 6_000_000;
  // 7 levels away from a fresh (now) monster -> now + 7 ticks.
  assert.equal(
    hungerCautionTargetTimestamp({ hungryLevel: 0, lastUpdatedAt: now, isSleeping: false }, now),
    now + 7 * HUNGER_TICK_MS,
  );
  // Already at caution -> now + 0 = now.
  assert.equal(
    hungerCautionTargetTimestamp({ hungryLevel: 8, lastUpdatedAt: now, isSleeping: false }, now),
    now,
  );
  // Sleeping / non-finite -> null.
  assert.equal(
    hungerCautionTargetTimestamp({ hungryLevel: 0, lastUpdatedAt: now, isSleeping: true }, now),
    null,
  );
  assert.equal(
    hungerCautionTargetTimestamp(
      { hungryLevel: Number.NaN, lastUpdatedAt: now, isSleeping: false },
      now,
    ),
    null,
  );
});
