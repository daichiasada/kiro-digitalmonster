/**
 * Web Audio sound engine (issue #45).
 *
 * This is the browser/DOM side of the sound feature. It is DELIBERATELY NOT
 * unit-tested: `AudioContext` / `OscillatorNode` are browser-only APIs that
 * cannot run under the Node test runner. All of the testable decisions (which
 * tone an event maps to, how the volume is clamped, whether a sound should play
 * at all) live as pure functions in ui-helpers.ts and ARE unit-tested; this
 * module only turns those decisions into actual audio.
 *
 * AUTOPLAY POLICY (acceptance criterion of #45):
 *   1. The single AudioContext is created LAZILY — only inside {@link playSound}
 *      — never at module load / import time. Browsers block or suspend an
 *      AudioContext created without a user gesture, so constructing it eagerly
 *      would either throw a console warning or leave a dangling suspended
 *      context.
 *   2. {@link playSound} is only ever called from user-gesture-driven handlers
 *      (feed/train care buttons, the Fight button and its gesture-initiated
 *      battle replay, and the settings toggle). It calls `resume()` so the
 *      first such gesture satisfies the browser's autoplay policy.
 *   3. Sound effects default to OFF (muted): `DEFAULT_SETTINGS.sfxEnabled` is
 *      false. Nothing plays until the user explicitly enables SFX AND volume
 *      > 0, so even the very first gesture is silent until the user opts in.
 *      Enabling SFX is itself a user gesture, so by the time anything can play
 *      the context can always be resumed.
 *
 * The whole engine is guarded in try/catch and no-ops when `window` or
 * `AudioContext` is unavailable, so it can never throw into the UI.
 */
import { clampVolume, shouldPlaySound, soundTone } from "./ui-helpers.ts";
import type { SoundEvent, SoundTone } from "./ui-helpers.ts";

/** Options controlling whether and how loud a sound plays. */
export interface PlaySoundOptions {
  /** Whether sound effects are enabled (user setting). */
  enabled: boolean;
  /** User volume in [0, 1]; clamped internally. */
  volume: number;
}

/** Lazily-created singleton AudioContext (null until the first gesture plays). */
let ctx: AudioContext | null = null;

/** Short envelope times (seconds) applied to every note to avoid clicks. */
const ATTACK_S = 0.005;
const RELEASE_S = 0.03;

/**
 * Resolve the browser AudioContext constructor, tolerating the webkit prefix.
 * Returns null when running without a DOM (SSR / tests) or on a browser with no
 * Web Audio support.
 */
function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Lazily create (and resume) the shared AudioContext. Called only from
 * {@link playSound}, which is only reached from a user gesture, so the resume()
 * here is autoplay-policy compliant. Returns null if Web Audio is unavailable.
 */
function ensureContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (Ctor === null) {
    return null;
  }
  if (ctx === null) {
    ctx = new Ctor();
  }
  // Resume a suspended context (first gesture / returning from background).
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

/**
 * Schedule a single note on the shared context starting at `startAt`. The gain
 * node applies a quick attack and release envelope so notes do not click, and
 * scales the per-note peak by the user's clamped volume. Returns the time at
 * which the note ends so a jingle can chain the next note.
 */
function scheduleNote(
  context: AudioContext,
  tone: SoundTone,
  startAt: number,
  volume: number,
): number {
  const durationS = Math.max(0, tone.durationMs) / 1000;
  const peak = clampVolume(tone.gain) * volume;

  const osc = context.createOscillator();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.freq, startAt);

  const gainNode = context.createGain();
  gainNode.gain.setValueAtTime(0, startAt);
  // Quick attack to the peak, then a short release down to (near) zero.
  gainNode.gain.linearRampToValueAtTime(peak, startAt + ATTACK_S);
  const endAt = startAt + durationS;
  gainNode.gain.setValueAtTime(peak, Math.max(startAt + ATTACK_S, endAt - RELEASE_S));
  gainNode.gain.linearRampToValueAtTime(0.0001, endAt);

  osc.connect(gainNode);
  gainNode.connect(context.destination);
  osc.start(startAt);
  osc.stop(endAt);
  return endAt;
}

/**
 * Play the sound effect for a game event, honoring the user's SFX settings.
 *
 * Returns early (plays nothing) when {@link shouldPlaySound} is false — i.e.
 * SFX disabled or volume 0 — which is also the default state (muted). Lazily
 * creates/resumes the AudioContext, then schedules the event's tone(s). Any
 * failure is swallowed so audio problems never break the game UI.
 *
 * MUST only be called from user-gesture-driven handlers (see the autoplay
 * policy in this file's top JSDoc).
 */
export function playSound(event: SoundEvent, opts: PlaySoundOptions): void {
  const { enabled, volume } = opts;
  if (!shouldPlaySound(enabled, volume)) {
    return;
  }
  try {
    const context = ensureContext();
    if (context === null) {
      return;
    }
    const vol = clampVolume(volume);
    const config = soundTone(event);
    const steps = Array.isArray(config) ? config : [config];

    let cursor = context.currentTime;
    for (const step of steps) {
      cursor = scheduleNote(context, step, cursor, vol);
    }
  } catch {
    // Never let an audio failure (unsupported context, blocked autoplay, etc.)
    // bubble into the UI.
  }
}
