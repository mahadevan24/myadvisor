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
  deriveFallbackTitle,
  buildTitlePrompt,
  isGreeting,
  isCuratedBot,
  mergeBots,
  formatTodosContext,
  getTodoInstructions,
  stripTodoActionTags,
  parseTodoActions,
  applyTodoActions,
  type Bot,
  type Chat,
  type Entry,
  type Todo,
  type TodoAction,
} from "../src/lib/memory";
import { readStream } from "../src/lib/stream";
import { filterBotsByQuery, calculateDropdownPosition, CURATED_BOTS } from "../src/lib/curated-bots";
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

  // cleanTitle rejects generic greeting titles like "Discussion with Elon Musk"
  assert.equal(cleanTitle("Discussion with Elon Musk", "Rocketry goals"), "Rocketry goals");
  assert.equal(cleanTitle("Conversation with Nova", "Neural nets"), "Neural nets");

  // deriveFallbackTitle generates unique, substantive titles from conversations
  const derivedSubstantive = deriveFallbackTitle([
    { role: "user", content: "hi" },
    { role: "assistant", content: "Good morning! What are your goals?" },
    { role: "user", content: "Complete FAA drone certification" },
  ], "Elon Musk");
  assert.equal(derivedSubstantive, "Complete FAA drone certification");

  const derivedMorning = deriveFallbackTitle([
    { role: "user", content: "morning pages" },
    { role: "assistant", content: "Let's be real about your goals." },
  ], "Elon Musk", 1700000000000);
  assert.ok(derivedMorning.startsWith("Morning check-in"));

  const derivedCheckIn = deriveFallbackTitle([
    { role: "user", content: "hi" },
    { role: "assistant", content: "Hello!" },
  ], "Elon Musk", 1700000000000);
  assert.ok(derivedCheckIn.startsWith("Check-in with Elon Musk"));
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

test("buildContext includes current date, time, and year in temporal context", () => {
  const fixedDate = new Date("2026-11-12T16:00:00Z");
  const { messages } = buildContext(chat, initialWorkspace.bots[0], [], fixedDate);
  const systemPrompt = messages[0].content as string;

  assert.ok(systemPrompt.includes("CURRENT DATE & TIME"));
  assert.ok(systemPrompt.includes("2026"));
  assert.ok(systemPrompt.includes("November"));
});

test("curated bot collection includes all requested mentor categories and valid attributes", () => {
  const { BOT_CATEGORIES, CURATED_BOTS } = require("../src/lib/curated-bots");

  assert.ok(Array.isArray(CURATED_BOTS));
  assert.ok(CURATED_BOTS.length >= 26);

  const categories = new Set(CURATED_BOTS.map((b: any) => b.category));
  for (const cat of BOT_CATEGORIES) {
    assert.ok(categories.has(cat), `Missing expected category: ${cat}`);
  }

  const expectedNames = [
    "Steve Jobs",
    "Jeff Bezos",
    "Warren Buffett & Charlie Munger",
    "Naval Ravikant",
    "Paul Graham",
    "Peter Thiel",
    "Ray Dalio",
    "Tim Ferriss",
    "James Clear",
    "Cal Newport",
    "David Goggins",
    "Jocko Willink",
    "Marcus Aurelius",
    "Socrates",
    "Buddha & Thich Nhat Hanh",
    "Viktor Frankl",
    "Abraham Lincoln",
    "Nelson Mandela",
    "Winston Churchill",
    "Dale Carnegie",
    "Albert Einstein",
    "Richard Feynman",
    "Charlie Munger",
    "Arnold Schwarzenegger",
    "Andrew Huberman",
    "Osho",
    "Eckhart Tolle",
  ];

  for (const name of expectedNames) {
    const found = CURATED_BOTS.find((b: any) => b.name === name);
    assert.ok(found, `Expected mentor bot ${name} not found`);
    assert.ok(found.instructions.length > 20);
    assert.ok(found.category);
    assert.ok(found.color);
    assert.ok(found.symbol);
  }
});

