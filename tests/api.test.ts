import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/chat/route";
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
