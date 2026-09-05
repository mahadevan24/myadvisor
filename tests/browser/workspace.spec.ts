import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/connection", route => route.fulfill({ json: { connected: true } }));
  await page.route("**/api/models", route => route.fulfill({ json: { models: [
    { id: "openai/gpt-4o-mini", name: "OpenAI: GPT-4o mini", context: 128000, inputPrice: 0.15, outputPrice: 0.6 },
    { id: "anthropic/test-chat", name: "Anthropic: Test Chat", context: 200000, inputPrice: 3, outputPrice: 15 },
    { id: "google/test-free", name: "Google: Test Free", context: 32000, inputPrice: 0, outputPrice: 0 },
  ] } }));
});
async function connect(page: Page) {
  await page.getByRole("button", { name: "Connect API key" }).click();
  await page
    .getByLabel("OpenRouter API key", { exact: true })
    .fill("test-key-never-sent-to-provider");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "API key connected" })).toBeVisible();
}
const sse =
  'data: {"choices":[{"delta":{"content":"Neural networks learn patterns. "}}]}\n\ndata: {"choices":[{"delta":{"content":"**Start with a small experiment.**"}}]}\n\ndata: [DONE]\n\n';
test("model selection is searchable, persists per bot and reaches chat API", async ({ page }) => {
  let sentModel = "";
  await page.route("**/api/chat", route => {
    sentModel = route.request().postDataJSON().model;
    return route.fulfill({ contentType: "text/event-stream", body: sse });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Choose model:" }).click();
  await page.getByLabel("Search models").fill("anthropic");
  await expect(page.locator(".model-option")).toHaveCount(1);
  await page.getByRole("button", { name: /Anthropic: Test Chat/ }).click();
  await connect(page);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Test model selection");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message.assistant")).toContainText("Start with a small experiment.");
  expect(sentModel).toBe("anthropic/test-chat");
  await page.getByRole("button", { name: "⌘ Cipher", exact: true }).click();
  await expect(page.getByRole("button", { name: "Choose model: openai/gpt-4o-mini", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Choose model: anthropic/test-chat", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Configure bot", exact: true }).click();
  await page.getByRole("button", { name: "Choose from model catalog" }).click();
  await page.getByLabel("Search models").fill("google");
  await page.getByRole("button", { name: /Google: Test Free/ }).click();
  await expect(page.getByLabel("OpenRouter model ID")).toHaveValue("google/test-free");
  await page.getByLabel("Name", { exact: true }).fill("Nova edited");
  await page.getByRole("button", { name: "blue color" }).click();
  await page.getByRole("button", { name: "Save bot" }).click();
  await expect(page.getByRole("button", { name: "Choose model: google/test-free", exact: true })).toBeVisible();
  await expect(page.locator(".bot-nav.selected")).toContainText("Nova edited");
});

test("catalog recovers from failure, empty search works, and key verification is truthful", async ({ page }) => {
  let failure = true;
  await page.route("**/api/models", async route => failure
    ? route.fulfill({ status: 502, json: { error: "Catalog temporarily unavailable" } })
    : route.fallback());
  await page.route("**/api/connection", route => route.fulfill({ status: 401, json: { error: "OpenRouter rejected this API key." } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Choose model:" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("temporarily unavailable");
  failure = false;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".model-option")).toHaveCount(3);
  await page.getByLabel("Search models").fill("does-not-exist");
  await expect(page.getByText("No models match your search.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Connect API key" }).click();
  await page.getByLabel("OpenRouter API key", { exact: true }).fill("test-invalid-key");
  await expect(page.getByRole("status")).toContainText("rejected");
  await expect(page.getByRole("button", { name: "API key connected", exact: true })).toHaveCount(0);
  await page.route("**/api/connection", route => route.fulfill({ json: { connected: true } }));
  await page.getByRole("button", { name: "Retry verification" }).click();
  await expect(page.getByRole("status")).toContainText("Key verified");
  await page.getByLabel("OpenRouter API key", { exact: true }).fill("");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect API key" })).toBeVisible();
});

test("wiki search, source navigation, deletion and backup download work", async ({ page }) => {
  await page.route("**/api/chat", route => route.fulfill({ contentType: "text/event-stream", body: sse }));
  await page.goto("/");
  await connect(page);
  await page.getByRole("button", { name: /Think bigger/ }).click();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(/Help me explore/);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Neural network notes");
  await page.keyboard.press("Enter");
  await expect(page.locator(".message.assistant")).toContainText("Start with a small experiment.");
  await page.getByRole("button", { name: "Open knowledge wiki", exact: true }).click();
  await page.getByPlaceholder("Search your knowledge…").fill("absent-term");
  await expect(page.getByText("No matching notes yet.")).toBeVisible();
  await page.getByPlaceholder("Search your knowledge…").fill("Neural");
  await page.locator(".entry-card").click();
  await page.getByRole("button", { name: "Open source conversation" }).click();
  await expect(page.locator(".message.user")).toContainText("Neural network notes");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export workspace backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("myadvisor-workspace.json");
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(path!, "utf8");
  expect(JSON.parse(text).entries).toHaveLength(1);
  expect(text).not.toContain("test-key-never-sent");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Knowledge wiki 1", exact: true }).click();
  await page.locator(".entry-card").click();
  await page.getByRole("button", { name: "Delete wiki entry" }).click();
  await expect(page.getByRole("button", { name: "Knowledge wiki 0", exact: true })).toBeVisible();
});

test("stop generation unlocks composer and navigation", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/chat", async route => {
    await pending;
    await route.fulfill({ contentType: "text/event-stream", body: sse }).catch(() => {});
  });
  await page.goto("/");
  await connect(page);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Wait for a response");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Choose model:" })).toBeDisabled();
  await page.getByRole("button", { name: "Stop generation" }).click();
  await expect(page.locator(".error-banner")).toContainText("Generation stopped");
  release();
  await expect(page.getByRole("button", { name: "Choose model:" })).toBeEnabled();
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.locator(".message.user")).toHaveCount(0);
});

