import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BRANCH_FORMS,
  ZUKAN_APPEARANCES,
  ZUKAN_TOTAL,
  appearanceKey,
  daysRaisedAt,
  discoveredCount,
  isDiscovered,
  monsterAppearanceKey,
  recordAppearance,
  sanitizeZukan,
  zukanProgress,
  type Zukan,
} from "../zukan.ts";
import { createMonster } from "../game.ts";
import type { GrowthStage, Monster, MonsterForm } from "../types.ts";

const T0 = 1_000_000_000_000;
const DAY = 86_400_000;

/** Build a monster with specific tier/form/bornAt/name for testing. */
function monster(
  stageId: GrowthStage,
  form: MonsterForm,
  bornAt: number,
  name: string,
): Monster {
  return { ...createMonster("m-1", name, bornAt), stageId, form, bornAt };
}

test("ZUKAN_APPEARANCES enumerates exactly the 10 canonical appearances", () => {
  assert.equal(ZUKAN_TOTAL, 10);
  assert.equal(ZUKAN_APPEARANCES.length, 10);

  const keys = ZUKAN_APPEARANCES.map((a) => appearanceKey(a.stageId, a.form));
  assert.deepEqual(
    [...keys].sort(),
    [
      "baby:base",
      "champion:attack",
      "champion:defense",
      "champion:mischief",
      "rookie:attack",
      "rookie:defense",
      "rookie:mischief",
      "ultimate:attack",
      "ultimate:defense",
      "ultimate:mischief",
    ].sort(),
  );

  // baby:base is present...
  assert.ok(keys.includes("baby:base"));
  // ...but no non-baby tier has a reachable 'base' appearance.
  assert.ok(!keys.includes("rookie:base"));
  assert.ok(!keys.includes("champion:base"));
  assert.ok(!keys.includes("ultimate:base"));
  // baby never branches.
  assert.ok(!keys.includes("baby:attack"));

  assert.deepEqual([...BRANCH_FORMS], ["attack", "defense", "mischief"]);
});

test("appearanceKey + monsterAppearanceKey formatting", () => {
  assert.equal(appearanceKey("baby", "base"), "baby:base");
  assert.equal(appearanceKey("rookie", "attack"), "rookie:attack");

  // A baby always keys as baby:base.
  const baby = createMonster("m-1", "でじたん", T0);
  assert.equal(monsterAppearanceKey(baby), "baby:base");

  const champ = monster("champion", "defense", T0, "でじたん");
  assert.equal(monsterAppearanceKey(champ), "champion:defense");

  // An undefined/unknown form normalizes to base via formOf.
  const legacy = { ...createMonster("m-2", "レガシー", T0), stageId: "baby" as GrowthStage };
  delete (legacy as { form?: MonsterForm }).form;
  assert.equal(monsterAppearanceKey(legacy), "baby:base");
});

test("daysRaisedAt floors and clamps to >= 0", () => {
  // Same instant -> 0 days.
  assert.equal(daysRaisedAt(T0, T0), 0);
  // 2.9 days elapsed -> floored to 2.
  assert.equal(daysRaisedAt(T0, T0 + Math.floor(2.9 * DAY)), 2);
  // Exactly 3 days -> 3.
  assert.equal(daysRaisedAt(T0, T0 + 3 * DAY), 3);
  // Negative elapsed (clock skew) -> clamped to 0.
  assert.equal(daysRaisedAt(T0, T0 - 5 * DAY), 0);
});

test("recordAppearance adds exactly one entry on first discovery", () => {
  const zukan: Zukan = {};
  const m = monster("rookie", "attack", T0, "アタック");
  const next = recordAppearance(zukan, m, T0 + 2 * DAY);

  assert.equal(discoveredCount(next), 1);
  const entry = next["rookie:attack"];
  assert.ok(entry);
  assert.equal(entry.key, "rookie:attack");
  assert.equal(entry.stageId, "rookie");
  assert.equal(entry.form, "attack");
  assert.equal(entry.firstSeenAt, T0 + 2 * DAY);
  assert.equal(entry.daysRaised, 2);
  assert.equal(entry.name, "アタック");
  assert.ok(isDiscovered(next, "rookie", "attack"));
});

