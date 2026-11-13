import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptWorkspace,
  decryptWorkspace,
  isEncryptedPayload,
  bytesToBase64,
  base64ToBytes,
  generateEncryptionKey,
} from "../src/lib/crypto";
import type { Workspace } from "../src/lib/memory";

const mockWorkspace: Workspace = {
  defaultBotId: "bot-1",
  bots: [
    {
      id: "bot-1",
      name: "Encrypted Bot",
      description: "A secret bot",
      instructions: "Keep all my private medical and financial thoughts secure.",
      model: "openai/gpt-4o-mini",
      color: "#6366f1",
      symbol: "🔒",
    },
  ],
  chats: [
    {
      id: "chat-1",
      botId: "bot-1",
      title: "Confidential Discussion",
      messages: [
        {
          id: "m-1",
          role: "user",
          content: "Top secret conversation text that should never appear in Firestore unencrypted.",
        },
        {
          id: "m-2",
          role: "assistant",
          content: "I confirm this conversation is encrypted with AES-256-GCM at rest and in transit.",
        },
      ],
      summary: "Secret summary of discussion",
      compactedCount: 0,
      updatedAt: 1700000000,
    },
  ],
  entries: [
    {
      id: "w-1",
      botId: "bot-1",
      chatId: "chat-1",
      title: "Private Knowledge",
      content: "Confidential knowledge base note.",
      updatedAt: 1700000000,
    },
  ],
};

test("encryptWorkspace produces authenticated AES-256-GCM ciphertext without plaintext leakage", async () => {
  const secretKey = generateEncryptionKey();
  const encrypted = await encryptWorkspace(mockWorkspace, secretKey);

  assert.equal(encrypted._encrypted, true);
  assert.equal(encrypted.version, 1);
  assert.equal(encrypted.algorithm, "AES-GCM-256");
  assert.ok(isEncryptedPayload(encrypted));

  const serialized = JSON.stringify(encrypted);
  assert.ok(!serialized.includes("Top secret conversation text"));
  assert.ok(!serialized.includes("Encrypted Bot"));
  assert.ok(!serialized.includes("Private Knowledge"));
  assert.ok(!serialized.includes("Confidential Discussion"));
});

test("decryptWorkspace restores the exact original workspace with correct key", async () => {
  const secretKey = "super-strong-user-passphrase-1234!";
  const encrypted = await encryptWorkspace(mockWorkspace, secretKey);
  const decrypted = await decryptWorkspace(encrypted, secretKey);

  assert.deepEqual(decrypted, mockWorkspace);
});

test("decryptWorkspace rejects wrong passphrase or tampered ciphertext with an error", async () => {
  const secretKey = "correct-passphrase";
  const encrypted = await encryptWorkspace(mockWorkspace, secretKey);

  // Wrong key
  await assert.rejects(
    async () => {
      await decryptWorkspace(encrypted, "wrong-passphrase");
    },
    /Decryption failed/,
  );

  // Tampered ciphertext
  const tampered = {
    ...encrypted,
    ciphertext: bytesToBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
  };
  await assert.rejects(
    async () => {
      await decryptWorkspace(tampered, secretKey);
    },
    /Decryption failed/,
  );
});

test("decryptWorkspace handles legacy unencrypted workspace seamlessly (backward compatibility)", async () => {
  const result = await decryptWorkspace(mockWorkspace, "any-key");
  assert.deepEqual(result, mockWorkspace);
});

test("bytesToBase64 and base64ToBytes handle arbitrary binary buffers correctly", () => {
  const sample = new Uint8Array([0, 255, 128, 42, 17, 99, 200, 15]);
  const b64 = bytesToBase64(sample);
  const decoded = base64ToBytes(b64);
  assert.deepEqual(decoded, sample);
});
