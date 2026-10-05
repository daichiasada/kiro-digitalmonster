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
 *   2. Sound effects default to OFF (muted): `DEFAULT_SETTINGS.sfxEnabled` is
 *      false. Nothing plays until the user explicitly enables SFX AND volume
 *      > 0, so even the very first gesture is silent until the user opts in.
 *   3. The autoplay guarantee is ENFORCED here rather than assumed: an event
 *      such as evolution can reach {@link playSound} from a background
 *      TIME_TICK with no fresh user gesture (e.g. right after a page reload
 *      that restored `sfxEnabled: true` from storage). In that case the
 *      lazily-created context starts suspended; we call `resume()` (which the
 *      browser only honors once a gesture has occurred) but DO NOT schedule any
 *      oscillators while the context is not actually `running`. So a
 *      non-running context is a clean, silent no-op — notes are only ever
 *      produced once the context has genuinely reached the `running` state,
 *      which only happens inside/after a real user gesture.
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
 * Lazily create the shared AudioContext and attempt to resume it. Returns null
 * if Web Audio is unavailable.
 *
 * A `resume()` is requested whenever the context is suspended; the browser only
 * honors it once a real user gesture has occurred, so this is autoplay-safe.
 * The returned context may still be `suspended` (e.g. a background evolution
 * tick after a reload with no fresh gesture yet) — callers MUST check
 * `state === "running"` before scheduling audio. See {@link playSound}.
 */
function ensureContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (Ctor === null) {
    return null;
  }
  if (ctx === null) {
    ctx = new Ctor();
  }
  // Resume a suspended context (first gesture / returning from background). The
  // browser rejects this outside a gesture, leaving the context suspended.
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
 * creates/resumes the AudioContext, then schedules the event's tone(s) ONLY
 * when the context has actually reached the `running` state. A suspended /
 * not-yet-resumed context (e.g. a background evolution tick after a reload with
 * no fresh gesture) is a clean, silent no-op — this is what enforces the
 * autoplay guarantee rather than relying on the browser to drop stray notes.
 * Any failure is swallowed so audio problems never break the game UI.
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
    // Autoplay guard: only emit audio once the context is genuinely running
    // (which only happens inside/after a real user gesture). If it is still
    // suspended, ensureContext() has already requested a resume() for next
    // time, and we silently skip scheduling now.
    if (context.state !== "running") {
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
