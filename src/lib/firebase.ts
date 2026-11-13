import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  signInAnonymously,
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import type { Workspace } from "./memory";
import {
  encryptWorkspace,
  decryptWorkspace,
  getLocalEncryptionKey,
} from "./crypto";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const firebaseConfigured = Boolean(
  config.apiKey && config.projectId && config.appId,
);
function services() {
  if (!firebaseConfigured)
    throw new Error("Add your Firebase configuration to .env.local first.");
  const app = getApps()[0] || initializeApp(config);
  return { auth: getAuth(app), db: getFirestore(app) };
}

export async function connectCloud(google = false, encryptionKey?: string) {
  const { auth, db } = services();
  await auth.authStateReady();
  if (google) {
    const provider = new GoogleAuthProvider();
    if (auth.currentUser?.isAnonymous) {
      await linkWithPopup(auth.currentUser, provider);
    } else if (!auth.currentUser) await signInWithPopup(auth, provider);
  }
  if (!auth.currentUser) await signInAnonymously(auth);
  const uid = auth.currentUser!.uid;
  const snap = await getDoc(doc(db, "users", uid, "workspace", "main"));
  if (!snap.exists()) {
    return {
      uid,
      workspace: null,
      needsPassphrase: false,
    };
  }

  const rawData = snap.data().data;
  const key = encryptionKey || getLocalEncryptionKey(uid);

  try {
    const workspace = await decryptWorkspace(rawData, key);
    return {
      uid,
      workspace,
      needsPassphrase: false,
    };
  } catch {
    return {
      uid,
      workspace: null,
      needsPassphrase: true,
      rawEncryptedData: rawData,
    };
  }
}

export function watchAuth(callback: (user: User | null) => void) {
  if (!firebaseConfigured) return () => {};
  return onAuthStateChanged(services().auth, callback);
}

export async function authToken() {
  const { auth } = services();
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Sign in to continue.");
  return auth.currentUser.getIdToken();
}

export async function disconnectCloud() {
  const { auth } = services();
  await signOut(auth);
}

export async function saveCloud(uid: string, workspace: Workspace, encryptionKey?: string) {
  const { db } = services();
  let sanitized: any = JSON.parse(JSON.stringify(workspace));
  let data = JSON.stringify(sanitized);

  // If workspace approaches Firestore document size limits (e.g. from inline image attachments),
  // strip large base64 data URLs from older chat attachments to ensure bots and conversations
  // always save reliably to Firestore without exceeding limits.
  if (new TextEncoder().encode(data).length > 700000 && Array.isArray(sanitized.chats)) {
    sanitized.chats = sanitized.chats.map((c: any) => ({
      ...c,
      messages: Array.isArray(c.messages)
        ? c.messages.map((m: any) => ({
            ...m,
            attachments: Array.isArray(m.attachments)
              ? m.attachments.map((a: any) => ({
                  ...a,
                  // Strip huge base64 data URLs in older messages; keep metadata
                  url: typeof a.url === "string" && a.url.length > 2000 ? "" : a.url,
                }))
              : m.attachments,
          }))
        : c.messages,
    }));
    data = JSON.stringify(sanitized);
  }

  if (new TextEncoder().encode(data).length > 850000) {
    // Retain all bots and recent chats, trim oldest chats if necessary
    if (Array.isArray(sanitized.chats) && sanitized.chats.length > 5) {
      sanitized.chats = sanitized.chats.slice(0, 10);
      data = JSON.stringify(sanitized);
    }
    if (new TextEncoder().encode(data).length > 850000) {
      throw new Error(
        "Cloud workspace is near its size limit. Export a backup; local changes are still saved.",
      );
    }
  }

  const key = encryptionKey || getLocalEncryptionKey(uid);
  const encryptedPayload = await encryptWorkspace(sanitized, key);

  await setDoc(doc(db, "users", uid, "workspace", "main"), {
    data: encryptedPayload,
    updatedAt: Date.now(),
  });
}
