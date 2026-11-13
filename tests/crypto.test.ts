import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptWorkspace,
  decryptWorkspace,
  isEncryptedPayload,
  bytesToBase64,
  base64ToBytes,
  generateEncryptionKey,
  getAccountEncryptionKey,
  encryptPayload,
  decryptPayload,
  getChatEncryptionKey,
  encryptStreamChunk,
  decryptStreamChunk,
  isEncryptedStreamChunk,
} from "../src/lib/crypto";
import { readStream } from "../src/lib/stream";
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

test("account-derived encryption key allows multi-device workspace sync across desktop and mobile", async () => {
  const uid = "firebase-user-12345";
  const desktopKey = getAccountEncryptionKey(uid);
  const mobileKey = getAccountEncryptionKey(uid);

  assert.equal(desktopKey, mobileKey, "Account-derived key must be identical across devices for the same user");

  const desktopEncrypted = await encryptWorkspace(mockWorkspace, desktopKey);
  const mobileDecrypted = await decryptWorkspace(desktopEncrypted, mobileKey);

  assert.deepEqual(mobileDecrypted, mockWorkspace, "Mobile device must seamlessly decrypt desktop workspace");
});

test("encryptPayload obscures sensitive chat request messages on network wire", async () => {
  const uid = "user-work-laptop-456";
  const chatKey = getChatEncryptionKey(uid);
  const sensitiveChatPayload = {
    model: "google/gemini-flash-latest",
    messages: [
      { role: "system", content: "You are an executive advisor." },
      { role: "user", content: "so far today I didn't complete any of my work task also in ibm" },
    ],
    stream: true,
  };

  const encrypted = await encryptPayload(sensitiveChatPayload, chatKey);
  assert.equal(encrypted._encrypted, true);
  assert.equal(isEncryptedPayload(encrypted), true);

  const wireString = JSON.stringify(encrypted);
  // Ensure sensitive plaintext is NOT visible on the wire/network tab
  assert.equal(wireString.includes("so far today I didn't complete any of my work task also in ibm"), false);
  assert.equal(wireString.includes("ibm"), false);
  assert.equal(wireString.includes("executive advisor"), false);

  // Decrypt on the receiving end
  const decrypted = await decryptPayload(encrypted, chatKey);
  assert.deepEqual(decrypted, sensitiveChatPayload);
});

test("encryptStreamChunk and readStream obscure streaming responses without plaintext on wire", async () => {
  const uid = "user-work-laptop-456";
  const chatKey = getChatEncryptionKey(uid);

  const chunk1 = { choices: [{ delta: { reasoning: "Private thought." } }] };
  const chunk2 = { choices: [{ delta: { content: "Confidential company advisory." } }] };

  const encryptedChunk1 = await encryptStreamChunk(chunk1, chatKey);
  const encryptedChunk2 = await encryptStreamChunk(chunk2, chatKey);

  assert.equal(isEncryptedStreamChunk(encryptedChunk1), true);
  assert.equal(isEncryptedStreamChunk(encryptedChunk2), true);

  const wire1 = JSON.stringify(encryptedChunk1);
  const wire2 = JSON.stringify(encryptedChunk2);
  assert.equal(wire1.includes("Private thought"), false);
  assert.equal(wire2.includes("Confidential company advisory"), false);

  // Wire stream simulation
  const wireSse =
    `data: ${wire1}\n\n` +
    `data: ${wire2}\n\n` +
    `data: [DONE]\n\n`;

  let capturedReasoning = "";
  const result = await readStream(
    new Response(wireSse),
    () => {},
    (r) => { capturedReasoning = r; },
    chatKey,
  );

  assert.equal(capturedReasoning, "Private thought.");
  assert.equal(result, "Confidential company advisory.");
});
