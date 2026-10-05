import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import type { ChatContext, ChatRequest, ChatResponse, Lang, Monster } from "@ddm/shared";
import {
  AFFECTION_INITIAL,
  affectionBand,
  chooseChatContext,
  getStage,
  MAX_CHAT_MESSAGE_CHARS,
  resolveModelId,
  toAnthropicMessages,
  trimChatHistory,
} from "@ddm/shared";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { getMonster as loadMonster } from "../dynamo.ts";
import { awsRegion, bedrockOverrides } from "../config.ts";
import { error, handlePreflight, ok, parseBody } from "../lib/http.ts";

/** Reused Bedrock client across warm invocations. */
let bedrock: BedrockRuntimeClient | undefined;

function getBedrock(): BedrockRuntimeClient {
  if (bedrock === undefined) {
    bedrock = new BedrockRuntimeClient({ region: awsRegion() });
  }
  return bedrock;
}

/** Max tokens requested from the model; kept small for snappy, cheap replies. */
const MAX_TOKENS = 300;

/**
 * Build a system prompt reflecting the monster's stage + personality.
 *
 * `lang==='ja'` (the default when the client omits lang) returns the original
 * 6-line Japanese prompt BYTE-IDENTICAL, so already-deployed clients behave
 * exactly as before. `lang==='en'` returns an English prompt conveying the
 * same intent and instructs the model to reply in English.
 */
function buildSystemPrompt(context: ChatContext, lang: Lang): string {
  const stage = getStage(context.stageId);
  // Affection drives TONE. chooseChatContext defaults this to AFFECTION_INITIAL
  // (FEAT-001); guard here too for safety. The neutral band appends NOTHING so
  // the default prompt stays byte-identical to the pre-#42 behavior.
  //
  // INTENTIONAL (issue #42 review follow-up): the tone reflects the affection
  // the monster had ENTERING this turn, not including the +1 gain that this
  // same chat earns. The gain is applied + persisted by the client AFTER a
  // successful reply (useMonster.sendChat → gainAffectionFromChat), so the
  // NEXT turn's prompt (which reloads the persisted monster) picks it up.
  // We deliberately do NOT persist the gain here: keeping the client as the
  // SINGLE writer of the chat gain keeps the write path simple and avoids a
  // double-count (client + server) of the same interaction. The practical
  // impact is at most a one-turn lag in tone, and only in the rare case where
  // this chat's +1 (AFFECTION_GAIN_CHAT) is the delta that crosses a band
  // boundary (a cosmetic edge that self-corrects on the following turn).
  const affection = Number.isFinite(context.affection) ? context.affection : AFFECTION_INITIAL;
  const band = affectionBand(affection);

  if (lang === "en") {
    const lines = [
      `You are an AI monster named "${context.name}".`,
      `Your current growth stage is "${stage.labelEn}".`,
      "Chat briefly and in a friendly way with your owner (the player).",
      "Express a monster-like, innocent, and energetic personality in your voice.",
      `The higher the growth stage, the smarter and calmer you speak (currently ${stage.labelEn}).`,
      "Reply in English, in about 2-3 short sentences.",
    ];
    if (band === "warm") {
      lines.push(
        "You are very attached to this owner, so speak in a warmer, more familiar, affectionate and slightly spoiled tone.",
      );
    } else if (band === "cold") {
      lines.push(
        "You are not very attached to this owner yet, so speak in a slightly distant, reserved tone.",
      );
    }
    // Evolution form drives an extra tone layer (issue #38). "base" (and legacy
    // no-form saves, which formOf maps to "base") appends NOTHING so the EN
    // prompt stays byte-identical to pre-#38.
    if (context.form === "attack") {
      lines.push(
        "You evolved into an attack type, so speak in a brave, competitive, energetic fighter's tone.",
      );
    } else if (context.form === "defense") {
      lines.push(
        "You evolved into a defense type, so speak in a calm, gentle, protective tone.",
      );
    } else if (context.form === "mischief") {
      lines.push(
        "You evolved into a mischief type, so speak in a cheeky, playful, rascally tone.",
      );
    }
    return lines.join("\n");
  }
  const lines = [
    `あなたは「${context.name}」という名前のAIモンスターです。`,
    `現在の成長段階は「${stage.labelJa}」です。`,
    "飼い主（プレイヤー）と親しげに短く会話してください。",
    "一人称や口調はモンスターらしく、無邪気で元気な性格を表現してください。",
    `成長段階が上がるほど賢く、落ち着いた話し方になります（現在は${stage.labelJa}）。`,
    "返答は日本語で、2〜3文程度の短いものにしてください。",
  ];
  if (band === "warm") {
    lines.push(
      "飼い主にとても懐いているので、より親しげでくだけた、甘えん坊な口調で話してください。",
    );
  } else if (band === "cold") {
    lines.push(
      "まだあまり懐いていないので、よそよそしく少し距離のある口調で話してください。",
    );
  }
  // 進化タイプ（issue #38）による口調の味付け。"base"（および form を持たない
  // レガシーセーブ。formOf が "base" に正規化する）は何も追加しないので、中立の
  // プロンプトは #38 以前とバイト単位で同一のまま。
  if (context.form === "attack") {
    lines.push(
      "攻撃タイプに進化したので、勇敢で負けず嫌い、元気いっぱいの戦士のような口調で話してください。",
    );
  } else if (context.form === "defense") {
    lines.push(
      "防御タイプに進化したので、落ち着いて優しく、飼い主を守ろうとする頼もしい口調で話してください。",
    );
  } else if (context.form === "mischief") {
    lines.push(
      "やんちゃタイプに進化したので、生意気で遊び好き、いたずらっぽい口調で話してください。",
    );
  }
  return lines.join("\n");
}

