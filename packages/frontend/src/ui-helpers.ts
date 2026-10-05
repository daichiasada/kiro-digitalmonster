/**
 * Pure, dependency-free UI helpers.
 *
 * These contain NO DOM / React so they can be unit-tested with the Node
 * built-in test runner (see game-ui.test.ts).
 */
import type {
  BattleRecord,
  BattleWinner,
  CareRecommendation,
  Difficulty,
  EvolutionProgress,
  GrowthStage,
  Monster,
  MonsterForm,
  Stats,
} from "@ddm/shared";
import {
  AFFECTION_MAX,
  HUNGRY_CAUTION_LEVEL,
  MAX_CHAT_TURNS,
  MAX_HUNGRY_LEVEL,
  affectionBand,
  recordAppearance,
  sanitizeZukan,
} from "@ddm/shared";
import type { Zukan } from "@ddm/shared";
import { t } from "./i18n.ts";
import type { Lang, MessageKey } from "./i18n.ts";

/** Japanese display label per growth stage. */
const STAGE_LABELS_JA: Record<GrowthStage, string> = {
  baby: "幼年期",
  rookie: "成長期",
  champion: "成熟期",
  ultimate: "完全体",
};

/** English display label per growth stage. */
const STAGE_LABELS_EN: Record<GrowthStage, string> = {
  baby: "Baby",
  rookie: "Rookie",
  champion: "Champion",
  ultimate: "Ultimate",
};

/** Human-friendly Japanese stage label. */
export function stageLabelJa(stageId: GrowthStage): string {
  return STAGE_LABELS_JA[stageId] ?? stageId;
}

/**
 * Human-friendly, language-aware stage label. For `lang==='ja'` this is
 * byte-identical to {@link stageLabelJa}.
 */
export function stageLabel(stageId: GrowthStage, lang: Lang): string {
  if (lang === "en") {
    return STAGE_LABELS_EN[stageId] ?? stageId;
  }
  return stageLabelJa(stageId);
}

/**
 * Localized label for an evolution variant (issue #38), mirroring
 * {@link stageLabel}. The three branch variants (attack / defense / mischief)
 * are sourced from the i18n keys `form.attack` / `form.defense` /
 * `form.mischief` (JA 攻撃 / 防御 / やんちゃ, EN Attack / Defense / Mischief) so
 * JA and EN stay in one place. The default "base" form is not a branch target
 * and has no label, so it returns an empty string; the StatsPanel evolution
 * hint only renders when a concrete (non-base) variant is predicted, so a
 * "base" result cannot leak an empty hint. React/DOM-free so it is testable.
 */
export function formLabel(form: MonsterForm, lang: Lang): string {
  if (form === "base") {
    return "";
  }
  return t(lang, `form.${form}` as const);
}

/** Whether the monster can chat (everything except the baby stage). */
export function canChat(stageId: GrowthStage): boolean {
  return stageId !== "baby";
}

/**
 * Canned non-verbal reply surfaced for the baby (幼年期) stage, which cannot
 * talk. Mirrored here so the speech bubble can show it WITHOUT sending a
 * backend/Bedrock request. Source of truth: packages/backend/src/handlers/
 * chat.ts (the baby branch returns this exact `reply` with modelId 'none').
 */
export const BABY_SPEECH_TEXT = "…！（まだ言葉を話せないみたい。もっと育ててあげよう！）";

/**
 * English counterpart to {@link BABY_SPEECH_TEXT}, shown for the baby stage
 * when the UI language is English. Not sent to the backend; purely cosmetic.
 */
export const BABY_SPEECH_TEXT_EN = "…! (It can't talk yet. Let's raise it more!)";

/**
 * Language-aware baby canned reply. `lang==='ja'` returns the exact JA string
 * ({@link BABY_SPEECH_TEXT}); `lang==='en'` returns {@link BABY_SPEECH_TEXT_EN}.
 */
export function babySpeechText(lang: Lang): string {
  return lang === "en" ? BABY_SPEECH_TEXT_EN : BABY_SPEECH_TEXT;
}

/**
 * Return the text of the most recent monster line in a chat log, or null when
 * there is none (empty log or only player lines). React/DOM-free so it can be
 * unit-tested under the Node runner; accepts a structural subset of ChatLine.
 */
export function latestMonsterReply(
  chatLog: ReadonlyArray<{ role: "player" | "monster"; text: string }>,
): string | null {
  for (let i = chatLog.length - 1; i >= 0; i -= 1) {
    const line = chatLog[i];
    if (line.role === "monster") {
      return line.text;
    }
  }
  return null;
}

/**
 * HP as an integer percentage in [0, 100]. Guards against zero/negative maxHp.
 */
export function hpPercent(hp: number, maxHp: number): number {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
    return 0;
  }
  const pct = (hp / maxHp) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Scale an arbitrary stat value to a bar width percentage against a reference
 * maximum, clamped to [0, 100]. Used by StatsPanel for ATK/DEF bars.
 */
export function statBarPercent(value: number, reference: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((value / reference) * 100)));
}

/** Japanese headline for a finished battle, keyed by winner. */
export function winnerLabelJa(winner: BattleWinner): string {
  switch (winner) {
    case "player":
      return "勝利！ 🎉";
    case "enemy":
      return "敗北… 💥";
    default:
      return "引き分け 🤝";
  }
}

/** English headline for a finished battle, keyed by winner. */
function winnerLabelEn(winner: BattleWinner): string {
  switch (winner) {
    case "player":
      return "Victory! 🎉";
    case "enemy":
      return "Defeat… 💥";
    default:
      return "Draw 🤝";
  }
}

/**
 * Language-aware battle headline. `lang==='ja'` is byte-identical to
 * {@link winnerLabelJa}.
 */
export function winnerLabel(winner: BattleWinner, lang: Lang): string {
  return lang === "en" ? winnerLabelEn(winner) : winnerLabelJa(winner);
}

// Matches a per-turn attack line emitted by @ddm/shared simulateBattle, e.g.
//   "T1: でじたん hits 野生の幼年期モンスター for 11 (enemy HP 7)"
const TURN_LINE_RE =
  /^T(\d+): (.+) hits (.+) for (\d+) \((enemy|player) HP (\d+)\)$/;
// Matches the final result line, e.g. "Result: player".
const RESULT_LINE_RE = /^Result: (player|enemy|draw)$/;