test("mergeBots preserves custom imported bots and avoids losing bots during cloud sync", () => {
  const customBot1: Bot = {
    id: "bot-custom-1",
    name: "System Architect",
    category: "Engineering",
    description: "Cloud and distributed systems design",
    instructions: "Think in distributed systems terms.",
    model: "openai/gpt-4o-mini",
    color: "purple",
    symbol: "⚙",
  };
  const customBot2: Bot = {
    id: "bot-custom-2",
    name: "Writing Coach",
    category: "Creativity",
    description: "Helps write clear essays",
    instructions: "Focus on clarity and economy of words.",
    model: "openai/gpt-4o-mini",
    color: "peach",
    symbol: "✎",
  };

  assert.equal(isCuratedBot(customBot1), false);
  assert.equal(isCuratedBot(initialWorkspace.bots[0]), true);

  // Simulate an older cloud saved state with only default bots
  const savedCloudBots = [initialWorkspace.bots[0]];
  // Local state with imported bots
  const localBots = [...initialWorkspace.bots, customBot1];

  const merged = mergeBots(savedCloudBots, localBots);
  assert.ok(merged.some((b) => b.id === "bot-custom-1"));
  assert.ok(merged.some((b) => b.id === "nova"));
  assert.ok(merged.some((b) => b.name === "Steve Jobs"));

  // Merging another imported bot list keeps both custom bots
  const mergedWithMore = mergeBots(merged, [customBot2]);
  assert.ok(mergedWithMore.some((b) => b.id === "bot-custom-1"));
  assert.ok(mergedWithMore.some((b) => b.id === "bot-custom-2"));
  // No duplicates
  const names = mergedWithMore.map((b) => b.name.toLowerCase());
  assert.equal(names.length, new Set(names).size);
});

test("mergeBots respects deletedBotIds and prevents resurrecting deleted default bots like Nova and Echo", () => {
  const customBot: Bot = {
    id: "bot-custom-3",
    name: "Strategy Mentor",
    category: "Strategy",
    description: "Business strategy advisor",
    instructions: "Think in terms of moats and competitive advantages.",
    model: "openai/gpt-4o-mini",
    color: "amber",
    symbol: "♟",
  };

  // User deleted Nova and Echo
  const deletedIds = ["nova", "echo"];
  const currentBots = [customBot];
  const cloudBots = [customBot, initialWorkspace.bots[0]]; // cloud had nova from earlier

  const merged = mergeBots(cloudBots, currentBots, deletedIds);
  assert.ok(!merged.some((b) => b.id === "nova"), "Nova must not be present when deleted");
  assert.ok(!merged.some((b) => b.id === "echo"), "Echo must not be present when deleted");
  assert.ok(merged.some((b) => b.id === "bot-custom-3"), "Custom bot must be preserved");
});

test("context management bounds token usage by trimming heavy attachments on older turns", () => {
  const multiTurnChat: Chat = {
    ...chat,
    messages: [
      {
        id: "msg-1",
        role: "user",
        content: "Here is an earlier diagram",
        attachments: [
          {
            id: "att-old",
            name: "huge-arch.png",
            type: "image/png",
            size: 500000,
            url: "data:image/png;base64," + "A".repeat(10000),
          },
        ],
      },
      {
        id: "msg-2",
        role: "assistant",
        content: "I see the architecture diagram.",
      },
      {
        id: "msg-3",
        role: "user",
        content: "Now check this latest wireframe",
        attachments: [
          {
            id: "att-latest",
            name: "wireframe.png",
            type: "image/png",
            size: 1000,
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
          },
        ],
      },
    ],
  };

  const { messages } = buildContext(multiTurnChat, initialWorkspace.bots[0], []);
  assert.equal(messages.length, 4); // System + 3 messages

  // Older turn (msg-1) should have lightweight string reference, not the 10,000 char base64 payload
  const olderMsg = messages[1];
  assert.equal(typeof olderMsg.content, "string");
  assert.ok((olderMsg.content as string).includes("[Attached: huge-arch.png]"));
  assert.ok(!(olderMsg.content as string).includes("data:image/png;base64"));

  // Latest turn (msg-3) should have full multimodal parts
  const latestMsg = messages[3];
  assert.ok(Array.isArray(latestMsg.content));
  const parts = latestMsg.content as any[];
  assert.ok(parts.some((p) => p.type === "image_url"));
});

test("formatTodosContext formats checklist items and completed status correctly", () => {
  assert.ok(formatTodosContext([]).includes("(No action items"));

  const sampleTodos: Todo[] = [
    {
      id: "t1",
      text: "Calculate nozzle heat dissipation",
      completed: false,
      createdAt: 1000,
      sourceBotName: "Elon Musk",
    },
    {
      id: "t2",
      text: "Draft weekly reflection",
      completed: true,
      createdAt: 900,
      completedAt: 950,
    },
  ];

  const formatted = formatTodosContext(sampleTodos);
  assert.ok(formatted.includes('- [ ] (id: "t1") Calculate nozzle heat dissipation (from Elon Musk) [PENDING]'));
  assert.ok(formatted.includes('- [x] (id: "t2") Draft weekly reflection [COMPLETED]'));
});

