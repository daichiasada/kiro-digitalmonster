import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import type { BattleResult, Difficulty, Monster } from "@ddm/shared";
import {
  battleReward,
  generateEnemy,
  recordBattleOutcome,
  recordBattleWinAffection,
  reviveMonster,
  simulateBattle,
} from "@ddm/shared";
import { getMonster as loadMonster, putMonster } from "../dynamo.ts";
import { error, handlePreflight, ok, parseBody } from "../lib/http.ts";

/** Difficulties accepted from the client; anything else falls back to "normal". */
const VALID_DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];

/**
 * Resolve the requested difficulty, defaulting to "normal" when the client
 * sends nothing or an unknown string (guards against arbitrary payloads).
 */
function resolveDifficulty(value: unknown): Difficulty {
  return VALID_DIFFICULTIES.includes(value as Difficulty) ? (value as Difficulty) : "normal";
}

/** Clamp hp into [0, maxHp] and keep stats non-negative integers. */
function clampStats(monster: Monster): Monster {
  const maxHp = Math.max(1, Math.round(monster.stats.maxHp));
  return {
    ...monster,
    stats: {
      maxHp,
      hp: Math.max(0, Math.min(maxHp, Math.round(monster.stats.hp))),
      atk: Math.max(0, Math.round(monster.stats.atk)),
      def: Math.max(0, Math.round(monster.stats.def)),
    },
  };
}

/**
 * POST /battle  { monsterId, difficulty?, seed? }
 *
 * Loads the monster, deterministically regenerates the SAME enemy the client
 * previewed via the shared `generateEnemy(stage, difficulty, seed)`, simulates
 * the battle with the SAME seed (so preview == fight), applies the
 * difficulty-scaled win reward, records the win/loss/draw/streak via the shared
 * helper, persists the result, and returns the BattleResult together with the
 * updated monster.
 *
 * Determinism: the client sends `seed` so its pre-battle preview (enemy +
 * optional simulated outcome) matches the real fight exactly. An absent seed
 * means no client preview was shown; the server then falls back to Date.now()
 * so the enemy and simulation are still mutually reproducible from that one seed.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const preflight = handlePreflight(event.requestContext?.http?.method);
  if (preflight !== null) {
    return preflight;
  }

  const body = parseBody<{ monsterId?: string; difficulty?: Difficulty; seed?: number }>(
    event.body,
    event.isBase64Encoded,
  );
  if (body === null || typeof body.monsterId !== "string" || body.monsterId === "") {
    return error(400, "monsterId is required");
  }

  const difficulty = resolveDifficulty(body.difficulty);
  // Use the client-sent seed when present so the client preview and the actual
  // fight are built from the same seed; otherwise fall back to a server value.
  const seed = typeof body.seed === "number" ? body.seed : Date.now();

  let player: Monster | null;
  try {
    player = await loadMonster(body.monsterId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return error(500, `Failed to load monster: ${message}`);
  }

  if (player === null) {
    return error(404, "Monster not found");
  }

  // Never let a monster that was stranded at 0 HP (e.g. a previous loss or
  // starvation) be unable to fight: revive it to a small HP floor on load.
  const now = Date.now();
  player = reviveMonster(player, now);

  // Regenerate the exact enemy the client previewed from (stage, difficulty,
  // seed), and run the simulation with the SAME seed so both are reproducible
  // from the request.
  const enemy = generateEnemy(player.stageId, difficulty, seed);
  const result: BattleResult = simulateBattle(player, enemy, seed);

  // Apply the battle outcome to the revived player.
  let updated: Monster = {
    ...player,
    stats: { ...player.stats, hp: result.playerHpAfter },
    lastUpdatedAt: now,
  };

  if (result.winner === "player") {
    // Victory: a difficulty-scaled permanent stat boost (stronger enemies grant
    // a larger reward). This replaces the old hardcoded +1/+1.
    const reward = battleReward(difficulty, true);
    updated = {
      ...updated,
      stats: {
        ...updated.stats,
        atk: updated.stats.atk + reward.atk,
        def: updated.stats.def + reward.def,
      },
    };
    // A win also deepens the bond: raise affection by AFFECTION_GAIN_BATTLE_WIN
    // via the shared helper (returns a NEW monster, clamped) before persisting.
    updated = recordBattleWinAffection(updated, now);
  }

  // Persist the win/loss/draw/streak record for EVERY outcome. recordBattleOutcome
  // defaults a missing record via battleRecordOf internally, so a legacy save
  // without `battleRecord` is persisted back with a full, zeroed-then-updated
  // record (backward compatible).
  updated = recordBattleOutcome(updated, result.winner, now);

  updated = clampStats(updated);
  // A loss can leave the monster at 0 HP; revive to a floor so it is never
  // permanently stranded and unable to battle again.
  updated = reviveMonster(updated, now);

  try {
    await putMonster(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return error(500, `Failed to persist battle result: ${message}`);
  }

  return ok({ result, monster: updated });
};
