/**
 * Monster 図鑑 (collection) core — issue #39.
 *
 * This is the single source of truth for the collection logic: the canonical
 * set of attainable appearances, the entry key format, the ZukanEntry/Zukan
 * shapes, the days-raised derivation, and the first-seen merge + counts rules.
 *
 * It is DELIBERATELY PURE: no DOM, no storage, no React, no JA/EN strings
 * (labels live in the frontend i18n/ui-helpers). The frontend storage glue
 * (FEAT-002) and the 図鑑 UI (FEAT-003) build on top of this module.
 *
 * CANONICAL APPEARANCE SET
 * ------------------------
 * An "appearance" is a (tier, form) pair. The reachable set is:
 *   - baby only ever has form "base" — the baby tier NEVER branches
 *     (`applyEvolution` keeps the baby form "base", and nothing evolves INTO
 *     the baby tier), so the only attainable baby appearance is "baby:base".
 *   - rookie / champion / ultimate each have the three BRANCH forms
 *     {attack, defense, mischief}.
 *
 * We EXCLUDE the "base" form at rookie/champion/ultimate because it is
 * UNREACHABLE in normal play: `chooseEvolutionForm` (evolution.ts) always
 * returns one of {attack, defense, mischief} for a non-baby tier — it never
 * yields "base" — so a "base" rookie/champion/ultimate cannot occur. Recording
 * such a combo is therefore guarded out.
 *
 * Total = baby:base + (rookie|champion|ultimate) x {attack, defense, mischief}
 *       = 1 + 3 x 3 = 10 appearances.
 *
 * The set is DERIVED programmatically from STAGES order + BRANCH_FORMS so it
 * stays in sync with the stage configuration rather than being hardcoded.
 */

import type { GrowthStage, Monster, MonsterForm } from "./types.ts";
import { STAGES } from "./stages.ts";
import { formOf } from "./game.ts";

/** Milliseconds in one day — the divisor for the days-raised derivation. */
const MS_PER_DAY = 86_400_000;

/**
 * The three BRANCH forms a non-baby tier can take. Deliberately EXCLUDES
 * "base": the baby tier yields only "base" (handled below), and a "base"
 * rookie/champion/ultimate is unreachable in normal play (see file header).
 */
export const BRANCH_FORMS: readonly MonsterForm[] = ["attack", "defense", "mischief"];

/** A single attainable appearance: a (tier, form) pair. */
export interface ZukanAppearance {
  stageId: GrowthStage;
  form: MonsterForm;
}

/**
 * The canonical set of attainable appearances, derived from STAGES order:
 * the baby tier contributes only {baby, base}; every other tier contributes
 * one entry per BRANCH_FORMS value. See the file header for the full rule.
 */
export const ZUKAN_APPEARANCES: readonly ZukanAppearance[] = STAGES.flatMap((stage) =>
  stage.id === "baby"
    ? [{ stageId: stage.id, form: "base" as MonsterForm }]
    : BRANCH_FORMS.map((form) => ({ stageId: stage.id, form })),
);

/** Total number of canonical appearances (10). */
export const ZUKAN_TOTAL: number = ZUKAN_APPEARANCES.length;

/**
 * The appearance key for a (tier, form) pair, formatted `${stageId}:${form}`
 * (e.g. "baby:base", "rookie:attack"). This is the key used throughout the
 * Zukan record.
 */
export function appearanceKey(stageId: GrowthStage, form: MonsterForm): string {
  return `${stageId}:${form}`;
}

/**
 * The appearance key for a concrete monster, keyed off its NORMALIZED form via
 * `formOf` so callers never key off a missing/unknown form. A baby monster
 * (whose form is always normalized to "base") always keys as "baby:base".
 */
export function monsterAppearanceKey(monster: Monster): string {
  return appearanceKey(monster.stageId, formOf(monster));
}

/** The set of canonical appearance keys, for O(1) membership guards. */
const CANONICAL_KEYS: ReadonlySet<string> = new Set(
  ZUKAN_APPEARANCES.map((a) => appearanceKey(a.stageId, a.form)),
);

/** True iff `key` is one of the canonical appearance keys. */
function isCanonicalKey(key: string): boolean {
  return CANONICAL_KEYS.has(key);
}

/**
 * A recorded 図鑑 entry.
 *
 * `firstSeenAt`, `daysRaised` and `name` are captured AT FIRST DISCOVERY of
 * that appearance and are never overwritten (first-seen wins), so an entry is
 * a stable snapshot of the moment the player first reached that appearance.
 */
