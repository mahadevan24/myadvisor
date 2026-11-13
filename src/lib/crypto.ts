import type { Workspace } from "./memory";

export type EncryptedPayload = {
  _encrypted: true;
  version: 1;
  algorithm: "AES-GCM-256";
  iv: string; // base64 (12 bytes)
  salt: string; // base64 (16 bytes)
  ciphertext: string; // base64 (ciphertext + 16-byte GCM tag)
};

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>)._encrypted === true &&
    typeof (value as Record<string, unknown>).ciphertext === "string" &&
    typeof (value as Record<string, unknown>).iv === "string" &&
    typeof (value as Record<string, unknown>).salt === "string"
  );
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const getCrypto = (): Crypto => {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new Error("Web Crypto API (crypto.subtle) is not available in this environment.");
};

export function generateEncryptionKey(): string {
  const crypto = getCrypto();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes);
}

async function deriveKey(secretOrPassphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const crypto = getCrypto();
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretOrPassphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPayload<T = unknown>(
  data: T,
  secretOrPassphrase: string,
): Promise<EncryptedPayload> {
  const crypto = getCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secretOrPassphrase, salt);

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    plaintext as unknown as BufferSource,
  );

  return {
    _encrypted: true,
    version: 1,
    algorithm: "AES-GCM-256",
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
  };
}

export async function decryptPayload<T = unknown>(
  payload: unknown,
  secretOrPassphrase: string,
): Promise<T> {
  if (!isEncryptedPayload(payload)) {
    return payload as T;
  }

  const crypto = getCrypto();
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);

  const key = await deriveKey(secretOrPassphrase, salt);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource,
    );
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decryptedBuffer);
    return JSON.parse(jsonString) as T;
  } catch (err) {
    throw new Error("Decryption failed: invalid passphrase/key or data corrupted.");
  }
}

export async function encryptWorkspace(
  workspace: Workspace,
  secretOrPassphrase: string,
): Promise<EncryptedPayload> {
  return encryptPayload(workspace, secretOrPassphrase);
}

export async function decryptWorkspace(
  payload: unknown,
  secretOrPassphrase: string,
): Promise<Workspace> {
  return decryptPayload<Workspace>(payload, secretOrPassphrase);
}

export type EncryptedStreamChunk = {
  _encrypted: true;
  iv: string; // base64 (12 bytes)
  ciphertext: string; // base64 (ciphertext + 16-byte GCM tag)
};

export function isEncryptedStreamChunk(value: unknown): value is EncryptedStreamChunk {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>)._encrypted === true &&
    typeof (value as Record<string, unknown>).ciphertext === "string" &&
    typeof (value as Record<string, unknown>).iv === "string"
  );
}

const fastKeyCache = new Map<string, Promise<CryptoKey>>();
export function getFastStreamKey(secret: string): Promise<CryptoKey> {
  let cached = fastKeyCache.get(secret);
  if (!cached) {
    cached = (async () => {
      const crypto = getCrypto();
      const rawKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
      return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    })();
    fastKeyCache.set(secret, cached);
  }
  return cached;
}

export async function encryptStreamChunk(
  data: unknown,
  secretOrKey: string | CryptoKey,
): Promise<EncryptedStreamChunk> {
  const crypto = getCrypto();
  const key = typeof secretOrKey === "string" ? await getFastStreamKey(secretOrKey) : secretOrKey;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(typeof data === "string" ? data : JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    _encrypted: true,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptStreamChunk<T = unknown>(
  chunk: EncryptedStreamChunk,
  secretOrKey: string | CryptoKey,
): Promise<T> {
  const crypto = getCrypto();
  const key = typeof secretOrKey === "string" ? await getFastStreamKey(secretOrKey) : secretOrKey;
  const iv = base64ToBytes(chunk.iv);
  const ciphertext = base64ToBytes(chunk.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource,
  );
  const json = new TextDecoder().decode(decrypted);
  return JSON.parse(json) as T;
}

export function getChatEncryptionKey(uid?: string): string {
  return `myadvisor-chat-vault:${uid || "guest"}`;
}

export function getAccountEncryptionKey(uid: string): string {
  return `myadvisor-account-vault:${uid}`;
}

export function getLocalEncryptionKey(uid?: string): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return "default-server-or-test-key";
  }

  const custom = window.localStorage.getItem("myadvisor.e2ee.passphrase");
  if (custom && custom.trim()) {
    return custom.trim();
  }

  if (uid && uid !== "guest") {
    const accountKey = getAccountEncryptionKey(uid);
    const storageKey = `myadvisor.e2ee.deviceKey.${uid}`;
    try {
      window.localStorage.setItem(storageKey, accountKey);
    } catch {}
    return accountKey;
  }

  const storageKey = `myadvisor.e2ee.deviceKey.${uid || "default"}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing && existing.trim()) {
    return existing.trim();
  }

  const newKey = generateEncryptionKey();
  try {
    window.localStorage.setItem(storageKey, newKey);
  } catch {}
  return newKey;
}

export function setCustomPassphrase(passphrase: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!passphrase.trim()) {
    window.localStorage.removeItem("myadvisor.e2ee.passphrase");
  } else {
    window.localStorage.setItem("myadvisor.e2ee.passphrase", passphrase.trim());
  }
}

export function clearCustomPassphrase(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem("myadvisor.e2ee.passphrase");
}

export function hasCustomPassphrase(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  return Boolean(window.localStorage.getItem("myadvisor.e2ee.passphrase")?.trim());
}

export function getActiveKeyType(): "passphrase" | "device" {
  return hasCustomPassphrase() ? "passphrase" : "device";
}