/**
 * Localize a single battle-log line produced by the backend (which emits
 * English developer strings) into Japanese for display. Unknown lines are
 * returned unchanged so nothing is ever silently dropped.
 */
export function battleLogLineJa(line: string): string {
  const turn = TURN_LINE_RE.exec(line);
  if (turn !== null) {
    const [, n, attacker, defender, dmg, side, hp] = turn;
    const target = side === "enemy" ? "相手" : "自分";
    return `${n}ターン目: ${attacker} の攻撃！ ${defender} に ${dmg} ダメージ（${target}の残りHP ${hp}）`;
  }
  const result = RESULT_LINE_RE.exec(line);
  if (result !== null) {
    return `結果: ${winnerLabelJa(result[1] as BattleWinner)}`;
  }
  return line;
}

/** Localize an entire battle log. */
export function battleLogJa(log: readonly string[]): string[] {
  return log.map(battleLogLineJa);
}

/**
 * English rendering of a single battle-log line. Reuses the same regexes as
 * {@link battleLogLineJa}; unknown lines are returned unchanged.
 */
function battleLogLineEn(line: string): string {
  const turn = TURN_LINE_RE.exec(line);
  if (turn !== null) {
    const [, n, attacker, defender, dmg, side, hp] = turn;
    const whose = side === "enemy" ? "enemy" : "player";
    return `Turn ${n}: ${attacker} attacks! ${defender} takes ${dmg} damage (${whose} HP ${hp})`;
  }
  const result = RESULT_LINE_RE.exec(line);
  if (result !== null) {
    return `Result: ${winnerLabelEn(result[1] as BattleWinner)}`;
  }
  return line;
}

/**
 * Language-aware localization of a single battle-log line. `lang==='ja'` is
 * byte-identical to {@link battleLogLineJa}.
 */
export function battleLogLine(line: string, lang: Lang): string {
  return lang === "en" ? battleLogLineEn(line) : battleLogLineJa(line);
}

/**
 * Language-aware localization of an entire battle log. `lang==='ja'` is
 * byte-identical to {@link battleLogJa}.
 */
export function battleLogList(log: readonly string[], lang: Lang): string[] {
  return log.map((line) => battleLogLine(line, lang));
}

/**
 * One parsed turn of a battle. `attacker`/`defender` identify the two sides,
 * `dmg` is the damage dealt that turn, and `defenderHpAfter` is the HP the
 * defender has remaining once the hit lands (used to tween the HP bar down).
 */
export interface BattleTurnEvent {
  turn: number;
  attacker: "player" | "enemy";
  defender: "player" | "enemy";
  dmg: number;
  defenderHpAfter: number;
}

/** The ordered, structured playback derived from a raw battle log. */
export interface BattlePlayback {
  events: BattleTurnEvent[];
  winner: BattleWinner | null;
}

/**
 * Parse a raw battle log (the English developer strings emitted by
 * @ddm/shared simulateBattle) into an ordered list of turn events plus the
 * final winner. Pure and React-free so it can drive the animated UI and be
 * unit-tested under the Node test runner.
 *
 * Reuses TURN_LINE_RE / RESULT_LINE_RE. The regex `side` group names whose HP
 * REMAINS after the hit, i.e. the DEFENDER: side==='enemy' means the player
 * attacked the enemy; side==='player' means the enemy attacked the player.
 * Unknown/unmatched lines are skipped without throwing. If no result line is
 * present, `winner` is null.
 */
export function parseBattleEvents(log: readonly string[]): BattlePlayback {
  const events: BattleTurnEvent[] = [];
  let winner: BattleWinner | null = null;

  for (const line of log) {
    const turn = TURN_LINE_RE.exec(line);
    if (turn !== null) {
      const [, n, , , dmg, side, hp] = turn;
      const defender = side === "enemy" ? "enemy" : "player";
      const attacker = defender === "enemy" ? "player" : "enemy";
      events.push({
        turn: Number.parseInt(n, 10),
        attacker,
        defender,
        dmg: Number.parseInt(dmg, 10),
        defenderHpAfter: Number.parseInt(hp, 10),
      });
      continue;
    }
    const result = RESULT_LINE_RE.exec(line);
    if (result !== null) {
      winner = result[1] as BattleWinner;
    }
  }

  return { events, winner };
}

/**
 * Derive the player's HP entering the battle from the raw log alone.
 *
 * The backend simulates from the player's CURRENT HP (which may be below max
 * for a damaged-but-alive monster), and the post-battle monster is committed
 * before the result lands, so the pre-battle HP is no longer available from
 * game state. It is recoverable from the log instead: for the FIRST event
 * where the player is the defender, the pre-hit HP is `defenderHpAfter + dmg`,
 * i.e. the HP the player had entering that first hit. If the player is never
 * hit (the enemy dies first), there is no such event and we fall back to
 * `maxHp` (full).
 */
export function playerStartHpFromLog(log: readonly string[], maxHp: number): number {
  const { events } = parseBattleEvents(log);
  const firstHit = events.find((ev) => ev.defender === "player");
  if (firstHit === undefined) {
    return maxHp;
  }
  return firstHit.defenderHpAfter + firstHit.dmg;
}

/**
 * Format a duration in milliseconds as a whole-minute Japanese string, e.g.
 * `150000` -> `"2分"`. Rounds DOWN (Math.floor). Non-finite or negative input
 * is guarded to `"0分"`.
 */
export function formatMinutesJa(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "0分";
  }
  return `${Math.floor(ms / 60000)}分`;
}

/**
 * Language-aware whole-minute duration string. `lang==='ja'` is byte-identical
 * to {@link formatMinutesJa}; `lang==='en'` returns e.g. `"2 min"`.
 */
export function formatMinutes(ms: number, lang: Lang): string {
  if (lang !== "en") {
    return formatMinutesJa(ms);
  }
  if (!Number.isFinite(ms) || ms < 0) {
    return "0 min";
  }
  return `${Math.floor(ms / 60000)} min`;
}

