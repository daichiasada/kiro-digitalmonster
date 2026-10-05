import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import type { BattleRequest, BattleResult, Monster } from "@ddm/shared";
import { getStage, recordBattleWinAffection, reviveMonster, simulateBattle } from "@ddm/shared";
import { getMonster as loadMonster, putMonster } from "../dynamo.ts";
import { error, handlePreflight, ok, parseBody } from "../lib/http.ts";

/**
 * Build a simple enemy scaled to the player's current stage. The enemy is
 * slightly weaker than the stage's base stats so battles are winnable but not
 * trivial.
 */
function buildEnemy(player: Monster): Monster {
  const stage = getStage(player.stageId);
  const now = Date.now();
  return {
    id: `enemy-${player.stageId}`,
    name: `野生の${stage.labelJa}モンスター`,
    stageId: player.stageId,
    stats: {
      maxHp: Math.round(stage.baseStats.maxHp * 0.9),
      hp: Math.round(stage.baseStats.maxHp * 0.9),
      atk: Math.max(1, Math.round(stage.baseStats.atk * 0.9)),
      def: Math.max(0, Math.round(stage.baseStats.def * 0.9)),
    },
    trainingCount: 0,
    careCounters: { feed: 0, sleep: 0, clean: 0 },
    bornAt: now,
    lastUpdatedAt: now,
    isSleeping: false,
    dirty: false,
    hungryLevel: 0,
  };
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
 * POST /battle  { monsterId }
 *
 * Loads the monster, builds a stage-scaled enemy, simulates the battle via the
 * shared pure logic, applies simple win/loss stat changes, persists the
 * result, and returns the BattleResult together with the updated monster.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const preflight = handlePreflight(event.requestContext?.http?.method);
  if (preflight !== null) {
    return preflight;
  }

  const body = parseBody<Pick<BattleRequest, "seed"> & { monsterId?: string }>(
    event.body,
    event.isBase64Encoded,
  );
  if (body === null || typeof body.monsterId !== "string" || body.monsterId === "") {
    return error(400, "monsterId is required");
  }

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

  const enemy = buildEnemy(player);
  const result: BattleResult = simulateBattle(player, enemy, body.seed);

  // Apply simple win/loss stat changes.
  let updated: Monster = {
    ...player,
    stats: { ...player.stats, hp: result.playerHpAfter },
    lastUpdatedAt: now,
  };

  if (result.winner === "player") {
    // Victory: a small permanent stat boost.
    updated = {
      ...updated,
      stats: {
        ...updated.stats,
        atk: updated.stats.atk + 1,
        def: updated.stats.def + 1,
      },
    };
    // A win also deepens the bond: raise affection by AFFECTION_GAIN_BATTLE_WIN
    // via the shared helper (returns a NEW monster, clamped) before persisting.
    updated = recordBattleWinAffection(updated, now);
  }

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