test("parseTodoActions extracts XML and code block actions and cleans text", () => {
  const rawWithXml = `Great analysis! Let's do this next:
<todo_action action="add" text="Test thermal limits of battery cells" />
Let me know when you finish.`;

  const parsed1 = parseTodoActions(rawWithXml);
  assert.equal(parsed1.actions.length, 1);
  assert.equal(parsed1.actions[0].action, "add");
  assert.equal(parsed1.actions[0].text, "Test thermal limits of battery cells");
  assert.ok(!parsed1.cleaned.includes("<todo_action"));
  assert.ok(parsed1.cleaned.includes("Great analysis!"));

  const rawWithCodeBlock = `Here is the plan:
\`\`\`todo_action
{"action": "complete", "id": "t1"}
\`\`\`
Moving to step 2.`;

  const parsed2 = parseTodoActions(rawWithCodeBlock);
  assert.equal(parsed2.actions.length, 1);
  assert.equal(parsed2.actions[0].action, "complete");
  assert.equal(parsed2.actions[0].id, "t1");
  assert.ok(!parsed2.cleaned.includes("todo_action"));
});

test("stripTodoActionTags removes raw or partial tags without corrupting markdown", () => {
  const full = "Hello world <todo_action action=\"add\" text=\"Task\" /> more text";
  assert.equal(stripTodoActionTags(full), "Hello world  more text");

  const streamingPartial = "Hello world <todo_action action=\"add\" text=";
  assert.equal(stripTodoActionTags(streamingPartial), "Hello world");
});

test("applyTodoActions correctly handles add, complete, update, delete", () => {
  const initial: Todo[] = [
    { id: "todo_1", text: "Original task", completed: false, createdAt: 100 },
  ];

  // Add
  const addResult = applyTodoActions(
    initial,
    [{ action: "add", text: "New priority task" }],
    { id: "elon-musk", name: "Elon Musk" },
    "chat_1",
  );
  assert.equal(addResult.nextTodos.length, 2);
  assert.equal(addResult.nextTodos[0].text, "New priority task");
  assert.equal(addResult.nextTodos[0].sourceBotName, "Elon Musk");
  assert.equal(addResult.nextTodos[0].completed, false);

  // Complete
  const completeResult = applyTodoActions(addResult.nextTodos, [
    { action: "complete", id: "todo_1" },
  ]);
  const completedItem = completeResult.nextTodos.find((t) => t.id === "todo_1");
  assert.ok(completedItem);
  assert.equal(completedItem.completed, true);
  assert.ok(completedItem.completedAt);

  // Update
  const updateResult = applyTodoActions(completeResult.nextTodos, [
    { action: "update", id: "todo_1", text: "Updated task description" },
  ]);
  const updatedItem = updateResult.nextTodos.find((t) => t.id === "todo_1");
  assert.ok(updatedItem);
  assert.equal(updatedItem.text, "Updated task description");

  // Delete
  const deleteResult = applyTodoActions(updateResult.nextTodos, [
    { action: "delete", id: "todo_1" },
  ]);
  assert.equal(deleteResult.nextTodos.length, 1);
  assert.ok(!deleteResult.nextTodos.some((t) => t.id === "todo_1"));
});

test("buildContext includes checklist context, instructions, and persona guidelines", () => {
  const elonBot = initialWorkspace.bots.find((b) => b.id === "elon-musk") || initialWorkspace.bots[0];
  const sampleTodos: Todo[] = [
    { id: "td1", text: "Ship MVP v1", completed: true, createdAt: 100 },
    { id: "td2", text: "Reduce cycle time by 50%", completed: false, createdAt: 200 },
  ];

  const testChat: Chat = {
    id: "chat_goal",
    botId: elonBot.id,
    title: "Launch planning",
    messages: [{ id: "m1", role: "user", content: "What is my next priority?" }],
    summary: "",
    compactedCount: 0,
    updatedAt: Date.now(),
  };

  const { messages } = buildContext(testChat, elonBot, [], new Date(), sampleTodos);
  const sys = messages[0].content as string;

  // Bot prompt knows about current todos and completed status
  assert.ok(sys.includes("CURRENT USER CHECKLIST / TODOS:"));
  assert.ok(sys.includes('- [x] (id: "td1") Ship MVP v1 [COMPLETED]'));
  assert.ok(sys.includes('- [ ] (id: "td2") Reduce cycle time by 50% [PENDING]'));

  // Includes persona guidelines for Elon Musk vs Osho
  assert.ok(sys.includes("Elon Musk"));
  assert.ok(sys.includes("Osho"));
  assert.ok(sys.includes("<todo_action action="));
});