/**
 * Format a duration in milliseconds as an hours+minutes Japanese string, e.g.
 * `7_500_000` -> `"2時間5分"`, `150000` -> `"2分"`, `0` -> `"0分"`. Rounds DOWN
 * to whole minutes (Math.floor). The hours segment is omitted when there are
 * fewer than 60 minutes, so a short absence reads the same as
 * {@link formatMinutesJa}. Non-finite or negative input is guarded to `"0分"`.
 *
 * This exists (vs reusing {@link formatMinutes}) because an absence can span
 * hours and "125分" is harder to read than "2時間5分".
 */
export function formatDurationJa(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "0分";
  }
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}分`;
  }
  return `${hours}時間${minutes}分`;
}

/**
 * Language-aware hours+minutes duration string. `lang==='ja'` is byte-identical
 * to {@link formatDurationJa}; `lang==='en'` returns e.g. `"2h 5m"`, `"5m"`, or
 * `"0m"` (hours segment omitted below one hour). Rounds DOWN; non-finite or
 * negative input is guarded to the zero-minute form.
 */
export function formatDuration(ms: number, lang: Lang): string {
  if (lang !== "en") {
    return formatDurationJa(ms);
  }
  if (!Number.isFinite(ms) || ms < 0) {
    return "0m";
  }
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Map a {@link CareRecommendation} to the i18n key for its one-tap welcome-back
 * button label. `"feed"`/`"clean"`/`"wake"` map to the matching
 * `welcome.recommend*` key; `"none"` has no button so it maps to `null` and the
 * caller omits the button. Pure and React/DOM-free so it is unit-testable.
 */
export function recommendLabelKey(
  recommendation: CareRecommendation,
): MessageKey | null {
  switch (recommendation) {
    case "feed":
      return "welcome.recommendFeed";
    case "clean":
      return "welcome.recommendClean";
    case "wake":
      return "welcome.recommendWake";
    default:
      return null;
  }
}

/**
 * A care action the player can perform on the monster. `sleep` and `wake` are
 * the two halves of the sleep toggle button so each shows a matching cue.
 * `pet` (なでる) is triggered by clicking the sprite and plays a heart-pop FX.
 */
export type CareAction = "feed" | "train" | "sleep" | "wake" | "clean" | "pet";

/**
 * Visual-effect descriptor for a care action. Drives the transient overlay
 * animation (FEAT-002 consumes this): a CSS class name, an overlay emoji, and
 * how long the effect stays on screen in milliseconds.
 */
export interface CareEffect {
  className: string;
  emoji: string;
  durationMs: number;
}

/** Fixed visual-effect descriptor per care action. */
const CARE_EFFECTS: Record<CareAction, CareEffect> = {
  feed: { className: "fx-feed", emoji: "🍖", durationMs: 700 },
  train: { className: "fx-train", emoji: "💪", durationMs: 600 },
  sleep: { className: "fx-sleep", emoji: "💤", durationMs: 700 },
  wake: { className: "fx-wake", emoji: "⏰", durationMs: 600 },
  clean: { className: "fx-clean", emoji: "✨", durationMs: 700 },
  pet: { className: "fx-pet", emoji: "💗", durationMs: 700 },
};

/**
 * Map a care action to its visual-effect descriptor. Durations are kept short
 * and non-blocking so the overlay never gets in the player's way.
 */
export function careEffect(action: CareAction): CareEffect {
  return CARE_EFFECTS[action];
}

// --- Sound effects (issue #45) -------------------------------------------------
//
// These are the PURE, DOM/React-free parts of the sound feature: the
// event->tone configuration map, the volume clamp, and the enabled-gating
// predicate. They mirror the CARE_EFFECTS/careEffect pattern above and are
// unit-tested in game-ui.test.ts.
//
// The actual Web Audio side (lazily creating an AudioContext, building
// OscillatorNode + GainNode envelopes, honoring the browser autoplay policy)
// lives in sound.ts and is INTENTIONALLY NOT unit-tested: AudioContext is a
// browser-only API that cannot run under the Node test runner. By keeping all
// decisions (which tone, how loud, whether to play at all) here as pure
// functions, the untestable surface in sound.ts stays as thin as possible.

/**
 * A game moment that has a short synthesized sound effect. Covers the issue
 * #45 scope: feeding, training, battle hit, battle win/lose/draw, and
 * evolution. (Care actions clean/sleep/wake/pet are intentionally silent.)
 */
export type SoundEvent = "feed" | "train" | "hit" | "win" | "lose" | "draw" | "evolve";

/**
 * One synthesized blip: a single oscillator note. `freq` is in Hz, `durationMs`
 * is how long the note sounds (kept short, <= ~250ms, so effects never become
 * annoying), `type` is the oscillator waveform, and `gain` is the per-note peak
 * amplitude in [0, 1] BEFORE the user's volume setting is applied. A multi-note
 * jingle (win/evolve) is expressed as an ARRAY of these steps played in order.
 */
export interface SoundTone {
  freq: number;
  durationMs: number;
  type: OscillatorType;
  gain: number;
}

/**
 * Fixed tone configuration per sound event. Single-note events are a lone
 * {@link SoundTone}; win/evolve are a short 2-3 note arpeggio (an array played
 * sequentially). Durations are intentionally short so repeated actions never
 * produce a drawn-out or grating sound.
 */
const SOUND_TONES: Record<SoundEvent, SoundTone | SoundTone[]> = {
  // Feeding: a soft, bright single blip.
  feed: { freq: 660, durationMs: 120, type: "sine", gain: 0.6 },
  // Training: a slightly punchier square blip.
  train: { freq: 440, durationMs: 140, type: "square", gain: 0.4 },
  // Battle hit: a short, dry percussive tick.
  hit: { freq: 220, durationMs: 90, type: "triangle", gain: 0.5 },
  // Win: a rising 3-note major arpeggio (C5-E5-G5) — celebratory but brief.
  win: [
    { freq: 523, durationMs: 110, type: "sine", gain: 0.6 },
    { freq: 659, durationMs: 110, type: "sine", gain: 0.6 },
    { freq: 784, durationMs: 150, type: "sine", gain: 0.6 },
  ],
  // Lose: a short descending two-note motif.
  lose: [
    { freq: 392, durationMs: 130, type: "sine", gain: 0.5 },
    { freq: 262, durationMs: 180, type: "sine", gain: 0.5 },
  ],
  // Draw: a single neutral mid tone.
  draw: { freq: 349, durationMs: 160, type: "sine", gain: 0.45 },
  // Evolution: a brighter rising 3-note arpeggio (E5-A5-C#6) distinct from win.
  evolve: [
    { freq: 659, durationMs: 120, type: "triangle", gain: 0.6 },
    { freq: 880, durationMs: 120, type: "triangle", gain: 0.6 },
    { freq: 1109, durationMs: 170, type: "triangle", gain: 0.6 },
  ],
};

/**
 * Map a sound event to its tone configuration. Mirrors {@link careEffect}: a
 * single-note event returns one {@link SoundTone}; a jingle returns an array.
 */
export function soundTone(event: SoundEvent): SoundTone | SoundTone[] {
  return SOUND_TONES[event];
}

/** Default playback volume when the stored/supplied value is missing or NaN. */
export const DEFAULT_SOUND_VOLUME = 0.5;

/**
 * Clamp a volume into the valid [0, 1] range. A non-finite input (NaN,
 * Infinity) is guarded to {@link DEFAULT_SOUND_VOLUME} so a corrupt stored
 * value never silences or over-drives playback.
 */
export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) {
    return DEFAULT_SOUND_VOLUME;
  }
  return Math.max(0, Math.min(1, v));
}

/**
 * Whether a sound should actually play for the given settings: effects must be
 * enabled AND the (clamped) volume must be above zero. This is the single
 * gating predicate consumed by the sound engine so it can bail out early.
 */
export function shouldPlaySound(enabled: boolean, volume: number): boolean {
  return enabled && clampVolume(volume) > 0;
}

/**
 * Display/sound settings surfaced by the Settings panel (issue #45): SFX
 * on/off, SFX volume, and app-level reduced motion. Language is deliberately
 * NOT part of this shape — it is owned by i18n.ts under the separate `ddm.lang`
 * key (the panel only surfaces useI18n().lang/setLang), so toggling it stays
 * independent of this store and does not regress the #12 persistence.
 *
 * Persisted as a single JSON blob under {@link SETTINGS_STORAGE_KEY}
 * (`ddm.settings`).
 */
export interface Settings {
  /** Whether sound effects play. Defaults OFF (muted) per the autoplay policy. */
  sfxEnabled: boolean;
  /** SFX playback volume in [0, 1]. */
  volume: number;
  /** App-level "reduce motion" toggle that forces the force-reduced-motion class. */
  reducedMotion: boolean;
}

/**
 * Back-compat alias for the pre-FEAT-003 name. FEAT-002 called this shape
 * {@link DisplaySettings}; it is now {@link Settings} with the added
 * `reducedMotion` field. Kept as an alias to avoid churn in older imports.
 */
export type DisplaySettings = Settings;

/** localStorage key for persisted display/sound settings. */
export const SETTINGS_STORAGE_KEY = "ddm.settings";

/**
 * Default settings. SFX is OFF by default so NOTHING plays until the user
 * explicitly enables it (autoplay-policy compliant: even the first gesture is
 * silent until opt-in). Volume defaults to a middle level and reduced motion
 * is off so the OS prefers-reduced-motion preference remains the default-on
 * signal.
 */
export const DEFAULT_SETTINGS: Settings = {
  sfxEnabled: false,
  volume: DEFAULT_SOUND_VOLUME,
  reducedMotion: false,
};

/**
 * Pure, DOM/localStorage-free parser for the persisted settings blob. Given the
 * raw stored string (or null when absent), it:
 *   - returns a fresh copy of {@link DEFAULT_SETTINGS} when raw is null, the
 *     JSON is invalid, or it does not parse to an object;
 *   - coerces non-boolean `sfxEnabled` / `reducedMotion` to their defaults;
 *   - clamps `volume` into [0, 1] via {@link clampVolume} (NaN/missing ->
 *     default);
 *   - fills any missing field from the defaults.
 *
 * Kept pure so it is unit-testable under node:test (no DOM/React). The guarded
 * localStorage wrappers {@link readSettings} / {@link writeSettings} are thin
 * shells around this.
 */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) {
    return { ...DEFAULT_SETTINGS };
  }
  let parsed: Partial<Settings> | null;
  try {
    parsed = JSON.parse(raw) as Partial<Settings> | null;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    sfxEnabled: typeof parsed.sfxEnabled === "boolean" ? parsed.sfxEnabled : DEFAULT_SETTINGS.sfxEnabled,
    volume: clampVolume(typeof parsed.volume === "number" ? parsed.volume : DEFAULT_SETTINGS.volume),
    reducedMotion:
      typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
  };
}

/**
 * Read the persisted settings, guarded so it never throws (localStorage can be
 * absent or blocked). Delegates all validation/clamping to the pure
 * {@link parseSettings}. Mirrors {@link readOnboarded}.
 */
export function readSettings(): Settings {
  try {
    if (typeof localStorage === "undefined") {
      return { ...DEFAULT_SETTINGS };
    }
    return parseSettings(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Persist the given settings, guarded so a blocked/absent localStorage is a
 * silent no-op (mirrors {@link writeOnboarded}). Stores the whole blob under
 * {@link SETTINGS_STORAGE_KEY} as JSON.
 */
export function writeSettings(settings: Settings): void {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

/**
 * The monster fields needed to derive the mood string. Issue #29 makes mood
 * HP-aware, so this now also requires `stats` (hp/maxHp) in addition to the
 * sleeping/dirty/hunger flags.
 */
type MoodMonster = Pick<Monster, "isSleeping" | "dirty" | "hungryLevel"> & {
  stats: Pick<Stats, "hp" | "maxHp">;
};

/**
 * hpPercent below which the monster is considered low on energy (unwell).
 * Documented local threshold used only for the mood string (issue #29).
 */
const LOW_HP_PERCENT = 30;

/** A short, friendly Japanese mood string derived from the monster's state. */
export function moodLabelJa(monster: MoodMonster): string {
  if (monster.isSleeping) {
    return "すやすや睡眠中";
  }
  if (monster.dirty) {
    return "よごれている";
  }
  if (hpPercent(monster.stats.hp, monster.stats.maxHp) < LOW_HP_PERCENT) {
    return "元気がない";
  }
  if (monster.hungryLevel >= HUNGRY_CAUTION_LEVEL) {
    return "とてもお腹がすいている";
  }
  if (monster.hungryLevel >= 3) {
    return "お腹がすいてきた";
  }
  return "ごきげん";
}

/** English mood string, mirroring the priority order of {@link moodLabelJa}. */
function moodLabelEn(monster: MoodMonster): string {
  if (monster.isSleeping) {
    return "Sleeping soundly";
  }
  if (monster.dirty) {
    return "Dirty";
  }
  if (hpPercent(monster.stats.hp, monster.stats.maxHp) < LOW_HP_PERCENT) {
    return "Low energy";
  }
  if (monster.hungryLevel >= HUNGRY_CAUTION_LEVEL) {
    return "Very hungry";
  }
  if (monster.hungryLevel >= 3) {
    return "Getting hungry";
  }
  return "Happy";
}

/**
 * Language-aware mood string. `lang==='ja'` is byte-identical to
 * {@link moodLabelJa}.
 */
export function moodLabel(monster: MoodMonster, lang: Lang): string {
  return lang === "en" ? moodLabelEn(monster) : moodLabelJa(monster);
}

/**
 * Fullness as an integer percentage in [0, 100], derived from hungryLevel.
 * hungryLevel 0 (full) => 100% fullness; MAX_HUNGRY_LEVEL (starving) => 0%.
 * Uses the shared {@link MAX_HUNGRY_LEVEL} cap rather than hardcoding it.
 * Non-finite input is guarded to 0, like {@link hpPercent}.
 */
export function fullnessPercent(hungryLevel: number): number {
  if (!Number.isFinite(hungryLevel)) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(MAX_HUNGRY_LEVEL, hungryLevel));
  return Math.round(((MAX_HUNGRY_LEVEL - clamped) / MAX_HUNGRY_LEVEL) * 100);
}

/**
 * Whether the hunger level has reached the caution threshold. Drives the
 * caution color / aria cue on the hunger gauge and badge (FEAT-002). Uses the
 * shared {@link HUNGRY_CAUTION_LEVEL} rather than hardcoding it.
 */
export function isHungerCaution(hungryLevel: number): boolean {
  return hungryLevel >= HUNGRY_CAUTION_LEVEL;
}

// --- Affection (なつき度) gauge ---------------------------------------------

/**
 * Affection as an integer percentage in [0, 100], scaled against the shared
 * {@link AFFECTION_MAX}. Non-finite input is guarded to 0, mirroring
 * {@link fullnessPercent} / {@link hpPercent}. Drives the heart gauge bar
 * width in StatsPanel (FEAT-002).
 */
export function affectionPercent(affection: number): number {
  if (!Number.isFinite(affection)) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(AFFECTION_MAX, affection));
  return Math.round((clamped / AFFECTION_MAX) * 100);
}

/**
 * Localized band label for the affection gauge, classified via the shared
 * {@link affectionBand} (cold / neutral / warm). Sourced from the i18n keys
 * `affection.cold` / `affection.neutral` / `affection.warm` so JA and EN stay
 * in one place (JA よそよそしい / ふつう / なかよし, EN Distant / Friendly /
 * Bonded). React/DOM-free so it can be unit-tested.
 */
export function affectionLevelLabel(affection: number, lang: Lang): string {
  const band = affectionBand(affection);
  return t(lang, `affection.${band}` as const);
}

// --- Pet (なでる) daily cap -------------------------------------------------

/**
 * Maximum number of pet (なでる) actions that raise affection in a single
 * calendar day. The shared `pet()` action is intentionally UNCAPPED; this cap
 * is enforced in the frontend via localStorage so the limit resets each day.
 */
export const PET_DAILY_CAP = 5;

/** localStorage key under which the per-day pet counter is persisted. */
export function petStorageKey(): string {
  return "ddm.pets";
}

/** A persisted per-day pet record: the calendar `day` and how many pets used. */
export interface PetRecord {
  day: string;
  count: number;
}

/**
 * Local calendar-day stamp (`YYYY-MM-DD`) for a timestamp. Pure and
 * deterministic for a fixed `now`; uses local date parts so the cap resets at
 * the player's local midnight. Non-finite input falls back to the epoch day.
 */
export function dayStamp(now: number): string {
  const d = Number.isFinite(now) ? new Date(now) : new Date(0);
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// --- Time-of-day background phase (issue #43) -------------------------------

/** The four daily background phases the stage gradient cycles through. */
export type TimeOfDay = "morning" | "day" | "evening" | "night";

/**
 * Classify a local hour-of-day into one of four {@link TimeOfDay} phases that
 * drive the stage background gradient (issue #43). Pure and React/DOM-free so
 * it can be unit-tested under the Node runner, mirroring {@link dayStamp}.
 *
 * Hour ranges (24h, player LOCAL time):
 *   morning  05:00-09:59  (hour 5-9)
 *   day      10:00-16:59  (hour 10-16)
 *   evening  17:00-19:59  (hour 17-19)
 *   night    20:00-04:59  (hour 20-23 and 0-4, wrapping midnight)
 *
 * Accepts either a `Date`/timestamp (the hour is derived via
 * `new Date(...).getHours()`, i.e. the device local hour) or a raw hour number
 * in [0, 23] used directly. Non-finite input (e.g. `NaN`, or an invalid Date)
 * falls back to `'day'` so the stage always has a sensible background.
 */
export function timeOfDay(input: number | Date): TimeOfDay {
  let hour: number;
  if (input instanceof Date) {
    hour = input.getHours();
  } else if (Number.isFinite(input)) {
    // A bare hour (0-23) is used directly; a larger value is treated as a
    // timestamp and converted to the device-local hour.
    hour = input >= 0 && input <= 23 ? input : new Date(input).getHours();
  } else {
    return "day";
  }
  if (!Number.isFinite(hour)) {
    return "day";
  }
  if (hour >= 5 && hour < 10) {
    return "morning";
  }
  if (hour >= 10 && hour < 17) {
    return "day";
  }
  if (hour >= 17 && hour < 20) {
    return "evening";
  }
  return "night";
}

/**
 * Parse a stored pet record (raw JSON string or null) into a {@link PetRecord}
 * for TODAY. When the stored day differs from today's {@link dayStamp}, or the
 * raw value is missing/invalid, the count resets to 0 for the current day.
 * Pure: takes `raw` + `now` so it is unit-testable with fixed values.
 */
export function readPetRecord(raw: string | null, now: number): PetRecord {
  const today = dayStamp(now);
  if (raw === null || raw === "") {
    return { day: today, count: 0 };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PetRecord>;
    if (
      typeof parsed.day === "string" &&
      parsed.day === today &&
      typeof parsed.count === "number" &&
      Number.isFinite(parsed.count)
    ) {
      return { day: today, count: Math.max(0, Math.floor(parsed.count)) };
    }
  } catch {
    // Fall through to the reset below on malformed JSON.
  }
  return { day: today, count: 0 };
}

/**
 * Pets remaining today = max(0, {@link PET_DAILY_CAP} - count), treating a
 * record from a previous day as a fresh (0-count) day.
 */
export function petsRemaining(record: PetRecord, now: number): number {
  const today = dayStamp(now);
  const count = record.day === today ? record.count : 0;
  return Math.max(0, PET_DAILY_CAP - count);
}

/** Whether another pet is allowed today (i.e. the cap has not been reached). */
export function canPet(record: PetRecord, now: number): boolean {
  return petsRemaining(record, now) > 0;
}

/**
 * The next pet record after a successful pet: increments today's count,
 * resetting to a 1-count record when the stored record is from a prior day.
 * Pure; does not touch storage.
 */
export function nextPetRecord(record: PetRecord, now: number): PetRecord {
  const today = dayStamp(now);
  const base = record.day === today ? record.count : 0;
  return { day: today, count: base + 1 };
}

/**
 * Read the raw pet record string from localStorage, guarded so it never throws
 * (localStorage can be absent or blocked). Mirrors {@link readOnboarded}.
 * Returns `null` when storage is unavailable or the key is absent.
 */
export function readPetRecordRaw(): string | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage.getItem(petStorageKey());
  } catch {
    return null;
  }
}

/** Persist a pet record to localStorage, guarded so it never throws. */
export function writePetRecord(record: PetRecord): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(petStorageKey(), JSON.stringify(record));
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

/**
 * Whether petting is still available today, derived purely from the number of
 * pets remaining under the per-day cap. `remaining <= 0` means the cap has been
 * reached, so the sprite should stop inviting petting. Non-finite input is
 * treated as "unavailable" defensively.
 */
export function canPetNow(remaining: number): boolean {
  return Number.isFinite(remaining) && remaining > 0;
}

/**
 * Accessible label (used for BOTH `aria-label` and `title`) for the pet target
 * sprite. While petting is available it reads the "なでる" action label; once
 * the per-day cap is reached it switches to the cap-reached message so a
 * screen-reader or hover user is told the sprite is no longer pettable today,
 * instead of still being invited to pet. React/DOM-free so it is unit-testable.
 */
export function petSpriteLabel(remaining: number, lang: Lang): string {
  return canPetNow(remaining) ? t(lang, "action.petAria") : t(lang, "action.petCapReached");
}

/**
 * Localized cap-reached message surfaced when the player tries to pet after the
 * per-day cap has been used up (JA きょうはもう十分なでたよ / EN You've petted it
 * enough for today). Thin wrapper over the "action.petCapReached" i18n key so
 * the feedback text is sourced from the same pure, unit-tested layer.
 */
export function petCapReachedLabel(lang: Lang): string {
  return t(lang, "action.petCapReached");
}

// --- Accessibility labels (not color-only) ---------------------------------

/**
 * Accessible met/unmet label for an evolution-condition row, so the state is
 * conveyed by text (not just the ✓/・ glyph and color). Returns the localized
 * "evolution.met" string when `met`, otherwise the "evolution.unmet" string
 * (JA 達成/未達成, EN met/not met). React/DOM-free so it can be unit-tested.
 */
export function evolutionReqAriaLabel(met: boolean, lang: Lang): string {
  return t(lang, met ? "evolution.met" : "evolution.unmet");
}

/**
 * Localized "working / busy" status label surfaced while a care or battle
 * action is in flight (JA 処理中… / EN Working…). Thin wrapper over the
 * "status.busy" i18n key kept here so the busy affordance can source its text
 * from the same pure, unit-tested layer as the rest of the UI copy.
 */
export function busyStatusLabel(lang: Lang): string {
  return t(lang, "status.busy");
}

// --- First-run onboarding hint ---------------------------------------------

/** localStorage key under which the "onboarding seen" flag is persisted. */
export const ONBOARDED_STORAGE_KEY = "ddm.onboarded";

/**
 * Read the onboarding flag from localStorage, guarded so it never throws
 * (localStorage can be absent or blocked). Mirrors readStoredLang in i18n.ts.
 *
 * Returns `false` (meaning: still show the hint) when storage is
 * undefined/blocked OR the key is absent. Returns `true` only when the key is
 * present with a truthy stored value (e.g. the "1" written by
 * {@link writeOnboarded}). This is DOM-dependent, so the pure show/hide
 * decision lives in {@link shouldShowOnboarding} for unit-testing.
 */
export function readOnboarded(): boolean {
  try {
    if (typeof localStorage === "undefined") {
      return false;
    }
    const stored = localStorage.getItem(ONBOARDED_STORAGE_KEY);
    return stored !== null && stored !== "" && stored !== "0";
  } catch {
    return false;
  }
}

/** Persist the onboarding flag ("1") to localStorage, guarded so it never throws. */
export function writeOnboarded(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ONBOARDED_STORAGE_KEY, "1");
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

/**
 * Pure show/hide decision for the first-run onboarding hint, decoupled from
 * storage so it is unit-testable without a DOM.
 *
 * Semantics: an unset flag OR unavailable storage both make
 * {@link readOnboarded} default to `false`, so the hint is shown by default on
 * a fresh profile. The hint is ONLY shown while a monster is loaded
 * (`hasMonster`), and is hidden once the flag has been set (dismissed).
 */
export function shouldShowOnboarding(onboarded: boolean, hasMonster: boolean): boolean {
  return !onboarded && hasMonster;
}

/**
 * Pure call-to-action line summarizing what remains before the next evolution,
 * derived from the shared {@link EvolutionProgress}. React/DOM-free so it can
 * be unit-tested; wording comes from the i18n templates "onboarding.cta" and
 * "onboarding.ctaFinal".
 *
 * At the final stage, returns the "already fully grown" line. Otherwise it
 * names the next stage and the 『トレーニング』 action, with the remaining
 * training count (clamped to >= 0) and remaining minutes (via
 * {@link formatMinutes}, clamped to >= 0).
 */
export function onboardingCta(prog: EvolutionProgress, lang: Lang): string {
  if (prog.isFinalStage) {
    return t(lang, "onboarding.ctaFinal");
  }
  const stage = (lang === "en" ? prog.nextLabelEn : prog.nextLabelJa) ?? "";
  const remainingTraining = Math.max(0, (prog.trainingRequired ?? 0) - prog.trainingCurrent);
  const remainingMs = Math.max(0, (prog.requiredMs ?? 0) - prog.elapsedMs);
  const minutes = formatMinutes(remainingMs, lang);
  return t(lang, "onboarding.cta")
    .replace("{stage}", stage)
    .replace("{count}", String(remainingTraining))
    .replace("{minutes}", minutes);
}

// --- Battle enhancements (難易度・プレビュー・戦績) — issue #41 --------------

/**
 * Difficulty ordering used to render the selector (弱い -> 普通 -> 強い). Kept
 * here (not derived from an object) so the rendering order is explicit and
 * unit-testable, matching the shared DIFFICULTY_CONFIG keys.
 */
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

/**
 * Localized label for a difficulty, sourced from the i18n keys
 * `difficulty.easy` / `difficulty.normal` / `difficulty.hard`
 * (JA 弱い/普通/強い, EN Easy/Normal/Hard). React/DOM-free so it is testable.
 */
export function difficultyLabel(difficulty: Difficulty, lang: Lang): string {
  return t(lang, `difficulty.${difficulty}` as const);
}

/**
 * Pick a fresh random 32-bit battle seed. A thin wrapper over Math.random so
 * the RANDOMNESS stays out of the render path; the frontend picks a seed, sends
 * it to the backend, and previews the SAME enemy via the shared generateEnemy.
 * Tests assert only that the result is a finite integer in [0, 0xffffffff],
 * never the value itself.
 */
export function pickBattleSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/**
 * Localized one-line summary of a battle record. JA renders
 * `{w}勝 {l}敗 {d}分 / 連勝{s}` and EN `{w}W {l}L {d}D / Streak {s}` from the
 * `stats.recordSummary` i18n template. Pass the record via the shared
 * {@link import("@ddm/shared").battleRecordOf} at the call site so legacy
 * (undefined-record) state is read safely. React/DOM-free.
 */
export function battleRecordSummary(record: BattleRecord, lang: Lang): string {
  return t(lang, "stats.recordSummary")
    .replace("{w}", String(record.wins))
    .replace("{l}", String(record.losses))
    .replace("{d}", String(record.draws))
    .replace("{s}", String(record.streak));
}

/**
 * The enemy identity the #9 replay animation must depict: the localized display
 * `name` and the `maxHp` used to scale the enemy HP bar. Deliberately minimal
 * (name + maxHp) because those are the only two enemy facts the replay renders.
 */
export interface BattleAnimationEnemy {
  name: string;
  maxHp: number;
}

/**
 * Decide which enemy the replay animation should depict.
 *
 * The bug this guards against (issue #41 review v1): BattlePanel regenerates the
 * battle seed the instant it dispatches a fight, which recomputes the live
 * preview enemy (memoized on the seed) to the NEXT enemy BEFORE the just-fought
 * result/log land and animate. The replay would then scale the enemy HP bar
 * against the wrong maxHp and show the next enemy's name.
 *
 * The fix is to SNAPSHOT the fought enemy at dispatch time and have the replay
 * prefer that snapshot over the live preview. This helper encodes that
 * precedence as a pure, unit-testable decision: when a `fought` snapshot exists
 * it wins; otherwise fall back to the live `preview` enemy (e.g. before any
 * fight has happened). Because the snapshot is captured from the enemy that was
 * actually dispatched, reseeding the preview afterwards can no longer corrupt
 * the replay.
 */
export function resolveAnimationEnemy(
  preview: BattleAnimationEnemy,
  fought: BattleAnimationEnemy | null,
): BattleAnimationEnemy {
  return fought ?? preview;
}

/**
 * hpPercent below which the player's monster is considered too low on HP to
 * safely enter a battle, surfacing a pre-fight warning (issue #41). Documented
 * local threshold reused by {@link isLowHp}.
 */
export const LOW_HP_BATTLE_PERCENT = 30;

/**
 * Whether the monster's HP is low enough to warrant a pre-battle warning: true
 * when {@link hpPercent}(hp, maxHp) is strictly below
 * {@link LOW_HP_BATTLE_PERCENT}. Non-finite / non-positive maxHp is guarded by
 * hpPercent (returns 0%, which is below the threshold => low).
 */
export function isLowHp(hp: number, maxHp: number): boolean {
  return hpPercent(hp, maxHp) < LOW_HP_BATTLE_PERCENT;
}

// --- Monster zukan (図鑑) persistence — issue #39 ---------------------------

/**
 * localStorage key under which the monster zukan (collection) is persisted.
 * Deliberately SEPARATE from the monster save (and the monster id) so the
 * collection SURVIVES a reset: reset() rewrites the monster but never touches
 * this key, so previously reached appearances are kept forever (issue #39).
 */
export const ZUKAN_STORAGE_KEY = "ddm.zukan";

/**
 * Read the raw zukan JSON string from localStorage, guarded so it never throws
 * (localStorage can be absent or blocked). Mirrors {@link readPetRecordRaw}.
 * Returns `null` when storage is unavailable or the key is absent.
 */
export function readZukanRaw(): string | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage.getItem(ZUKAN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Parse a stored zukan (raw JSON string or null) into a {@link Zukan}. Pure and
 * unit-testable: JSON.parse inside a try/catch, then the shared
 * {@link sanitizeZukan} drops any non-canonical / malformed entries. Returns an
 * empty zukan (`{}`) when the raw value is null, empty, or malformed JSON.
 */
export function parseZukan(raw: string | null): Zukan {
  if (raw === null || raw === "") {
    return {};
  }
  try {
    return sanitizeZukan(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * Read + parse the current zukan from localStorage. Thin composition of
 * {@link readZukanRaw} and {@link parseZukan}; never throws.
 */
export function readZukan(): Zukan {
  return parseZukan(readZukanRaw());
}

/** Persist a zukan to localStorage, guarded so it never throws. */
export function writeZukan(zukan: Zukan): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ZUKAN_STORAGE_KEY, JSON.stringify(zukan));
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

/**
 * Record a monster's current appearance into the zukan, delegating to the
 * shared pure {@link recordAppearance} merge (first-seen wins, never mutates
 * the input, returns the SAME object identity when nothing new is added). Kept
 * here as a thin re-export so the lifecycle hook imports a single function.
 */
export function recordMonsterAppearance(
  zukan: Zukan,
  monster: Monster,
  now: number,
): Zukan {
  return recordAppearance(zukan, monster, now);
}

/**
 * Localized "discovered / total" count label for the zukan header, sourced
 * from the "zukan.count" i18n template (JA 発見 {discovered} / {total}, EN
 * Discovered {discovered} / {total}). Pure and React/DOM-free so it can be
 * unit-tested; the component passes discoveredCount(zukan) + ZUKAN_TOTAL.
 */
export function zukanCountLabel(discovered: number, total: number, lang: Lang): string {
  return t(lang, "zukan.count")
    .replace("{discovered}", String(discovered))
    .replace("{total}", String(total));
}

/**
 * Localized "days raised" value for a zukan entry: the day count followed by
 * the localized unit suffix ("zukan.daysUnit" — JA 日 with no space, EN " days"
 * with a leading space). Pure and React/DOM-free so it can be unit-tested.
 */
export function daysRaisedLabel(days: number, lang: Lang): string {
  return `${days}${t(lang, "zukan.daysUnit")}`;
}

/**
 * Localized first-seen date for a zukan entry, formatted via the platform
 * Intl locale ('en-US' for English, 'ja-JP' otherwise). toLocaleDateString is
 * available under Node so this stays React/DOM-free and testable, but the
 * exact output is locale-data-dependent so tests only assert non-empty for a
 * finite ms and '' for non-finite. Guarded to '' for non-finite input.
 */
export function firstSeenDateLabel(epochMs: number, lang: Lang): string {
  if (!Number.isFinite(epochMs)) {
    return "";
  }
  return new Date(epochMs).toLocaleDateString(lang === "en" ? "en-US" : "ja-JP");
}

// --- Chat transcript persistence (会話履歴の永続化) — issue #37 --------------

/**
 * One persisted chat line. A STRUCTURAL subset of the `ChatLine` type owned by
 * state/useMonster.ts (`{ role; text; modelId? }`), redeclared locally to avoid
 * a circular import (useMonster.ts already imports from this module), mirroring
 * how {@link latestMonsterReply} accepts a structural subset. The optional
 * `modelId` is preserved for monster lines so a restored transcript still shows
 * which model produced each reply.
 */
export interface StoredChatLine {
  role: "player" | "monster";
  text: string;
  modelId?: string;
}

/**
 * STORAGE CHOICE (issue #37): the chat transcript is persisted in localStorage
 * keyed PER MONSTER under `ddm.chat.<monsterId>`, consistent with the app's
 * no-auth, browser-owned-id design and the existing `ddm.*` guarded helpers
 * (see {@link petStorageKey} / {@link ZUKAN_STORAGE_KEY}). Keying per monster id
 * means a reset — which rehatches under the SAME id — can wipe exactly this
 * monster's transcript, and multiple browser profiles never collide. This
 * deliberately avoids any DynamoDB schema / Monster save-shape / validateMonster
 * change: the transcript is a browser-local convenience, not part of the
 * authoritative monster record.
 */
export function chatStorageKey(monsterId: string): string {
  return `ddm.chat.${monsterId}`;
}

/**
 * Parse a stored chat log (raw JSON string or null) into a clean
 * {@link StoredChatLine}[]. PURE and unit-testable: JSON.parse inside a
 * try/catch, keeping ONLY well-formed entries whose `role` is exactly
 * `'player'` or `'monster'` and whose `text` is a string. The optional
 * `modelId` is preserved (only when it is a string). Returns `[]` on null,
 * empty, malformed JSON, or a non-array payload. Mirrors the validation shape
 * of the shared `trimChatHistory` but keeps the UI-only `modelId` field.
 */
export function parseChatLog(raw: string | null): StoredChatLine[] {
  if (raw === null || raw === "") {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const lines: StoredChatLine[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const { role, text, modelId } = entry as {
      role?: unknown;
      text?: unknown;
      modelId?: unknown;
    };
    if (role !== "player" && role !== "monster") {
      continue;
    }
    if (typeof text !== "string") {
      continue;
    }
    const line: StoredChatLine = { role, text };
    if (typeof modelId === "string") {
      line.modelId = modelId;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Serialize a chat log to a JSON string for storage. PURE: trims to the most
 * recent {@link MAX_CHAT_TURNS} lines FIRST (keeping the latest) so the stored
 * size stays bounded regardless of how long the live transcript grows.
 */
export function serializeChatLog(log: ReadonlyArray<StoredChatLine>): string {
  const bounded =
    log.length > MAX_CHAT_TURNS ? log.slice(log.length - MAX_CHAT_TURNS) : log;
  return JSON.stringify(bounded);
}

/**
 * Read the raw chat-log JSON string for a monster from localStorage, guarded so
 * it never throws (localStorage can be absent or blocked). Mirrors
 * {@link readPetRecordRaw} / {@link readZukanRaw}. Returns `null` when storage
 * is unavailable or the key is absent.
 */
export function readChatLogRaw(monsterId: string): string | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage.getItem(chatStorageKey(monsterId));
  } catch {
    return null;
  }
}

/**
 * Read + parse the persisted chat log for a monster. Thin composition of
 * {@link readChatLogRaw} and {@link parseChatLog}; never throws.
 */
export function readChatLog(monsterId: string): StoredChatLine[] {
  return parseChatLog(readChatLogRaw(monsterId));
}

/**
 * Persist a chat log for a monster to localStorage, guarded so it never throws.
 * The log is bounded to {@link MAX_CHAT_TURNS} by {@link serializeChatLog}.
 */
export function writeChatLog(monsterId: string, log: ReadonlyArray<StoredChatLine>): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(chatStorageKey(monsterId), serializeChatLog(log));
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

/** Remove a monster's persisted chat log from localStorage, guarded. */
export function clearChatLog(monsterId: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(chatStorageKey(monsterId));
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}
