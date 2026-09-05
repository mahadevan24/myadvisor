import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/chat/route";
test("chat API rejects missing keys and malformed payloads before upstream calls", async () => {
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
  const req = (body: string) =>
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { Authorization: "Bearer test-not-a-real-key" },
      body,
    });
  assert.equal((await POST(req("{"))).status, 400);
  assert.equal((await POST(req('{"model":"x","messages":[]}'))).status, 400);
});
test("chat API forwards a validated streaming response without buffering", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(JSON.parse(init!.body as string).stream, true);
    return new Response("data: [DONE]\n\n");
  };
  try {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { Authorization: "Bearer test-not-a-real-key" },
        body: JSON.stringify({
          model: "test/model",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.equal(await response.text(), "data: [DONE]\n\n");
  } finally {
    globalThis.fetch = original;
  }
});
