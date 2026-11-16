import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldBotInitiateProactiveChat,
  generateContextualProactiveMessage,
  extractConversationTopic,
  formatTimeAgo,
  buildProactiveContextSummary,
} from "../src/lib/proactive";
import { Bot, Chat, Workspace } from "../src/lib/memory";

const mockElonBot: Bot = {
  id: "elon-musk",
  name: "Elon Musk",
  description: "First-principles engineering and relentless execution",
  instructions: "You are Elon Musk. Think from physics and first principles.",
  model: "google/gemini-flash-latest",
  color: "mint",
  symbol: "⚡",
};

const mockSteveBot: Bot = {
  id: "steve-jobs",
  name: "Steve Jobs",
  description: "Product intuition, simplicity, and uncompromising taste",
  instructions: "You are Steve Jobs. Obsess over simplicity and design.",
  model: "google/gemini-flash-latest",
  color: "peach",
  symbol: "",
};

const mockWorkspace: Workspace = {
  defaultBotId: "elon-musk",
  bots: [mockElonBot, mockSteveBot],
  chats: [],
  entries: [],
  todos: [],
};

test("shouldBotInitiateProactiveChat returns true when bot has never initiated", () => {
  assert.equal(shouldBotInitiateProactiveChat("elon-musk", mockWorkspace), true);
});

test("shouldBotInitiateProactiveChat returns false when bot has an unread proactive chat", () => {
  const ws: Workspace = {
    ...mockWorkspace,
    chats: [
      {
        id: "chat-proactive-1",
        botId: "elon-musk",
        title: "Proactive check-in",
        messages: [{ id: "m1", role: "assistant", content: "Hey there" }],
        summary: "",
        compactedCount: 0,
        updatedAt: Date.now(),
        isProactive: true,
        proactiveRead: false,
      },
    ],
  };
  assert.equal(shouldBotInitiateProactiveChat("elon-musk", ws), false);
  // Other bot without unread chat should still return true
  assert.equal(shouldBotInitiateProactiveChat("steve-jobs", ws), true);
});

test("shouldBotInitiateProactiveChat returns false when user is actively in a chat with that bot", () => {
  const ws: Workspace = {
    ...mockWorkspace,
    chats: [
      {
        id: "active-chat-1",
        botId: "elon-musk",
        title: "Rocket propulsion discussion",
        messages: [{ id: "m1", role: "user", content: "Let's talk about thrust" }],
        summary: "",
        compactedCount: 0,
        updatedAt: Date.now(),
      },
    ],
  };
  assert.equal(shouldBotInitiateProactiveChat("elon-musk", ws, "active-chat-1"), false);
  // Not in active chat with steve-jobs, so true
  assert.equal(shouldBotInitiateProactiveChat("steve-jobs", ws, "active-chat-1"), true);
});

test("extractConversationTopic retrieves meaningful titles and falls back to messages", () => {
  const chatWithTitle: Chat = {
    id: "c1",
    botId: "elon-musk",
    title: "Next.js performance optimization",
    messages: [],
    summary: "",
    compactedCount: 0,
    updatedAt: Date.now(),
  };
  assert.equal(extractConversationTopic(chatWithTitle), "Next.js performance optimization");

  const chatWithGenericTitle: Chat = {
    id: "c2",
    botId: "elon-musk",
    title: "New conversation",
    messages: [
      { id: "m1", role: "user", content: "How do I build an autonomous drone?" },
      { id: "m2", role: "assistant", content: "Start with the flight controller." },
    ],
    summary: "",
    compactedCount: 0,
    updatedAt: Date.now(),
  };
  assert.equal(extractConversationTopic(chatWithGenericTitle), "How do I build an autonomous drone");
});

test("generateContextualProactiveMessage produces direct follow-up based on prior chat with same bot", () => {
  const ws: Workspace = {
    ...mockWorkspace,
    chats: [
      {
        id: "c1",
        botId: "elon-musk",
        title: "Battery cell thermal management",
        messages: [
          { id: "m1", role: "user", content: "We are seeing thermal runaway risks." },
          { id: "m2", role: "assistant", content: "Review tab cooling and cooling loops." },
        ],
        summary: "",
        compactedCount: 0,
        updatedAt: Date.now() - 5000,
      },
    ],
  };

  const elonFollowup = generateContextualProactiveMessage(mockElonBot, ws);
  assert.match(elonFollowup.title, /Battery cell thermal management/i);
  assert.match(elonFollowup.message, /Battery cell thermal management/i);
  assert.match(elonFollowup.message, /first principles|bottleneck|physics/i);
});

test("generateContextualProactiveMessage produces cross-bot perspective based on workspace chat", () => {
  const ws: Workspace = {
    ...mockWorkspace,
    chats: [
      {
        id: "c1",
        botId: "elon-musk",
        title: "Autonomous drone hardware",
        messages: [
          { id: "m1", role: "user", content: "Designing the carbon fiber frame." },
        ],
        summary: "",
        compactedCount: 0,
        updatedAt: Date.now() - 5000,
      },
    ],
  };

  const steveFollowup = generateContextualProactiveMessage(mockSteveBot, ws);
  assert.match(steveFollowup.title, /Autonomous drone hardware/i);
  assert.match(steveFollowup.message, /Autonomous drone hardware/i);
  assert.match(steveFollowup.message, /user experience|taste|focus/i);
});

test("formatTimeAgo formats elapsed times correctly", () => {
  const now = Date.now();
  assert.equal(formatTimeAgo(now - 10000), "Just now");
  assert.equal(formatTimeAgo(now - 5 * 60 * 1000), "5m ago");
  assert.equal(formatTimeAgo(now - 3 * 3600 * 1000), "3h ago");
  assert.equal(formatTimeAgo(now - 2 * 86400 * 1000), "2d ago");
});

test("buildProactiveContextSummary aggregates recent chats and pending tasks", () => {
  const ws: Workspace = {
    ...mockWorkspace,
    chats: [
      {
        id: "c1",
        botId: "elon-musk",
        title: "SpaceX Starship launch tower",
        messages: [
          { id: "m1", role: "user", content: "The chopstick arms need higher slew speed." },
        ],
        summary: "",
        compactedCount: 0,
        updatedAt: Date.now() - 1000,
      },
    ],
    todos: [
      {
        id: "t1",
        text: "Calculate hydraulic flow rate",
        completed: false,
        createdAt: Date.now(),
      },
    ],
  };

  const summary = buildProactiveContextSummary(mockElonBot, ws);
  assert.match(summary, /SpaceX Starship launch tower/i);
  assert.match(summary, /Calculate hydraulic flow rate/i);
});
