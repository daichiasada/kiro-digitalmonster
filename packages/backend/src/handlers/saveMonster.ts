import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import type { Monster, SaveMonsterRequest } from "@ddm/shared";
import { validateMonster } from "@ddm/shared";
import { putMonster } from "../dynamo.ts";
import { error, handlePreflight, ok, parseBody } from "../lib/http.ts";

/**
 * PUT /monster  (or POST /monster)
 *
 * Validates the posted monster and writes it to DynamoDB. Accepts either a
 * bare Monster object or a { monster } envelope ({@link SaveMonsterRequest}).
 *
 * Saves are CLIENT-AUTHORITATIVE by design: there is no auth, the browser owns
 * its random monsterId, and it posts the full monster state. We do a shared
 * {@link validateMonster} structural check (including nested stats/careCounters
 * and a known stageId) so an obviously malformed payload is rejected rather
 * than silently persisted — but we intentionally do not clamp or re-derive
 * state here (no anti-tamper). The time-passage authority lives in getMonster.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const preflight = handlePreflight(event.requestContext?.http?.method);
  if (preflight !== null) {
    return preflight;
  }

  const parsed = parseBody<SaveMonsterRequest | Monster>(
    event.body,
    event.isBase64Encoded,
  );
  if (parsed === null) {
    return error(400, "Invalid or empty JSON body");
  }

  const candidate =
    "monster" in (parsed as SaveMonsterRequest)
      ? (parsed as SaveMonsterRequest).monster
      : (parsed as Monster);

  if (!validateMonster(candidate)) {
    return error(400, "Request body is not a valid monster");
  }

  try {
    const saved = await putMonster(candidate);
    return ok({ ok: true, monster: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return error(500, `Failed to save monster: ${message}`);
  }
};
