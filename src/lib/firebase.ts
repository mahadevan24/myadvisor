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
export async function connectCloud(google = false) {
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
  return {
    uid,
    workspace: snap.exists() ? (snap.data().data as Workspace) : null,
  };
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
export async function saveCloud(uid: string, workspace: Workspace) {
  const { db } = services();
  const data = JSON.stringify(workspace);
  if (new TextEncoder().encode(data).length > 850000)
    throw new Error(
      "Cloud workspace is near its size limit. Export a backup; local changes are still saved.",
    );
  await setDoc(doc(db, "users", uid, "workspace", "main"), {
    data: workspace,
    updatedAt: Date.now(),
  });
}
