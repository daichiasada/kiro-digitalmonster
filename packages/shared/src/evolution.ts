import type { Monster, MonsterForm } from "./types.ts";
import { battleRecordOf } from "./battle-enhancements.ts";

/* --------------------------------------------------------------------------
 * Evolution branching (issue #38 — お世話の質による進化分岐).
 *
 * This module owns the ONE pure, deterministic, total function that decides
 * which evolution FORM a monster takes based on how it has been raised:
 * `chooseEvolutionForm`. The evolution engine (game.ts `applyEvolution`) uses
 * it to assign `monster.form` on each non-baby tier advance, and the UI hint
 * (stages.ts `predictedNextForm`, surfaced in the StatsPanel) is derived from
 * the SAME function, so the displayed hint can never contradict the real
 * evolution outcome.
 *
 * It lives in its own module (rather than game.ts) to avoid an import cycle:
 * stages.ts needs it for `predictedNextForm`, and game.ts needs it for
 * `applyEvolution`. This module only imports `battleRecordOf` (from
 * battle-enhancements.ts) plus a tiny inline affection reader, so it never
 * imports game.ts or stages.ts back.
 * ------------------------------------------------------------------------ */

/**
 * The three evolvable variants, in the FIXED PRIORITY order used to break
 * ties. When two or more scores are equal, the earlier entry wins:
 * attack > defense > mischief. Documented and asserted by the branch tests.
 */
export const EVOLUTION_FORM_PRIORITY: readonly MonsterForm[] = [
  "attack",
  "defense",
  "mischief",
];

/**
 * Default affection used when a monster has no `affection` field (legacy
 * pre-#42 saves). Kept as a tiny local copy — identical to game.ts's
 * `AFFECTION_INITIAL` — so this module does not import game.ts (which would
 * create an import cycle via stages.ts). The exact value only shifts the
 * affection CONTRIBUTION to the scores; the branch rule stays total either way.
 */
const AFFECTION_DEFAULT = 20;

/** Read a monster's affection with a legacy-safe default (no game.ts import). */
function affectionValue(monster: Monster): number {
  const raw = monster.affection;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return AFFECTION_DEFAULT;
  }
  return raw;
}

/** Non-negative, finite coercion for a care counter / numeric field. */
function nonNeg(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The three branch scores for a monster, exposed for tests/UI that want to
 * explain WHY a form was chosen. Pure; derived entirely from care tendencies.
 */
export interface FormScores {
  attack: number;
  defense: number;
  mischief: number;
}

/**
 * Compute the three branch scores from a monster's care tendencies. Pure and
 * total — safe on a zeroed/legacy monster (every term defaults to 0 / the
 * neutral affection default).
 *
 * Signals (all read defensively):
 *   - attack  : training-heavy (trainingCount) and a high battle win rate.
 *   - defense : well-rested (careCounters.sleep), well-fed (careCounters.feed),
 *               kept clean (careCounters.clean) and highly affectionate.
 *   - mischief: NEGLECT — current hunger (hungryLevel), being dirty, and low
 *               affection all push toward the やんちゃ branch.
 *
 * The weights are deliberately simple integers so the tests can engineer an
 * exact tie. Win rate is wins / (wins + losses + draws), 0 when no battles.
 */
export function evolutionFormScores(monster: Monster): FormScores {
  const record = battleRecordOf(monster);
  const battles = record.wins + record.losses + record.draws;
  const winRate = battles > 0 ? record.wins / battles : 0;

  const training = nonNeg(monster.trainingCount);
  const feed = nonNeg(monster.careCounters?.feed);
  const sleepCount = nonNeg(monster.careCounters?.sleep);
  const clean = nonNeg(monster.careCounters?.clean);
  const hungry = nonNeg(monster.hungryLevel);
  const dirty = monster.dirty === true ? 1 : 0;
  const affection = affectionValue(monster);

  // attack: training + win rate (win rate scaled to be comparable to counts).
  const attack = training + winRate * 10;

  // defense: calm, consistent, affectionate care.
  const defense = sleepCount + feed + clean + affection / 10;

  // mischief: neglect signals. Low affection RAISES mischief (inverse of the
  // defense affection term), hunger and dirtiness add to it.
  const neglectAffection = Math.max(0, (100 - affection) / 10);
  const mischief = hungry + dirty * 4 + neglectAffection;

  return { attack, defense, mischief };
}

/**
 * Decide the evolution FORM a monster takes, from its care tendencies.
 *
 * PURE, DETERMINISTIC and TOTAL: for any monster (including a zeroed/legacy
 * one) it returns exactly one of "attack" | "defense" | "mischief". Ties are
 * resolved by {@link EVOLUTION_FORM_PRIORITY} (attack > defense > mischief).
 *
 * `now` is accepted for signature symmetry with the rest of the evolution
 * engine (and to allow future time-based signals) but the current rule does
 * not depend on it, which keeps the function trivially deterministic.
 */
export function chooseEvolutionForm(monster: Monster, _now: number = Date.now()): MonsterForm {
  const scores = evolutionFormScores(monster);
  let best: MonsterForm = EVOLUTION_FORM_PRIORITY[0]!;
  let bestScore = -Infinity;
  for (const form of EVOLUTION_FORM_PRIORITY) {
    const score = form === "attack" ? scores.attack : form === "defense" ? scores.defense : scores.mischief;
    if (score > bestScore) {
      bestScore = score;
      best = form;
    }
  }
  return best;
}
