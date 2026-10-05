/**
 * Dependency-free in-house internationalization (i18n) layer.
 *
 * The dictionary and the pure {@link t} lookup contain NO DOM / React and are
 * safe to import from the Node built-in test runner. The React layer at the
 * bottom (context + provider + hook) is written WITHOUT JSX (using
 * `createElement`) and reads `localStorage` lazily/guarded so that importing
 * this module never touches `document`/`window` at module load time.
 */
import { createContext, createElement, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/** Supported UI languages. Japanese is the default. */
export type Lang = "ja" | "en";

/** localStorage key under which the selected language is persisted. */
export const LANG_STORAGE_KEY = "ddm.lang";

/** Default language when none is stored (or the stored value is invalid). */
export const DEFAULT_LANG: Lang = "ja";

/**
 * The complete Japanese message dictionary. This is the SOURCE OF TRUTH for
 * the set of message keys: {@link MessageKey} is derived from it, and the
 * English dictionary is type-checked to contain exactly the same keys.
 *
 * Japanese strings here are byte-identical to the literals previously inlined
 * in the components, so switching a component to `t()` must not change JA
 * output. Interpolation uses `{name}` placeholders resolved by callers.
 */
const JA_MESSAGES = {
  // App shell
  "app.title": "AIモンスター育成",
  "app.loading": "読み込み中…",
  "app.loadError": "モンスターを準備できませんでした。",
  "app.footer": "進化条件: トレーニング回数 ＋ 経過時間 ／ セーブは自動です",

  // Care panel
  "care.title": "お世話",
  "care.feed": "餌やり",
  "care.train": "トレーニング",
  "care.sleep": "睡眠",
  "care.wake": "起こす",
  "care.clean": "清掃",
  "care.hint": "トレーニングと時間経過で進化します。放っておくとお腹がすいて汚れます。",

  // Stats panel
  "stats.mood": "きぶん: ",
  "stats.hp": "HP",
  "stats.fullness": "満腹度",
  "stats.affection": "なつき度",
  "stats.atk": "攻撃",
  "stats.def": "防御",
  "stats.trainingCount": "トレーニング回数: ",
  "stats.record": "戦績",
  "stats.recordSummary": "{w}勝 {l}敗 {d}分 / 連勝{s}",

  // Affection (なつき度) band labels — see shared affectionBand (issue #42)
  "affection.cold": "よそよそしい",
  "affection.neutral": "ふつう",
  "affection.warm": "なかよし",

  // Pet (なでる) action — sprite tap/click (issue #42)
  "action.pet": "なでる",
  "action.petAria": "なでる",
  "action.petCapReached": "きょうはもう十分なでたよ",

  // Sprite-adjacent state badges (also used as accessible labels)
  "badge.hungry": "お腹がすいている",
  "badge.dirty": "よごれている",
  "badge.sleeping": "睡眠中",
  "stats.evolveTitle": "進化条件",
  "stats.finalStage": "最終段階（{stage}）",
  "stats.nextStage": "次の段階: ",
  "stats.training": "トレーニング ",
  "stats.elapsed": "経過 ",
  // Evolution branch hint + variant labels (issue #38)
  "stats.evolveHint": "今の育て方だと{form}型に進化しそう",
  "form.attack": "攻撃",
  "form.defense": "防御",
  "form.mischief": "やんちゃ",

  // Battle panel
  "battle.title": "バトル",
  "battle.start": "⚔️ 野生のモンスターと戦う",
  "battle.vs": "VS",
  "battle.enemyName": "野生の{label}モンスター",
  "battle.win": "勝利！ 🎉",
  "battle.lose": "敗北… 💥",
  "battle.draw": "引き分け 🤝",

  // Battle enhancements — difficulty / preview / low-HP (issue #41)
  "difficulty.label": "難易度",
  "difficulty.easy": "弱い",
  "difficulty.normal": "普通",
  "difficulty.hard": "強い",
  "battle.preview": "相手プレビュー",
  "battle.enemyNameWithDifficulty": "{difficulty} 野生の{label}モンスター",
  "battle.lowHpWarning": "HPが低い状態です。このまま挑戦しますか？",
  "battle.lowHpConfirm": "挑戦する",
  "battle.lowHpCancel": "やめる",

  // Action status / busy feedback (care + battle)
  "status.busy": "処理中…",

  // Evolution condition accessible met/unmet labels (not color-only)
  "evolution.met": "達成",
  "evolution.unmet": "未達成",

  // Chat panel
  "chat.title": "会話",
  "chat.disabledHint":
    "幼年期のあいだはまだ言葉を話せません。トレーニングと時間経過で成長期へ進化すると会話できるようになります。",
  "chat.placeholder": "メッセージを入力",
  "chat.inputAria": "メッセージ",
  "chat.send": "送信",
  "chat.emptyPrompt": "話しかけてみよう！",
  "chat.clear": "会話をクリア",
  "chat.clearAria": "会話をクリア",

  // Evolution banner
  "evolution.banner": "進化した！ {stage} になった！",
  "evolution.close": "閉じる",

  // Onboarding hint (first-run)
  "onboarding.title": "はじめかた",
  "onboarding.body": "まずは『トレーニング』で成長期を目指そう！",
  "onboarding.dismiss": "閉じる",
  "onboarding.cta": "{stage}まで あと トレーニング{count}回・{minutes}",
  "onboarding.ctaFinal": "もう完全に育ちきっているよ！",

  // Welcome-back / おかえり summary (issue #40)
  "welcome.title": "おかえり！",
  "welcome.elapsed": "前回から{duration}経過",
  "welcome.hunger": "お腹がすいた（空腹度 +{n}）",
  "welcome.dirty": "よごれてしまった",
  "welcome.hpLost": "HPが{n}減った",
  "welcome.hpRecovered": "寝ている間にHPが{n}回復した",
  "welcome.evolved": "進化した！{stage}になった",
  "welcome.noChange": "大きな変化はなかったよ",
  "welcome.recommendFeed": "まずはごはんをあげよう",
  "welcome.recommendClean": "まずはおそうじしよう",
  "welcome.recommendWake": "そろそろ起こしてあげよう",
  "welcome.close": "閉じる",

  // Reset
  "reset.button": "リセット",
  "reset.confirmPrompt":
    "モンスターを初期状態（新しい卵）に戻します。トレーニング回数・ステータス・経過はすべてリセットされます。よろしいですか？",
  "reset.confirm": "リセットする",
  "reset.cancel": "キャンセル",
  "reset.saveFailed": "リセットを保存できませんでした。モンスターは元の状態のままです。",

  // Section aria-labels
  "aria.care": "お世話",
  "aria.stats": "ステータス",
  "aria.battle": "バトル",
  "aria.chat": "会話",

  // Monster naming (issue #36)
  "name.firstRunTitle": "名前をつけよう",
  "name.renameTitle": "名前を変更",
  "name.label": "なまえ",
  "name.placeholder": "なまえを入力（1〜12文字）",
  "name.save": "決定",
  "name.skip": "スキップ",
  "name.cancel": "キャンセル",
  "name.validation": "1〜12文字で入力してください（空白のみは不可）",
  "name.renameButton": "名前を変更",
  "name.renameButtonAria": "名前を変更",

  // Monster zukan (issue #39)
  "zukan.button": "図鑑",
  "zukan.buttonAria": "図鑑を開く",
  "zukan.title": "モンスター図鑑",
  "zukan.close": "閉じる",
  "zukan.count": "発見 {discovered} / {total}",
  "zukan.undiscovered": "？？？",
  "zukan.undiscoveredAria": "未発見",
  "zukan.firstSeen": "初到達",
  "zukan.daysRaised": "育成日数",
  "zukan.daysUnit": "日",
  "zukan.name": "なまえ",
  "zukan.empty": "まだ何も発見していません",
} as const;

/** The set of valid message keys, derived from the JA dictionary. */
export type MessageKey = keyof typeof JA_MESSAGES;

/**
 * The complete English message dictionary. Typed as `Record<MessageKey,
 * string>` so TypeScript enforces that it has EXACTLY the same keys as the JA
 * dictionary — a missing or extra key is a compile error.
 */
const EN_MESSAGES: Record<MessageKey, string> = {
  // App shell
  "app.title": "AI Monster Raising",
  "app.loading": "Loading…",
  "app.loadError": "Could not prepare your monster.",
  "app.footer": "Evolution: training count + elapsed time / saving is automatic",

  // Care panel
  "care.title": "Care",
  "care.feed": "Feed",
  "care.train": "Train",
  "care.sleep": "Sleep",
  "care.wake": "Wake",
  "care.clean": "Clean",
  "care.hint":
    "Training and time will trigger evolution. Neglect it and it gets hungry and dirty.",

  // Stats panel
  "stats.mood": "Mood: ",
  "stats.hp": "HP",
  "stats.fullness": "Fullness",
  "stats.affection": "Affection",
  "stats.atk": "ATK",
  "stats.def": "DEF",
  "stats.trainingCount": "Training count: ",
  "stats.record": "Record",
  "stats.recordSummary": "{w}W {l}L {d}D / Streak {s}",

  // Affection (なつき度) band labels — see shared affectionBand (issue #42)
  "affection.cold": "Distant",
  "affection.neutral": "Friendly",
  "affection.warm": "Bonded",

  // Pet (なでる) action — sprite tap/click (issue #42)
  "action.pet": "Pet",
  "action.petAria": "Pet",
  "action.petCapReached": "You've petted it enough for today",

  // Sprite-adjacent state badges (also used as accessible labels)
  "badge.hungry": "Hungry",
  "badge.dirty": "Dirty",
  "badge.sleeping": "Sleeping",
  "stats.evolveTitle": "Evolution",
  "stats.finalStage": "Final stage ({stage})",
  "stats.nextStage": "Next stage: ",
  "stats.training": "Training ",
  "stats.elapsed": "Elapsed ",
  // Evolution branch hint + variant labels (issue #38)
  "stats.evolveHint": "Current care is steering toward the {form}-type evolution",
  "form.attack": "Attack",
  "form.defense": "Defense",
  "form.mischief": "Mischief",

  // Battle panel
  "battle.title": "Battle",
  "battle.start": "⚔️ Fight a wild monster",
  "battle.vs": "VS",
  "battle.enemyName": "Wild {label} Monster",
  "battle.win": "Victory! 🎉",
  "battle.lose": "Defeat… 💥",
  "battle.draw": "Draw 🤝",

  // Battle enhancements — difficulty / preview / low-HP (issue #41)
  "difficulty.label": "Difficulty",
  "difficulty.easy": "Easy",
  "difficulty.normal": "Normal",
  "difficulty.hard": "Hard",
  "battle.preview": "Enemy preview",
  "battle.enemyNameWithDifficulty": "{difficulty} Wild {label} Monster",
  "battle.lowHpWarning": "HP is low. Fight anyway?",
  "battle.lowHpConfirm": "Fight",
  "battle.lowHpCancel": "Cancel",

  // Action status / busy feedback (care + battle)
  "status.busy": "Working…",

  // Evolution condition accessible met/unmet labels (not color-only)
  "evolution.met": "met",
  "evolution.unmet": "not met",

  // Chat panel
  "chat.title": "Chat",
  "chat.disabledHint":
    "During the baby stage it cannot talk yet. Once it evolves to the rookie stage through training and time, you can chat with it.",
  "chat.placeholder": "Type a message",
  "chat.inputAria": "Message",
  "chat.send": "Send",
  "chat.emptyPrompt": "Say hello!",
  "chat.clear": "Clear conversation",
  "chat.clearAria": "Clear conversation",

  // Evolution banner
  "evolution.banner": "It evolved! It became {stage}!",
  "evolution.close": "Close",

  // Onboarding hint (first-run)
  "onboarding.title": "Getting started",
  "onboarding.body": "Start with Training to aim for the Rookie stage!",
  "onboarding.dismiss": "Close",
  "onboarding.cta": "To reach {stage}: {count} more training, {minutes}",
  "onboarding.ctaFinal": "It's already fully grown!",

  // Welcome-back / おかえり summary (issue #40)
  "welcome.title": "Welcome back!",
  "welcome.elapsed": "{duration} since your last visit",
  "welcome.hunger": "It got hungry (hunger +{n})",
  "welcome.dirty": "It got dirty",
  "welcome.hpLost": "Lost {n} HP",
  "welcome.hpRecovered": "Recovered {n} HP while sleeping",
  "welcome.evolved": "It evolved! It became {stage}",
  "welcome.noChange": "Nothing major changed",
  "welcome.recommendFeed": "Let's feed it first",
  "welcome.recommendClean": "Let's clean it first",
  "welcome.recommendWake": "Time to wake it up",
  "welcome.close": "Close",

  // Reset
  "reset.button": "Reset",
  "reset.confirmPrompt":
    "This returns your monster to its initial state (a fresh egg). Training count, stats, and progress will all be reset. Are you sure?",
  "reset.confirm": "Reset",
  "reset.cancel": "Cancel",
  "reset.saveFailed": "Could not save the reset. Your monster remains unchanged.",

  // Section aria-labels
  "aria.care": "Care",
  "aria.stats": "Stats",
  "aria.battle": "Battle",
  "aria.chat": "Chat",

  // Monster naming (issue #36)
  "name.firstRunTitle": "Name your monster",
  "name.renameTitle": "Rename",
  "name.label": "Name",
  "name.placeholder": "Enter a name (1-12 chars)",
  "name.save": "Save",
  "name.skip": "Skip",
  "name.cancel": "Cancel",
  "name.validation": "Please enter 1-12 characters (not blank).",
  "name.renameButton": "Rename",
  "name.renameButtonAria": "Rename monster",

  // Monster zukan (issue #39)
  "zukan.button": "Collection",
  "zukan.buttonAria": "Open collection",
  "zukan.title": "Monster Collection",
  "zukan.close": "Close",
  "zukan.count": "Discovered {discovered} / {total}",
  "zukan.undiscovered": "???",
  "zukan.undiscoveredAria": "Undiscovered",
  "zukan.firstSeen": "First reached",
  "zukan.daysRaised": "Days raised",
  "zukan.daysUnit": " days",
  "zukan.name": "Name",
  "zukan.empty": "Nothing discovered yet",
};

/**
 * All message dictionaries keyed by language. Both entries share an identical
 * key set (enforced at compile time via {@link MessageKey}).
 */
export const MESSAGES: Record<Lang, Record<MessageKey, string>> = {
  ja: JA_MESSAGES,
  en: EN_MESSAGES,
};

/**
 * Pure message lookup. Returns `MESSAGES[lang][key]`, falling back to the
 * Japanese value and finally to the key itself when the key is missing. Never
 * returns `undefined`. React/DOM-free so it can be unit-tested under Node.
 */
export function t(lang: Lang, key: MessageKey): string {
  const dict = MESSAGES[lang] ?? MESSAGES[DEFAULT_LANG];
  const value = dict[key];
  if (value !== undefined) {
    return value;
  }
  const fallback = MESSAGES[DEFAULT_LANG][key];
  return fallback !== undefined ? fallback : key;
}

/** Narrow an arbitrary value to a valid {@link Lang}. */
export function isLang(value: unknown): value is Lang {
  return value === "ja" || value === "en";
}

/**
 * Read the persisted language from localStorage, guarded so it never throws
 * (localStorage can be absent or blocked). Returns {@link DEFAULT_LANG} when
 * absent or invalid. Called lazily by the provider, never at module load.
 */
export function readStoredLang(): Lang {
  try {
    if (typeof localStorage === "undefined") {
      return DEFAULT_LANG;
    }
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(stored) ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

/** Persist the language to localStorage, guarded so it never throws. */
function writeStoredLang(lang: Lang): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

// --- React layer -----------------------------------------------------------
// Written WITHOUT JSX (createElement) so this module stays importable by the
// Node test runner, which strips types but does not transform JSX.

/** Value exposed by the i18n context. */
export interface I18nContextValue {
  /** The active language. */
  lang: Lang;
  /** Switch language and persist the choice. */
  setLang: (lang: Lang) => void;
  /** Translate a key in the active language. */
  t: (key: MessageKey) => string;
}

const LangContext = createContext<I18nContextValue | null>(null);

/**
 * Provides the i18n context to the tree. Initializes language from
 * localStorage (guarded, defaulting to {@link DEFAULT_LANG}) and persists on
 * change.
 */
export function I18nProvider(props: { children?: ReactNode }): ReactNode {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    writeStoredLang(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: (key: MessageKey) => t(lang, key),
    }),
    [lang, setLang],
  );

  return createElement(LangContext.Provider, { value }, props.children);
}

/**
 * Access the i18n context. Must be used within an {@link I18nProvider}.
 */
export function useI18n(): I18nContextValue {
  const value = useContext(LangContext);
  if (value === null) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return value;
}