test("model picker stays within a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "Choose model:" }).click();
  await expect(page.getByLabel("Search models")).toBeVisible();
  await page.getByLabel("Search models").fill("google");
  await expect(page.locator(".model-option")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/model-picker-mobile.png" });
});
test("create bot, stream chat, persist wiki and retrieve it in a new conversation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let requestBody:
    { messages: { role: string; content: string }[] } | undefined;
  await page.route("**/api/chat", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ contentType: "text/event-stream", body: sse });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create bot", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Atlas");
  await page.getByLabel("Short description").fill("A research companion.");
  await page
    .getByLabel("Personality & instructions")
    .fill("Be precise and curious.");
  await page.getByRole("button", { name: "Save bot" }).click();
  await page.getByRole("button", { name: "✳ Atlas", exact: true }).click();
  await connect(page);
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Explain neural networks");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message.assistant")).toContainText(
    "Start with a small experiment.",
  );
  await expect(
    page.getByRole("button", { name: "Knowledge wiki 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Knowledge wiki 1" }).click();
  await page.locator(".entry-card").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Neural networks learn patterns.",
  );
  await page.getByRole("button", { name: "Close wiki entry" }).click();
  await page.getByRole("button", { name: "New conversation" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("What else about neural networks?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".source-chips")).toContainText(
    "Explain neural networks",
  );
  expect(requestBody?.messages[0].content).toContain("RETRIEVED WIKI NOTES");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "✳ Atlas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect API key" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("myadvisor.workspace.v1")),
  ).not.toContain("test-key-never-sent");
  expect(errors).toEqual([]);
});
test("long conversation compacts before streaming and saves summary", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => localStorage.getItem('myadvisor.workspace.v1'));
  await page.addInitScript(() => {
    const data = JSON.parse(localStorage.getItem("myadvisor.workspace.v1")!);
    data.chats = [
      {
        id: "long",
        botId: "nova",
        title: "Long memory test",
        summary: "",
        compactedCount: 0,
        updatedAt: 1,
        messages: Array.from({ length: 10 }, (_, i) => ({
          id: String(i),
          role: i % 2 ? "assistant" : "user",
          content: "memory ".repeat(420),
        })),
      },
    ];
    localStorage.setItem("myadvisor.workspace.v1", JSON.stringify(data));
  });
  await page.reload();
  const calls: boolean[] = [];
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body.stream);
    await route.fulfill(
      body.stream
        ? { contentType: "text/event-stream", body: sse }
        : {
            contentType: "application/json",
            body: JSON.stringify({
              choices: [
                {
                  message: { content: "The user prefers practical examples." },
                },
              ],
            }),
          },
    );
  });
  await connect(page);
  await page.getByRole("button", { name: "Long memory test" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Continue");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message.assistant").last()).toContainText(
    "Start with a small experiment.",
  );
  expect(calls).toEqual([false, true]);
  await expect(page.locator(".context-card")).toContainText(
    "messages compacted into memory",
  );
});
test("missing key and provider errors remain actionable; mobile has no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Hello");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator('.error-banner')).toContainText(
    "Add your OpenRouter key",
  );
  await page
    .getByLabel("OpenRouter API key", { exact: true })
    .fill("test-key-not-real");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 402,
      contentType: "application/json",
      body: JSON.stringify({ error: "Your OpenRouter account needs credits." }),
    }),
  );
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator('.error-banner')).toContainText("needs credits");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
