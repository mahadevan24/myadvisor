import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildContext,
  initialWorkspace,
  needsCompaction,
  retrieve,
  makeEntry,
  type Chat,
  type Entry,
} from "../src/lib/memory";
import { readStream } from "../src/lib/stream";
const chat: Chat = {
  id: "c",
  botId: "nova",
  title: "Neural networks",
  messages: [],
  summary: "",
  compactedCount: 0,
  updatedAt: 0,
};
test("retrieval isolates bots, filters unrelated entries and obeys budget", () => {
  const entries: Entry[] = ["nova", "cipher", "nova"].map((botId, i) => ({
    id: String(i),
    botId,
    chatId: String(i),
    title: i === 2 ? "Cooking" : "Neural networks",
    content: i === 2 ? "Pasta recipe" : "Neural networks ".repeat(100),
    updatedAt: 0,
  }));
  const result = retrieve(entries, "Explain neural networks", "nova", 100);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "0");
  assert.equal(result[0].content.length, 100);
});
test("context excludes compacted history, retains memory and bounds text", () => {
  const data = {
    ...chat,
    summary: "User prefers examples",
    compactedCount: 1,
    messages: [
      { id: "1", role: "user" as const, content: "forgotten raw history" },
      { id: "2", role: "user" as const, content: "a".repeat(35000) },
    ],
  };
  const { messages } = buildContext(data, initialWorkspace.bots[0], []);
  assert.ok(messages[0].content.includes(data.summary));
  assert.ok(!JSON.stringify(messages).includes("forgotten raw history"));
  assert.equal(messages[1].content.length, 26000);
});
test("compaction triggers only for a sufficiently long active history", () => {
  const data = {
    ...chat,
    messages: Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      role: "user" as const,
      content: "x".repeat(4000),
    })),
  };
  assert.ok(needsCompaction(data));
  assert.ok(!needsCompaction({ ...data, compactedCount: 5 }));
  assert.equal(makeEntry(data).chatId, data.id);
});
test("stream handles arbitrary byte boundaries and unicode", async () => {
  const wire =
    ': keepalive\n\ndata: {"choices":[{"delta":{"content":"Hello 🌱"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n';
  const bytes = new TextEncoder().encode(wire);
  let updates = 0;
  const stream = new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += 3)
        c.enqueue(bytes.slice(i, i + 3));
      c.close();
    },
  });
  assert.equal(
    await readStream(new Response(stream), () => updates++),
    "Hello 🌱 world",
  );
  assert.equal(updates, 2);
});
test("stream reports truncation and provider errors", async () => {
  await assert.rejects(
    readStream(
      new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
      () => {},
    ),
    /interrupted/,
  );
  await assert.rejects(
    readStream(
      new Response('data: {"error":{"message":"Rate limited"}}\n\n'),
      () => {},
    ),
    /Rate limited/,
  );
});
test("stream accepts a final event without newline and stops at DONE", async () => {
  const text = 'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]';
  assert.equal(await readStream(new Response(text), () => {}), "OK");
  let cancelled = false;
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text + "\n\n")); }, cancel() { cancelled = true; } });
  assert.equal(await readStream(new Response(body), () => {}), "OK");
  assert.equal(cancelled, true);
});
test("many short messages trigger compaction before exceeding API message limits", () => {
  const data = { ...chat, messages: Array.from({ length: 90 }, (_, i) => ({ id: String(i), role: "user" as const, content: "hello" })) };
  assert.ok(needsCompaction(data));
  assert.ok(buildContext(data, initialWorkspace.bots[0], []).messages.length <= 80);
});