test("calculateDropdownPosition prevents overflowing top and clamps height to safe area", () => {
  // Scenario 1: Short viewport (300px), composer at bottom (rectTop: 240, rectBottom: 280), header at 50px
  // In the user's issue, the dialog was overflowing the top of the viewport because space was miscalculated
  const shortResult = calculateDropdownPosition({
    rectTop: 240,
    rectBottom: 280,
    headerBottom: 50,
    windowHeight: 300,
  });

  // safeSpaceAbove = 240 - 8 - (50 + 10) = 172
  // safeSpaceBelow = (300 - 16) - (280 + 8) = -4 -> 0
  // Direction must be up, and maxHeight must not exceed safeSpaceAbove (172)
  assert.equal(shortResult.direction, "up");
  assert.ok(shortResult.maxHeight <= 172, `maxHeight ${shortResult.maxHeight} should be <= 172`);
  // Top edge of dropdown in viewport = (rectTop - 8) - maxHeight = 232 - maxHeight
  // It must strictly be >= headerBottom + 10 (60)
  const topEdge = 240 - 8 - shortResult.maxHeight;
  assert.ok(topEdge >= 60, `topEdge ${topEdge} should be >= safe top boundary 60`);

  // Scenario 2: Normal tall viewport (800px), composer at bottom (rectTop: 720, rectBottom: 760)
  const tallResult = calculateDropdownPosition({
    rectTop: 720,
    rectBottom: 760,
    headerBottom: 50,
    windowHeight: 800,
  });
  assert.equal(tallResult.direction, "up");
  assert.ok(tallResult.maxHeight <= 380);
  assert.ok(720 - 8 - tallResult.maxHeight >= 60);

  // Scenario 3: Composer near top of screen (rectTop: 100, rectBottom: 140, windowHeight: 800)
  // Space above is cramped, space below is abundant -> should drop down
  const downResult = calculateDropdownPosition({
    rectTop: 100,
    rectBottom: 140,
    headerBottom: 50,
    windowHeight: 800,
  });
  assert.equal(downResult.direction, "down");
  assert.ok(downResult.maxHeight <= 380);
  // Bottom edge = rectBottom + 8 + maxHeight <= windowHeight - 16
  assert.ok(140 + 8 + downResult.maxHeight <= 800 - 16);
});

test("filterBotsByQuery filters by bot name, description, category, and model", () => {
  const grouped: Record<string, Bot[]> = {
    "Business and entrepreneurship": [
      CURATED_BOTS.find((b) => b.id === "steve-jobs")!,
      CURATED_BOTS.find((b) => b.id === "jeff-bezos")!,
      CURATED_BOTS.find((b) => b.id === "elon-musk")!,
    ],
    "Spirituality": [
      CURATED_BOTS.find((b) => b.id === "osho")!,
      CURATED_BOTS.find((b) => b.id === "eckhart-tolle")!,
    ],
  };

  // Empty query returns all bots grouped
  const all = filterBotsByQuery(grouped, "");
  assert.equal(Object.keys(all).length, 2);

  // Search by bot name (case-insensitive)
  const jobs = filterBotsByQuery(grouped, "steve");
  assert.equal(Object.keys(jobs).length, 1);
  assert.equal(jobs["Business and entrepreneurship"].length, 1);
  assert.equal(jobs["Business and entrepreneurship"][0].name, "Steve Jobs");

  // Search by category name
  const spirit = filterBotsByQuery(grouped, "spirituality");
  assert.equal(Object.keys(spirit).length, 1);
  assert.equal(spirit["Spirituality"].length, 2);

  // Search by bot description
  const now = filterBotsByQuery(grouped, "inner stillness");
  assert.equal(Object.keys(now).length, 1);
  assert.equal(now["Spirituality"][0].name, "Eckhart Tolle");

  // Search with no match
  const none = filterBotsByQuery(grouped, "nonexistentxyz123");
  assert.equal(Object.keys(none).length, 0);
});
