import { test } from "node:test";
import assert from "node:assert/strict";
import { adminAuth, adminDb } from "../src/lib/firebase-admin";
import { PUT } from "../src/app/api/connection/route";

const request = () => new Request("http://localhost/api/connection", {
  method: "PUT", headers: { Authorization: "Bearer test-token" },
  body: JSON.stringify({ key: "sk-or-v1-test-key" }),
});

test("missing admin credentials report server setup failure instead of invalid sign-in", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => {
    throw Object.assign(new Error("credential unavailable"), { code: "app/invalid-credential" });
  });
  const response = await PUT(request());
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Firebase Admin credentials/);
});

test("provider network failures do not save the key and can be retried", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({ uid: "test-user" }));
  const storage = t.mock.method(adminDb, "doc", () => { throw new Error("Must not write"); });
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  const response = await PUT(request());
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /could not reach OpenRouter/);
  assert.equal(storage.mock.callCount(), 0);
});

test("verified keys are encrypted before storage and never returned", async (t) => {
  const previous = process.env.OPENROUTER_KEY_ENCRYPTION_KEY;
  process.env.OPENROUTER_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  t.after(() => {
    if (previous === undefined) delete process.env.OPENROUTER_KEY_ENCRYPTION_KEY;
    else process.env.OPENROUTER_KEY_ENCRYPTION_KEY = previous;
  });
  t.mock.method(adminAuth, "verifyIdToken", async () => ({ uid: "test-user" }));
  let saved: unknown;
  t.mock.method(adminDb, "doc", (path: string) => {
    assert.equal(path, "users/test-user/private/openrouter");
    return { set: async (value: unknown) => { saved = value; } };
  });
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: {} }));
  const response = await PUT(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { connected: true });
  assert.ok(saved);
  assert.ok(!JSON.stringify(saved).includes("sk-or-v1-test-key"));
});

test("missing Firestore credentials return an actionable storage error", async (t) => {
  const previous = process.env.OPENROUTER_KEY_ENCRYPTION_KEY;
  process.env.OPENROUTER_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  t.after(() => {
    if (previous === undefined) delete process.env.OPENROUTER_KEY_ENCRYPTION_KEY;
    else process.env.OPENROUTER_KEY_ENCRYPTION_KEY = previous;
  });
  t.mock.method(adminAuth, "verifyIdToken", async () => ({ uid: "test-user" }));
  t.mock.method(adminDb, "doc", () => ({
    set: async () => {
      throw Object.assign(new Error("Could not load the default credentials"), {
        code: "app/invalid-credential",
      });
    },
  }));
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: {} }));

  const response = await PUT(request());

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Firebase Admin credentials/);
});
