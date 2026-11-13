import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/chat/route";
import { chatRequestSchema } from "../src/lib/chat-schema";
test("chat API rejects unauthenticated requests before reading their payload", async () => {
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
    401,
  );
  assert.equal((await POST(new Request("http://localhost/api/chat", { method: "POST", body: "{" }))).status, 401);
});

test("chat payload schema does not force a 2048 default max_tokens and accepts high token outputs", () => {
  const parsedWithoutMax = chatRequestSchema.safeParse({
    model: "google/gemini-2.0-flash-001",
    messages: [{ role: "user", content: "Write a complete plan" }],
    stream: true,
  });
  assert.equal(parsedWithoutMax.success, true);
  if (parsedWithoutMax.success) {
    assert.equal(parsedWithoutMax.data.max_tokens, undefined);
  }

  const parsedWithLargeMax = chatRequestSchema.safeParse({
    model: "google/gemini-2.0-flash-001",
    messages: [{ role: "user", content: "Write a complete plan" }],
    stream: true,
    max_tokens: 16384,
  });
  assert.equal(parsedWithLargeMax.success, true);
  if (parsedWithLargeMax.success) {
    assert.equal(parsedWithLargeMax.data.max_tokens, 16384);
  }
});
