import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildContext,
  initialWorkspace,
  needsCompaction,
  retrieve,
  makeEntry,
  isGenericTitle,
  isGreetingTitle,
  cleanTitle,
  buildTitlePrompt,
  isGreeting,
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
test("generic titles are identified and cleaned appropriately", () => {
  assert.ok(isGenericTitle("hi"));
  assert.ok(isGenericTitle("Hi!"));
  assert.ok(isGenericTitle("'hi'"));
  assert.ok(isGenericTitle("hello"));
  assert.ok(isGenericTitle("New conversation"));
  assert.ok(isGenericTitle(""));
  assert.ok(!isGenericTitle("Quantum Computing"));
  assert.ok(!isGenericTitle("Explain neural networks"));

  assert.ok(isGreetingTitle("hi"));
  assert.ok(isGreetingTitle("Friendly greeting"));
  assert.ok(isGreetingTitle("Conversation with Nova"));
  assert.ok(!isGreetingTitle("Quantum Computing"));

  assert.equal(cleanTitle('Title: "Quantum Computing 101"'), "Quantum Computing 101");
  assert.equal(cleanTitle('**Distributed Caches**'), "Distributed Caches");
  assert.equal(cleanTitle('hi', 'Discussion'), "Discussion");
  assert.equal(cleanTitle('', 'Discussion'), "Discussion");

  const prompt = buildTitlePrompt([
    { role: "user", content: "hi" },
    { role: "assistant", content: "Hello! How can I help?" },
  ]);
  assert.equal(prompt.length, 2);
  assert.ok(prompt[0].content.includes("gist"));
  assert.ok(prompt[1].content.includes("User: hi"));

  // makeEntry falls back from generic 'hi' title to substantive question or note
  const entryFromHi = makeEntry({
    ...chat,
    title: "hi",
    messages: [
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "Hello!" },
      { id: "3", role: "user", content: "How does GPS work?" },
    ],
  });
  assert.equal(entryFromHi.title, "How does GPS work?");

  const entryFromPureHi = makeEntry({
    ...chat,
    title: "hi",
    messages: [
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "Hello!" },
    ],
  });
  assert.equal(entryFromPureHi.title, "Conversation note");
});

test("buildContext formats image and document attachments into multimodal content parts", () => {
  const data: Chat = {
    ...chat,
    messages: [
      {
        id: "1",
        role: "user",
        content: "Please inspect this screenshot and document",
        attachments: [
          {
            id: "att-1",
            name: "screenshot.png",
            type: "image/png",
            size: 1024,
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
          },
          {
            id: "att-2",
            name: "report.pdf",
            type: "application/pdf",
            size: 2048,
            url: "data:application/pdf;base64,JVBERi0xLjQK",
          },
        ],
      },
    ],
  };

  const { messages } = buildContext(data, initialWorkspace.bots[0], []);
  assert.equal(messages.length, 2);
  const userMsg = messages[1];
  assert.ok(Array.isArray(userMsg.content));
  const parts = userMsg.content as any[];
  assert.equal(parts.length, 3);
  assert.equal(parts[0].type, "text");
  assert.equal(parts[0].text, "Please inspect this screenshot and document");
  assert.equal(parts[1].type, "image_url");
  assert.equal(parts[1].image_url.url, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==");
  assert.equal(parts[2].type, "file");
  assert.equal(parts[2].file.filename, "report.pdf");
  assert.equal(parts[2].file.file_data, "data:application/pdf;base64,JVBERi0xLjQK");

  // Title prompt and makeEntry capture attachments when text is empty
  const titlePrompt = buildTitlePrompt(data.messages);
  assert.ok(titlePrompt[1].content.includes("[Attached: screenshot.png, report.pdf]"));

  const emptyTextChat: Chat = {
    ...chat,
    title: "hi",
    messages: [
      {
        id: "1",
        role: "user",
        content: "",
        attachments: [
          {
            id: "att-1",
            name: "contract.pdf",
            type: "application/pdf",
            size: 4096,
            url: "data:application/pdf;base64,JVBERi0=",
          },
        ],
      },
    ],
  };
  const entry = makeEntry(emptyTextChat);
  assert.equal(entry.title, "contract.pdf");
});

test("greeting detection identifies greetings and rejects substantive questions", () => {
  assert.ok(isGreeting("hi"));
  assert.ok(isGreeting("Hi!"));
  assert.ok(isGreeting("hi :)"));
  assert.ok(isGreeting("hello"));
  assert.ok(isGreeting("hey there"));
  assert.ok(isGreeting("hey Nova"));
  assert.ok(isGreeting("Good morning!"));
  assert.ok(isGreeting("Good morning Nova"));
  assert.ok(isGreeting("morning"));
  assert.ok(isGreeting("morning pages"));
  assert.ok(isGreeting("morning check in"));
  assert.ok(isGreeting("hi morning pages"));
  assert.ok(isGreeting("hi, how are you?"));
  assert.ok(isGreeting("hello, how's it going?"));
  assert.ok(isGreeting("what's up"));
  assert.ok(isGreeting("howdy"));

  assert.ok(!isGreeting("Explain neural networks"));
  assert.ok(!isGreeting("What else about neural networks?"));
  assert.ok(!isGreeting("hi can you write a python script for web scraping"));
  assert.ok(!isGreeting("hello I want advice on buying a house"));
  assert.ok(!isGreeting(""));
  assert.ok(!isGreeting(null));
  assert.ok(!isGreeting(undefined));
});

test("retrieval on greeting returns most recent bot entries for grounding life journey / progress", () => {
  const entries: Entry[] = [
    {
      id: "older-note",
      botId: "nova",
      chatId: "chat-1",
      title: "First job interview",
      content: "Discussed preparing for system design rounds",
      updatedAt: 1000,
    },
    {
      id: "newer-note",
      botId: "nova",
      chatId: "chat-2",
      title: "Half marathon training",
      content: "Hit 15km long run milestone this weekend",
      updatedAt: 5000,
    },
    {
      id: "other-bot-note",
      botId: "cipher",
      chatId: "chat-3",
      title: "Compiler architecture",
      content: "Wrote AST parser in Rust",
      updatedAt: 9000,
    },
  ];

  const results = retrieve(entries, "hi", "nova");
  assert.equal(results.length, 2);
  // Most recent first:
  assert.equal(results[0].id, "newer-note");
  assert.equal(results[0].title, "Half marathon training");
  assert.equal(results[1].id, "older-note");
  // Bot isolation:
  assert.ok(results.every((r) => r.botId === "nova"));
});

test("buildContext instructs bot to ask about user life journey / recent progress based on memory", () => {
  const chatWithHi: Chat = {
    ...chat,
    messages: [{ id: "1", role: "user", content: "hi" }],
  };

  const entries: Entry[] = [
    {
      id: "journey-note",
      botId: "nova",
      chatId: "prior-chat",
      title: "Career transition",
      content: "Transitioning to senior product engineering role",
      updatedAt: 2000,
    },
  ];

  const { messages, sources } = buildContext(chatWithHi, initialWorkspace.bots[0], entries);
  const systemPrompt = messages[0].content as string;

  assert.equal(sources.length, 1);
  assert.equal(sources[0].title, "Career transition");
  assert.ok(systemPrompt.includes("RETRIEVED WIKI NOTES"));
  assert.ok(systemPrompt.includes("Career transition"));
  assert.ok(systemPrompt.includes("harsh in truth"));
  assert.ok(systemPrompt.includes("goals"));
  assert.ok(systemPrompt.includes("life journey"));
});