test("re-recording the same appearance is a no-op preserving first-seen", () => {
  const first = recordAppearance({}, monster("rookie", "attack", T0, "最初"), T0 + 1 * DAY);
  // Later discovery, different name — must NOT overwrite.
  const second = recordAppearance(
    first,
    monster("rookie", "attack", T0, "あとで"),
    T0 + 10 * DAY,
  );

  // Same object identity (true no-op).
  assert.equal(second, first);
  const entry = second["rookie:attack"];
  assert.equal(entry.firstSeenAt, T0 + 1 * DAY);
  assert.equal(entry.daysRaised, 1);
  assert.equal(entry.name, "最初");
  assert.equal(discoveredCount(second), 1);
});

test("recordAppearance never mutates its input", () => {
  const zukan: Zukan = {};
  const m = monster("champion", "defense", T0, "ディフェンス");
  const next = recordAppearance(zukan, m, T0);

  // Input object untouched.
  assert.deepEqual(zukan, {});
  assert.notEqual(next, zukan);
  // Monster untouched.
  assert.equal(m.name, "ディフェンス");
  assert.equal(m.stageId, "champion");
});

test("recordAppearance ignores an unreachable / non-canonical combo", () => {
  const zukan: Zukan = {};
  // rookie:base is unreachable in normal play.
  const bogus = monster("rookie", "base", T0, "ありえない");
  const next = recordAppearance(zukan, bogus, T0);
  assert.equal(next, zukan);
  assert.equal(discoveredCount(next), 0);
  assert.ok(!isDiscovered(next, "rookie", "base"));
});

test("discoveredCount / zukanProgress are correct across several records", () => {
  let zukan: Zukan = {};
  assert.deepEqual(zukanProgress(zukan), { discovered: 0, total: 10 });

  zukan = recordAppearance(zukan, createMonster("b", "ベビー", T0), T0);
  zukan = recordAppearance(zukan, monster("rookie", "attack", T0, "a"), T0 + DAY);
  zukan = recordAppearance(zukan, monster("champion", "mischief", T0, "c"), T0 + 2 * DAY);
  // Duplicate — should not increase the count.
  zukan = recordAppearance(zukan, monster("rookie", "attack", T0, "dup"), T0 + 3 * DAY);

  assert.equal(discoveredCount(zukan), 3);
  assert.deepEqual(zukanProgress(zukan), { discovered: 3, total: 10 });
});

test("sanitizeZukan drops non-canonical keys and malformed entries, keeps valid ones", () => {
  const valid = {
    key: "rookie:attack",
    stageId: "rookie",
    form: "attack",
    firstSeenAt: T0,
    daysRaised: 2,
    name: "よい",
  };
  const raw = {
    // valid canonical entry — kept.
    "rookie:attack": valid,
    // non-canonical key — dropped.
    "rookie:base": { ...valid, key: "rookie:base", form: "base" },
    // malformed: name not a string — dropped.
    "champion:attack": { ...valid, key: "champion:attack", stageId: "champion", name: 42 },
    // malformed: non-finite number — dropped.
    "champion:defense": {
      ...valid,
      key: "champion:defense",
      stageId: "champion",
      form: "defense",
      firstSeenAt: Number.NaN,
    },
    // mismatched fields vs key — dropped.
    "ultimate:attack": { ...valid, key: "ultimate:attack", stageId: "rookie", form: "attack" },
    // not an object — dropped.
    "baby:base": "nope",
  };

  const clean = sanitizeZukan(raw);
  assert.deepEqual(Object.keys(clean), ["rookie:attack"]);
  assert.deepEqual(clean["rookie:attack"], {
    key: "rookie:attack",
    stageId: "rookie",
    form: "attack",
    firstSeenAt: T0,
    daysRaised: 2,
    name: "よい",
  });

  // Non-object / null inputs yield an empty zukan without throwing.
  assert.deepEqual(sanitizeZukan(null), {});
  assert.deepEqual(sanitizeZukan(undefined), {});
  assert.deepEqual(sanitizeZukan(123), {});
});