/** The shape of the Anthropic Messages API response body from Bedrock. */
interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
}

/** Extract the assistant text from the parsed Bedrock response body. */
function extractText(payload: AnthropicResponse): string {
  if (!Array.isArray(payload.content)) {
    return "";
  }
  return payload.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("")
    .trim();
}

/**
 * POST /chat  { monsterId, message }
 *
 * Loads the monster, picks a Bedrock model by growth stage, and returns the
 * assistant reply. The baby stage cannot talk, so it returns a canned
 * non-verbal response WITHOUT invoking Bedrock.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const preflight = handlePreflight(event.requestContext?.http?.method);
  if (preflight !== null) {
    return preflight;
  }

  const body = parseBody<Partial<ChatRequest>>(
    event.body,
    event.isBase64Encoded,
  );
  if (body === null || typeof body.monsterId !== "string" || body.monsterId === "") {
    return error(400, "monsterId is required");
  }
  if (typeof body.message !== "string" || body.message.trim() === "") {
    return error(400, "message is required");
  }

  // Reply language. Anything other than the explicit "en" opt-in falls back to
  // "ja", preserving the original behavior for old clients that never send it.
  const lang: Lang = body.lang === "en" ? "en" : "ja";

  // Load the persisted monster. It is the source of truth WHEN it exists, so a
  // client cannot spoof a higher stage/model. For a brand-new monster that was
  // never saved we fall back to the client-sent stageId/monsterName instead of
  // 404ing, so first-chat still works.
  let monster: Monster | null;
  try {
    monster = await loadMonster(body.monsterId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return error(500, `Failed to load monster: ${message}`);
  }

  const context = chooseChatContext(monster, {
    stageId: (body.stageId ?? "baby"),
    monsterName: body.monsterName ?? "",
  });
  const stage = getStage(context.stageId);

  // Baby stage: no chat. Return a non-verbal, canned reply.
  if (!stage.canChat || stage.bedrockModelKey === "none") {
    const response: ChatResponse = {
      reply:
        lang === "en"
          ? "…! (It can't talk yet. Let's raise it more!)"
          : "…！（まだ言葉を話せないみたい。もっと育ててあげよう！）",
      modelId: "none",
    };
    return ok(response);
  }

  const modelId = resolveModelId(stage.bedrockModelKey, bedrockOverrides());

  // Independently sanitize/truncate the client-sent history: the server NEVER
  // trusts its length or contents. Absent/malformed history collapses to [],
  // so the resulting messages array is exactly the single new-user turn
  // (identical to the pre-#37 behavior).
  const history = trimChatHistory(body.history);

  // Clamp the new user message server-side to the same per-turn ceiling that
  // history turns receive (issue #37 review follow-up: finding 2). The
  // empty/whitespace 400 above already rejects blank input; here we only bound
  // the UPPER size so a single request can't ship an unbounded message past the
  // per-turn limit. This matches pre-#37 behavior for normal-length messages
  // (which are well under MAX_CHAT_MESSAGE_CHARS) and satisfies the
  // "input-size bound" acceptance criterion for the live turn too.
  const message = body.message.slice(0, MAX_CHAT_MESSAGE_CHARS);

  const requestPayload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(context, lang),
    messages: toAnthropicMessages(history, message),
  };

  try {
    const result = await getBedrock().send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(requestPayload),
      }),
    );

    const decoded = new TextDecoder().decode(result.body);
    const parsed = JSON.parse(decoded) as AnthropicResponse;
    const reply = extractText(parsed);

    const emptyReplyFallback =
      lang === "en"
        ? "… (couldn't come up with a reply)"
        : "…（うまく返事ができなかったみたい）";
    const response: ChatResponse = {
      reply: reply !== "" ? reply : emptyReplyFallback,
      modelId,
    };
    return ok(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return error(502, `Bedrock chat failed: ${message}`);
  }
};
