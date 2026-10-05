/**
 * Per-variant SVG accent overlays for the evolution-branch forms (issue #38).
 *
 * Each stage sprite (Rookie / Champion / Ultimate) renders the SAME existing
 * SVG skeleton and, when a branch `form` is active, overlays a small,
 * lightweight accent `<g>` on top of it. The three branch variants are:
 *
 *   - attack   — a fiery red/orange accent (a sharp flame/horn mark)
 *   - defense  — a sturdy green/blue accent (a shield-like belly emblem)
 *   - mischief — a purple accent (a crooked grin + spark)
 *
 * The accent is PURELY ADDITIVE: for the default `base` form (and legacy saves
 * whose form is undefined) {@link FormAccent} renders `null`, so the base look
 * stays byte-identical to the pre-#38 sprite. No new assets or dependencies —
 * just a handful of inline SVG primitives.
 *
 * The viewBox of every stage sprite is a fixed `0 0 200 200`, so the accent
 * coordinates are expressed in that same space and scale with `size`.
 */
import type { MonsterForm } from "@ddm/shared";

/** Which stage the accent is drawn over, so it can sit near the right spot. */
export type AccentStage = "rookie" | "champion" | "ultimate";

/**
 * Render the per-form accent overlay for a stage sprite, or `null` for the
 * `base`/undefined form (keeping the base rendering byte-identical).
 *
 * The accent is decorative only (`aria-hidden`); the sprite's own `<title>` /
 * `aria-label` already names the creature for assistive tech, and the StatsPanel
 * surfaces the form as accessible plain text, so the variant meaning is never
 * color-only.
 */
export function FormAccent({ form, stage }: { form: MonsterForm | undefined; stage: AccentStage }) {
  if (form === undefined || form === "base") {
    return null;
  }

  // Head/body anchor shifts a little per stage so the mark lands on the sprite.
  const headY = stage === "rookie" ? 78 : stage === "champion" ? 68 : 62;
  const bellyY = stage === "rookie" ? 130 : stage === "champion" ? 128 : 140;

  if (form === "attack") {
    // Fiery red/orange: a sharp flame mark above the head + a hot accent horn.
    return (
      <g className="form-accent form-accent-attack" aria-hidden="true">
        <path
          d={`M100 ${headY - 46} L108 ${headY - 24} L100 ${headY - 30} L92 ${headY - 24} Z`}
          fill="#ff5a1f"
          stroke="#c21807"
          strokeWidth="2"
        />
        <path
          d={`M100 ${headY - 40} L104 ${headY - 28} L100 ${headY - 31} L96 ${headY - 28} Z`}
          fill="#ffd166"
        />
      </g>
    );
  }

  if (form === "defense") {
    // Sturdy green/blue: a shield emblem over the belly/chest.
    return (
      <g className="form-accent form-accent-defense" aria-hidden="true">
        <path
          d={`M100 ${bellyY - 16} L116 ${bellyY - 8} L116 ${bellyY + 6} Q116 ${bellyY + 18} 100 ${bellyY + 24} Q84 ${bellyY + 18} 84 ${bellyY + 6} L84 ${bellyY - 8} Z`}
          fill="#2fa36b"
          stroke="#1f6d8c"
          strokeWidth="2.5"
        />
        <path
          d={`M100 ${bellyY - 10} L100 ${bellyY + 16} M90 ${bellyY + 2} L110 ${bellyY + 2}`}
          stroke="#dff5ec"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
    );
  }

  // mischief — purple: a crooked grin near the head + a little spark.
  return (
    <g className="form-accent form-accent-mischief" aria-hidden="true">
      <path
        d={`M88 ${headY + 18} Q98 ${headY + 28} 112 ${headY + 16}`}
        fill="none"
        stroke="#7a3fd6"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d={`M118 ${headY - 20} l4 -8 l2 8 l8 2 l-8 2 l-2 8 l-4 -8 l-8 -2 Z`}
        fill="#b78cff"
        stroke="#5a2fb8"
        strokeWidth="1.5"
      />
    </g>
  );
}

export default FormAccent;
