import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "../src/lib/firebase-admin";

test("OpenRouter keys are encrypted with authenticated encryption", () => {
  process.env.OPENROUTER_KEY_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const plaintext = "sk-or-v1-test-secret";
  const encrypted = encryptSecret(plaintext);
  assert.ok(!JSON.stringify(encrypted).includes(plaintext));
  assert.equal(decryptSecret(encrypted), plaintext);
  assert.throws(() => decryptSecret({ ...encrypted, ciphertext: Buffer.from("tampered").toString("base64") }));
});
