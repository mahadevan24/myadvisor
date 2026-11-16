import {
  Bot,
  Chat,
  Workspace,
  isGenericTitle,
  isGreeting,
  isGreetingTitle,
} from "./memory";
import { authToken } from "./firebase";
import {
  encryptPayload,
  decryptPayload,
  getChatEncryptionKey,
  isEncryptedPayload,
} from "./crypto";

export function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Just now";
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / (60 * 1000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function extractConversationTopic(chat?: Chat): string {
  if (!chat) return "";
  if (chat.title && !isGenericTitle(chat.title) && !isGreetingTitle(chat.title)) {
    return chat.title.trim();
  }
  if (Array.isArray(chat.messages)) {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (
        m &&
        m.role === "user" &&
        m.content &&
        !isGreeting(m.content) &&
        !isGreetingTitle(m.content)
      ) {
        const cleaned = m.content
          .replace(/^["'`#*]+|["'`#*!?.-\s]+$/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (cleaned.length > 3) {
          return cleaned.slice(0, 50);
        }
      }
    }
  }
  return "";
}

export function shouldBotInitiateProactiveChat(
  botId: string,
  workspace: Workspace,
  activeChatId?: string | null,
): boolean {
  if (!botId || !workspace || !Array.isArray(workspace.chats)) return false;

  // 1. If the bot already has an unread proactive chat waiting for user attention, do not initiate another.
  const hasUnread = workspace.chats.some(
    (c) => c.botId === botId && c.isProactive && !c.proactiveRead,
  );
  if (hasUnread) return false;

  // 2. If the user is currently engaged in an active conversation with this specific bot, don't interrupt.
  if (activeChatId) {
    const currentActiveChat = workspace.chats.find((c) => c.id === activeChatId);
    if (currentActiveChat && currentActiveChat.botId === botId) {
      return false;
    }
  }

  // 3. Check if this bot has already initiated a proactive conversation for the current conversation state.
  const botProactiveChats = workspace.chats.filter(
    (c) => c.botId === botId && c.isProactive,
  );

  if (botProactiveChats.length > 0) {
    const latestProactive = [...botProactiveChats].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    )[0];

    // Find the latest user message timestamp across non-proactive workspace chats
    let latestUserMessageTime = 0;
    for (const c of workspace.chats) {
      if (c.isProactive) continue;
      for (const m of c.messages || []) {
        if (m.role === "user") {
          latestUserMessageTime = Math.max(latestUserMessageTime, c.updatedAt || 0);
        }
      }
    }

    // If no new user message has occurred since the bot's latest proactive chat,
    // and less than 30 minutes have elapsed, do not duplicate proactive generation.
    const cooldownMs = 30 * 60 * 1000;
    if (
      latestProactive.updatedAt >= latestUserMessageTime &&
      Date.now() - latestProactive.updatedAt < cooldownMs
    ) {
      return false;
    }
  }

  return true;
}

