import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { applyTimePassage } from "@ddm/shared";
import { getMonster as loadMonster, putMonster } from "../dynamo.ts";
import { error, handlePreflight, ok } from "../lib/http.ts";

/**
 * GET /monster/{id}  (or ?monsterId=...)
 *
 * Loads a monster from DynamoDB. If it does not exist, responds 404 so the
 * frontend knows to create (hatch) a new one. On load we advance the
 * monster's state by elapsed time and evolve it if it now qualifies,
 * persisting the result when anything changed.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const preflight = handlePreflight(event.requestContext?.http?.method);
  if (preflight !== null) {
    return preflight;
  }

  const monsterId =
    event.pathParameters?.monsterId ??
    event.pathParameters?.id ??
    event.queryStringParameters?.monsterId ??
    event.queryStringParameters?.id;

  if (monsterId === undefined || monsterId === "") {
    return error(400, "monsterId is required");
  }

  try {
    const stored = await loadMonster(monsterId);
    if (stored === null) {
      return error(404, "Monster not found");
    }

    const now = Date.now();
    // applyTimePassage advances elapsed-time effects AND evolves the monster
    // through every stage it now qualifies for (rebasing stats via
    // applyEvolution at each step) in a single call. It is the single
    // evolution path; we deliberately do NOT call evolveStage again here,
    // which would move stageId without rebasing stats.
    const updated = applyTimePassage(stored, now);

    const changed =
      updated.lastUpdatedAt !== stored.lastUpdatedAt ||
      updated.stageId !== stored.stageId;

    if (changed) {
      await putMonster(updated);
    }

    return ok({ monster: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return error(500, `Failed to load monster: ${message}`);
  }
};