export interface ZukanEntry {
  /** The appearance key (`${stageId}:${form}`). */
  key: string;
  /** The tier of this appearance. */
  stageId: GrowthStage;
  /** The form of this appearance. */
  form: MonsterForm;
  /** Epoch ms when this appearance was FIRST discovered. */
  firstSeenAt: number;
  /** Whole days the monster had been raised at first discovery. */
  daysRaised: number;
  /** The monster's name at first discovery. */
  name: string;
}

/** The 図鑑: a map from appearance key to its first-seen entry. */
export type Zukan = Record<string, ZukanEntry>;

/**
 * Whole days elapsed since `bornAt` at the moment of discovery (`discoveredAt`),
 * floored to an integer and clamped to >= 0. A monster discovered on the same
 * day it was born reports 0; a negative elapsed (clock skew) also reports 0.
 */
export function daysRaisedAt(bornAt: number, discoveredAt: number): number {
  return Math.max(0, Math.floor((discoveredAt - bornAt) / MS_PER_DAY));
}

/**
 * Record a monster's current appearance into the 図鑑.
 *
 * PURE merge: returns a NEW Zukan object and never mutates the input. If the
 * monster's appearance is already recorded, the 図鑑 is returned UNCHANGED
 * (first-seen wins: firstSeenAt, daysRaised AND name are all preserved so the
 * entry stays a stable snapshot of first discovery). Only canonical
 * appearances are stored — a stray/unreachable combo (e.g. a hand-built
 * rookie+base) is silently ignored.
 */
export function recordAppearance(zukan: Zukan, monster: Monster, now: number): Zukan {
  const key = monsterAppearanceKey(monster);
  // Ignore unreachable / non-canonical combos.
  if (!isCanonicalKey(key)) {
    return zukan;
  }
  // First-seen wins: a known appearance is a no-op (same object returned).
  if (Object.prototype.hasOwnProperty.call(zukan, key)) {
    return zukan;
  }
  const entry: ZukanEntry = {
    key,
    stageId: monster.stageId,
    form: formOf(monster),
    firstSeenAt: now,
    daysRaised: daysRaisedAt(monster.bornAt, now),
    name: monster.name,
  };
  return { ...zukan, [key]: entry };
}

/** Count of recorded entries whose key is in the canonical set. */
export function discoveredCount(zukan: Zukan): number {
  let count = 0;
  for (const key of Object.keys(zukan)) {
    if (isCanonicalKey(key)) {
      count += 1;
    }
  }
  return count;
}

/** True iff the (tier, form) appearance has been discovered. */
export function isDiscovered(zukan: Zukan, stageId: GrowthStage, form: MonsterForm): boolean {
  return Object.prototype.hasOwnProperty.call(zukan, appearanceKey(stageId, form));
}

/** Collection progress: discovered count out of the canonical total. */
export function zukanProgress(zukan: Zukan): { discovered: number; total: number } {
  return { discovered: discoveredCount(zukan), total: ZUKAN_TOTAL };
}

/** True iff `value` is a finite number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Defensively parse an arbitrary value into a Zukan, keeping ONLY entries
 * whose key is canonical and whose fields are well-typed (string name, finite
 * numbers, matching stageId/form that reproduce the key), and dropping
 * anything malformed. Pure and never throws — used by the storage layer
 * (FEAT-002) so the storage glue stays thin.
 */
export function sanitizeZukan(raw: unknown): Zukan {
  const out: Zukan = {};
  if (typeof raw !== "object" || raw === null) {
    return out;
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!isCanonicalKey(key)) {
      continue;
    }
    const value = record[key];
    if (typeof value !== "object" || value === null) {
      continue;
    }
    const e = value as Record<string, unknown>;
    const stageId = e.stageId;
    const form = e.form;
    if (typeof stageId !== "string" || typeof form !== "string") {
      continue;
    }
    // The stored stageId/form must reproduce the canonical key, so a mislabeled
    // entry (right key, wrong fields) is rejected.
    if (appearanceKey(stageId as GrowthStage, form as MonsterForm) !== key) {
      continue;
    }
    if (typeof e.name !== "string") {
      continue;
    }
    if (!isFiniteNumber(e.firstSeenAt) || !isFiniteNumber(e.daysRaised)) {
      continue;
    }
    out[key] = {
      key,
      stageId: stageId as GrowthStage,
      form: form as MonsterForm,
      firstSeenAt: e.firstSeenAt,
      daysRaised: e.daysRaised,
      name: e.name,
    };
  }
  return out;
}