export function generateContextualProactiveMessage(
  bot: Bot,
  workspace: Workspace,
): { title: string; message: string } {
  const botName = bot.name || "Advisor";
  const isElon = /elon\s*musk/i.test(botName) || bot.id === "elon-musk";
  const isSteve = /steve\s*jobs/i.test(botName) || bot.id === "steve-jobs";
  const isSam = /sam\s*altman/i.test(botName) || bot.id === "sam-altman";
  const isNaval = /naval/i.test(botName) || bot.id === "naval";
  const isMarcus = /marcus/i.test(botName) || /stoic/i.test(botName);

  // 1. Check for prior direct conversations with this specific bot
  const priorDirectChats = (workspace.chats || [])
    .filter(
      (c) =>
        c.botId === bot.id &&
        !c.isProactive &&
        c.messages?.some((m) => m.role === "user"),
    )
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (priorDirectChats.length > 0) {
    const lastChat = priorDirectChats[0];
    const topic = extractConversationTopic(lastChat);

    if (topic) {
      if (isElon) {
        return {
          title: `First principles: ${topic}`,
          message: `I was thinking more about our discussion on ${topic}. If we strip away the conventional assumptions and look at the fundamental constraints, what is the single biggest bottleneck holding you back? Let's solve that directly.`,
        };
      }
      if (isSteve) {
        return {
          title: `Refining: ${topic}`,
          message: `Thinking back to our conversation on ${topic}—details matter, but the overarching clarity and simplicity matter more. How do we make this feel effortless and remarkable for the user?`,
        };
      }
      if (isSam) {
        return {
          title: `Compounding growth: ${topic}`,
          message: `Following up on our talk about ${topic}. The best founders move fast and build compounding loops. What's the fastest experiment you can run today to validate your next milestone?`,
        };
      }
      if (isNaval) {
        return {
          title: `Leverage & judgment: ${topic}`,
          message: `Reflecting on ${topic} from our previous talk: are you applying leverage—code, media, or capital—or simply working harder? Let's align your effort with long-term judgment.`,
        };
      }
      if (isMarcus) {
        return {
          title: `Reason & action: ${topic}`,
          message: `Regarding our discourse on ${topic}: fix your attention on what is within your domain today. Let no external distractions cloud the essential work at hand. What step will you take?`,
        };
      }

      return {
        title: `Follow-up: ${topic}`,
        message: `Checking in on our previous conversation regarding ${topic}. I wanted to see how you're progressing and if you'd like to explore the next steps together.`,
      };
    }

    return {
      title: `Continuing our discussion`,
      message: `I was reviewing our previous conversation notes and wanted to follow up. How are things developing on your side, and what should we focus on next?`,
    };
  }

  // 2. Check for prior conversations across the workspace (cross-bot initiative)
  const priorWorkspaceChats = (workspace.chats || [])
    .filter(
      (c) =>
        c.botId !== bot.id &&
        !c.isProactive &&
        c.messages?.some((m) => m.role === "user"),
    )
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (priorWorkspaceChats.length > 0) {
    const lastWorkspaceChat = priorWorkspaceChats[0];
    const otherBot = (workspace.bots || []).find(
      (b) => b.id === lastWorkspaceChat.botId,
    );
    const topic = extractConversationTopic(lastWorkspaceChat);

    if (topic) {
      if (isElon) {
        return {
          title: `Engineering review: ${topic}`,
          message: `I noticed you've been working on ${topic}${otherBot ? ` with ${otherBot.name}` : ""}. How can we apply first principles here to eliminate waste and accelerate execution?`,
        };
      }
      if (isSteve) {
        return {
          title: `Product vision: ${topic}`,
          message: `I saw your recent discussions on ${topic}. Great ideas fail when they lack taste and ruthless focus. Have you defined what the ideal user experience looks like here?`,
        };
      }
      if (isSam) {
        return {
          title: `Strategic perspective: ${topic}`,
          message: `I noticed your recent conversation about ${topic}. What does the 10x version of this look like, and what's your competitive advantage as it scales?`,
        };
      }
      if (isNaval) {
        return {
          title: `Applying leverage: ${topic}`,
          message: `Looking at your recent focus on ${topic}: make sure you're building specific knowledge and leverage that compounds over time, rather than trading time for linear output.`,
        };
      }
      if (isMarcus) {
        return {
          title: `Steadfast action: ${topic}`,
          message: `I observed your recent efforts surrounding ${topic}. Do not be overwhelmed by the entirety of the task; take it action by action, with clarity and purpose.`,
        };
      }

      return {
        title: `Perspective on: ${topic}`,
        message: `I noticed your recent conversations around ${topic}. From my perspective as ${botName}, there are some key insights we shouldn't overlook. Let's discuss when you're ready.`,
      };
    }
  }

  // 3. Fallback when no previous conversation history exists yet
  if (isElon) {
    return {
      title: `First principles check-in`,
      message: `What's the hardest, highest-impact problem you're working on today? Let's break it down to fundamental physical truths and build up from there.`,
    };
  }
  if (isSteve) {
    return {
      title: `Making a dent in the universe`,
      message: `What are we creating today that's going to be truly great? Let's cut through the noise and focus on what matters.`,
    };
  }
  if (isSam) {
    return {
      title: `Momentum check-in`,
      message: `What's the most ambitious goal on your roadmap right now? Let's figure out how to accelerate your execution.`,
    };
  }

  return {
    title: `Hello from ${botName}`,
    message: `Hello! I'm ${botName}. ${bot.description ? `${bot.description}. ` : ""}What is the most important project or challenge on your mind right now?`,
  };
}

