import type { ChatTurn } from "./types.ts";

/**
 * Chat-history model + trim/validate helpers (issue #37 — 会話履歴の永続化と
 * 「記憶」を持つ会話).
 *
 * This module is the SINGLE SOURCE OF TRUTH for how recent conversation turns
 * are sanitized and shaped into a Bedrock Anthropic `messages` array. It is
 * PURE and dependency-free (no DOM, no AWS, no `Date.now()`, no mutation) so it
 * can be unit-tested under `node --test --experimental-strip-types` and shared
 * by both the backend chat Lambda and the frontend.
 *
 * The server MUST NOT trust the client-supplied history: it re-runs
 * {@link trimChatHistory} on whatever arrives in `ChatRequest.history` to bound
 * the input size and drop malformed turns before building the model payload.
 */

/**
 * Maximum number of prior turns forwarded as context. Older turns beyond this
 * cap are dropped (keeping the most recent) to bound the request token budget.
 */
export const MAX_CHAT_TURNS = 10;

/**
 * Maximum number of characters kept per message. Any surviving turn whose text
 * exceeds this is clamped (sliced) to this length, bounding the per-message
 * input size regardless of what the client sends.
 */
export const MAX_CHAT_MESSAGE_CHARS = 2000;

/** Narrow an unknown value to a plausible chat-turn-shaped object. */
function isTurnLike(value: unknown): value is { role: unknown; text: unknown } {
  return typeof value === "object" && value !== null;
}

/**
 * Validate and sanitize an untrusted history value into a clean
 * `ChatTurn[]` suitable for forwarding to the model. PURE: no mutation of the
 * input, no I/O.
 *
 * Rules, applied in order:
 *  1. A non-array input (including `null` / `undefined` / objects / strings) is
 *     coerced to an empty array `[]`.
 *  2. Each entry is dropped unless it is a non-null object whose `role` is
 *     EXACTLY `'player'` or `'monster'` and whose `text` is a string that is
 *     non-empty after trimming.
 *  3. Each surviving entry's text is first trimmed, then clamped (sliced) to
 *     {@link MAX_CHAT_MESSAGE_CHARS} characters.
 *  4. Only the LAST {@link MAX_CHAT_TURNS} entries (the most recent) are kept.
 *  5. For Anthropic alternation suitability, a leading `'monster'` turn is then
 *     dropped so the sequence can start with a `'player'` turn (the new user
 *     message is appended by the server AFTER this history). A history that is
 *     only monster turns therefore collapses toward `[]`.
 */
export function trimChatHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) {
    return [];
  }

  const cleaned: ChatTurn[] = [];
  for (const entry of history) {
    if (!isTurnLike(entry)) {
      continue;
    }
    const { role, text } = entry;
    if (role !== "player" && role !== "monster") {
      continue;
    }
    if (typeof text !== "string") {
      continue;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      continue;
    }
    cleaned.push({ role, text: trimmed.slice(0, MAX_CHAT_MESSAGE_CHARS) });
  }

  // Keep only the most recent MAX_CHAT_TURNS turns.
  const recent =
    cleaned.length > MAX_CHAT_TURNS ? cleaned.slice(cleaned.length - MAX_CHAT_TURNS) : cleaned;

  // Drop a leading 'monster' turn so the sequence can start with 'player'.
  if (recent.length > 0 && recent[0].role === "monster") {
    return recent.slice(1);
  }
  return recent;
}

/**
 * Build the Bedrock Anthropic `messages` array from an already-trimmed history
 * plus the new user message. PURE: no mutation, no I/O.
 *
 * Mapping: `player` -> `user`, `monster` -> `assistant`. The new user message
 * is appended LAST as `{ role: 'user', content: newMessage }`. This is the
 * single place that produces the model messages array so the backend and any
 * tests share one implementation.
 *
 * PRECONDITION: `history` is assumed to already be the output of
 * {@link trimChatHistory} (i.e. clean, bounded, and starting with a `'player'`
 * turn when non-empty). Given that, the result is an alternating sequence that
 * STARTS with a `user` turn and ENDS with the new user message.
 */
export function toAnthropicMessages(
  history: ChatTurn[],
  newMessage: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = history.map((turn) => ({
    role: turn.role === "player" ? ("user" as const) : ("assistant" as const),
    content: turn.text,
  }));
  messages.push({ role: "user", content: newMessage });
  return messages;
}
