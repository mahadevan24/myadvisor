import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function adminApp() {
  if (getApps().length) return getApps()[0];

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp({
    credential: serviceAccount
      ? cert(JSON.parse(serviceAccount))
      : applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const app = adminApp();
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);

export async function requireUser(req: Request) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  try {
    return await adminAuth.verifyIdToken(header.slice(7), true);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code?.startsWith("app/") || code === "auth/internal-error" || code === "auth/insufficient-permission") {
      console.error("[firebase-admin] authentication unavailable", { code });
      throw new Error("AUTH_SERVICE_UNAVAILABLE");
    }
    throw new Error("UNAUTHENTICATED");
  }
}

function encryptionKey() {
  const encoded = process.env.OPENROUTER_KEY_ENCRYPTION_KEY;
  if (!encoded)
    throw new Error("OPENROUTER_KEY_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32)
    throw new Error("OPENROUTER_KEY_ENCRYPTION_KEY must be 32 bytes in base64.");
  return key;
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    version: 1,
  };
}

export function decryptSecret(data: {
  ciphertext: string;
  iv: string;
  tag: string;
}) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(data.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(data.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

const keyDocument = (uid: string) =>
  adminDb.doc(`users/${uid}/private/openrouter`);

export async function saveOpenRouterKey(uid: string, key: string) {
  await keyDocument(uid).set({
    ...encryptSecret(key),
    updatedAt: Date.now(),
  });
}

export async function getOpenRouterKey(uid: string) {
  const snapshot = await keyDocument(uid).get();
  if (!snapshot.exists) return null;
  return decryptSecret(snapshot.data() as {
    ciphertext: string;
    iv: string;
    tag: string;
  });
}

export async function deleteOpenRouterKey(uid: string) {
  await keyDocument(uid).delete();
}
