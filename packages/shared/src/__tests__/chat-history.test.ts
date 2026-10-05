import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_CHAT_MESSAGE_CHARS,
  MAX_CHAT_SCAN,
  MAX_CHAT_TURNS,
  toAnthropicMessages,
  trimChatHistory,
} from "../chat-history.ts";
import type { ChatTurn } from "../types.ts";

/** Build a `count`-long alternating player/monster history, oldest-first. */
function alternating(count: number): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (let i = 0; i < count; i += 1) {
    turns.push({ role: i % 2 === 0 ? "player" : "monster", text: `t${i}` });
  }
  return turns;
}

test("constants: MAX_CHAT_TURNS is 10 and MAX_CHAT_MESSAGE_CHARS is 2000", () => {
  assert.equal(MAX_CHAT_TURNS, 10);
  assert.equal(MAX_CHAT_MESSAGE_CHARS, 2000);
});

test("truncation: an over-long history keeps only the most recent MAX_CHAT_TURNS", () => {
  // 24 turns, oldest-first; the last turn (index 23) is a 'monster' so the
  // most-recent window starts with a 'player' turn and nothing is dropped.
  const history = alternating(24);
  const result = trimChatHistory(history);
  assert.equal(result.length, MAX_CHAT_TURNS);
  // The kept window is the LAST MAX_CHAT_TURNS, i.e. indices 14..23.
  assert.equal(result[0].text, "t14");
  assert.equal(result[result.length - 1].text, "t23");
});

test("malformed entries are dropped: non-object, bad role, empty/whitespace/non-string text", () => {
  const dirty: unknown[] = [
    { role: "player", text: "keep me" },
    null, // non-object
    42, // non-object
    "player", // non-object
    { role: "narrator", text: "bad role" }, // role not exactly player|monster
    { role: "PLAYER", text: "wrong case" }, // role not exactly player|monster
    { role: "monster", text: "" }, // empty text
    { role: "monster", text: "   " }, // whitespace-only text
    { role: "player", text: 123 }, // non-string text
    { role: "monster", text: "also kept" },
  ];
  const result = trimChatHistory(dirty);
  assert.deepEqual(result, [
    { role: "player", text: "keep me" },
    { role: "monster", text: "also kept" },
  ]);
});

test("MAX_CHAT_SCAN is well above MAX_CHAT_TURNS so the tail guard never changes realistic results", () => {
  assert.ok(MAX_CHAT_SCAN > MAX_CHAT_TURNS);
});

test("tail-scan guard: result is UNCHANGED vs. scanning the whole array for a huge input", () => {
  // Far more than MAX_CHAT_SCAN turns of fully-valid alternating history. Only
  // the bounded tail is inspected, but because we keep only the most recent
  // MAX_CHAT_TURNS the output is identical to walking the entire array.
  const count = MAX_CHAT_SCAN * 3; // 600 turns, oldest-first.
  const history = alternating(count);
  const result = trimChatHistory(history);
  assert.equal(result.length, MAX_CHAT_TURNS);
  // The kept window is still the LAST MAX_CHAT_TURNS of the full array.
  assert.equal(result[0].text, `t${count - MAX_CHAT_TURNS}`);
  assert.equal(result[result.length - 1].text, `t${count - 1}`);
});

test("tail-scan guard: a normal (small) history is unaffected", () => {
  const history: ChatTurn[] = [
    { role: "player", text: "hi" },
    { role: "monster", text: "hello" },
    { role: "player", text: "bye" },
  ];
  assert.deepEqual(trimChatHistory(history), history);
});

test("non-array / null / undefined input returns []", () => {
  assert.deepEqual(trimChatHistory(null), []);
  assert.deepEqual(trimChatHistory(undefined), []);
  assert.deepEqual(trimChatHistory("not an array"), []);
  assert.deepEqual(trimChatHistory(42), []);
  assert.deepEqual(trimChatHistory({ role: "player", text: "x" }), []);
});

test("per-message clamp: text longer than MAX_CHAT_MESSAGE_CHARS is sliced to that length", () => {
  const long = "a".repeat(MAX_CHAT_MESSAGE_CHARS + 500);
  const result = trimChatHistory([{ role: "player", text: long }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].text.length, MAX_CHAT_MESSAGE_CHARS);
  assert.equal(result[0].text, "a".repeat(MAX_CHAT_MESSAGE_CHARS));
});

test("leading monster turn is dropped so the result starts with a player turn", () => {
  const result = trimChatHistory([
    { role: "monster", text: "unpaired reply" },
    { role: "player", text: "hi" },
    { role: "monster", text: "hello" },
  ]);
  assert.equal(result[0].role, "player");
  assert.deepEqual(result, [
    { role: "player", text: "hi" },
    { role: "monster", text: "hello" },
  ]);
});

test("a history that is ONLY a monster turn becomes []", () => {
  assert.deepEqual(trimChatHistory([{ role: "monster", text: "lonely" }]), []);
});

test("toAnthropicMessages maps roles, appends the new user message, and alternates from user", () => {
  const history: ChatTurn[] = [
    { role: "player", text: "hi" },
    { role: "monster", text: "hello" },
  ];
  const messages = toAnthropicMessages(history, "how are you?");
  assert.deepEqual(messages, [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
    { role: "user", content: "how are you?" },
  ]);
  // Starts with user, ends with the new user message, and alternates.
  assert.equal(messages[0].role, "user");
  assert.equal(messages[messages.length - 1].content, "how are you?");
  assert.equal(messages[messages.length - 1].role, "user");
  for (let i = 1; i < messages.length; i += 1) {
    assert.notEqual(messages[i].role, messages[i - 1].role, "roles must alternate");
  }
});

test("toAnthropicMessages with empty history yields just the new user message", () => {
  assert.deepEqual(toAnthropicMessages([], "solo"), [{ role: "user", content: "solo" }]);
});