export function buildProactiveContextSummary(bot: Bot, workspace: Workspace): string {
  const parts: string[] = [];

  // Recent chats with this bot
  const botChats = (workspace.chats || [])
    .filter((c) => c.botId === bot.id && !c.isProactive)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 2);

  if (botChats.length > 0) {
    parts.push(`Recent discussions with you (${bot.name}):`);
    for (const c of botChats) {
      const topic = extractConversationTopic(c);
      const userMsgs = (c.messages || [])
        .filter((m) => m.role === "user")
        .slice(-2)
        .map((m) => m.content)
        .join(" | ");
      parts.push(`- Conversation: "${topic || c.title}". User said: "${userMsgs.slice(0, 160)}"`);
    }
  }

  // Other recent chats across workspace
  const otherChats = (workspace.chats || [])
    .filter((c) => c.botId !== bot.id && !c.isProactive)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 3);

  if (otherChats.length > 0) {
    parts.push(`Recent activity with other bots in the workspace:`);
    for (const c of otherChats) {
      const otherBot = (workspace.bots || []).find((b) => b.id === c.botId);
      const topic = extractConversationTopic(c);
      const userMsgs = (c.messages || [])
        .filter((m) => m.role === "user")
        .slice(-1)
        .map((m) => m.content)
        .join(" | ");
      parts.push(
        `- With ${otherBot?.name || "advisor"}: "${topic || c.title}". User said: "${userMsgs.slice(0, 140)}"`,
      );
    }
  }

  // Relevant active todos if any
  const todos = (workspace.todos || []).filter((t) => !t.completed).slice(0, 3);
  if (todos.length > 0) {
    parts.push(`Active user tasks in workspace:`);
    for (const t of todos) {
      parts.push(`- [Pending] ${t.text}`);
    }
  }

  return parts.join("\n");
}

export async function generateProactiveMessage(
  bot: Bot,
  workspace: Workspace,
  options?: {
    cloudUid?: string | null;
    connected?: boolean;
  },
): Promise<{ title: string; message: string }> {
  // Try AI-driven proactive generation if connected and authenticated
  if (options?.connected && options?.cloudUid) {
    try {
      const contextSummary = buildProactiveContextSummary(bot, workspace);
      const messages = [
        {
          role: "system",
          content: `You are ${bot.name}.
${bot.instructions || ""}

You are proactively reaching out to the user to initiate a conversation, following up on their previous conversations and ongoing projects.
Stay completely in character.
Be direct, engaging, insightful, and concise (2-4 sentences max). Do NOT be generic. Do NOT say "As an AI".
Reference specific topics, challenges, or decisions from their previous conversations. Offer a new perspective, ask a probing question, or suggest a concrete next step.

Your response MUST follow this exact format:
TITLE: [Concise title 3-7 words]
MESSAGE: [Your proactive message]`,
        },
        {
          role: "user",
          content: contextSummary
            ? `Here is the user's recent conversation context and workspace activity:\n${contextSummary}\n\nInitiate a conversation with the user based on this context.`
            : `Initiate a conversation with the user based on your domain expertise and persona.`,
        },
      ];

      const token = await authToken();
      const chatKey = getChatEncryptionKey(options.cloudUid);
      const payload = {
        model: bot.model,
        messages,
        stream: false,
        max_tokens: 250,
      };

      const encryptedBody = await encryptPayload(payload, chatKey);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(encryptedBody),
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        let data = await res.json().catch(() => null);
        if (isEncryptedPayload(data)) {
          data = await decryptPayload(data, chatKey).catch(() => null);
        }
        const raw = String(data?.choices?.[0]?.message?.content || "").trim();
        if (raw) {
          const titleMatch = raw.match(/TITLE:\s*(.+)/i);
          const messageMatch = raw.match(/MESSAGE:\s*([\s\S]+)/i);

          const title = titleMatch ? titleMatch[1].trim() : "";
          const message = messageMatch
            ? messageMatch[1].trim()
            : raw.replace(/TITLE:\s*.+/i, "").trim();

          if (message && message.length > 10) {
            return {
              title: title ? title.slice(0, 60) : `Follow-up from ${bot.name}`,
              message,
            };
          }
        }
      }
    } catch {
      // Fallback seamlessly to contextual generator on any network or parsing error
    }
  }

  // High quality contextual fallback
  return generateContextualProactiveMessage(bot, workspace);
}
