# MyAdvisor

A personal AI chat workspace built with Next.js App Router, React, Tailwind CSS, Firebase, and OpenRouter. Dark cyberpunk styling, three starter companions, custom bot personalities, streamed Markdown responses, and a knowledge wiki that grows from your conversations.

## Run locally

Requires Node.js 20.9 or newer (tested with Node 24).

```powershell
npm install
npm run dev
```

Open http://localhost:3000. The interface, bot editor, wiki, and local persistence work without Firebase. Open **Settings**, enter your own [OpenRouter API key](https://openrouter.ai/settings/keys), and start chatting. The key is held in React memory only: refresh the page and you will need to enter it again. It is never written to localStorage, Firestore, or application logs. The Next.js server forwards it to OpenRouter over HTTPS.

Each bot has an editable OpenRouter model ID. Starter bots use `openai/gpt-4o-mini`. Check [OpenRouter models](https://openrouter.ai/models) for availability and current pricing. Users pay their own provider costs. There are no tool calls, web browsing, or autonomous actions inside chats.

## Firebase setup — what you need to do

This checkout is already connected to **MyAdvisor** (`myadvisor-mahadevan`). The web app config is in the ignored `.env.local`; `.firebaserc` selects the project. Google and Anonymous authentication are enabled, `localhost` is authorized, and the default Firestore database runs in `asia-south1` (Mumbai) on the free tier. The private workspace rules have been deployed. The steps below remain as a reference for another environment.

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. In **Project settings → General → Your apps**, register a **Web app**. Copy the values from the generated `firebaseConfig` object.
3. Copy `.env.example` to `.env.local` in the project root and enter your values:

   ```dotenv
   NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
   ```

   Use the exact values from your console. These are Firebase web configuration values, not your OpenRouter key. Firebase web config is public; access is protected by Authentication and Firestore rules. No Admin SDK private key is needed. Storage and Analytics are not used.

4. In **Authentication → Sign-in method**, enable **Google** (choose a project support email) and **Anonymous**. Google is recommended for access from multiple devices. Anonymous sync is tied to the browser's Firebase identity; clearing browser data can lose access unless you first link Google.
5. In **Authentication → Settings → Authorized domains**, add `localhost` if missing. Add your real domain before deployment. Open the app using `localhost`, not `0.0.0.0`.
6. Create a **Cloud Firestore** database in **production mode**, using the default database and a region near your users.
7. Publish the contents of `firestore.rules` in **Firestore Database → Rules**, or use the Firebase CLI:

   ```powershell
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```

   The rules only allow an authenticated user to access their own workspace at `users/{uid}/workspace/main`. Do not use public test-mode rules.

8. Restart `npm run dev` after saving `.env.local`. Open **Settings → Connect with Google** or **Anonymous sync**. The app loads the cloud workspace and merges new local records. When IDs overlap, the cloud version takes priority. Subsequent changes are saved after a short debounce. The API key is excluded from cloud data.

If a Google account is already linked to another Firebase user, anonymous account linking can fail. Export a backup before switching identities; this initial version does not merge separate Firebase accounts. Cloud sync reconnects through Settings after a refresh and is intended for one active editing session at a time.

Reference: [Firebase anonymous authentication](https://firebase.google.com/docs/auth/web/anonymous-auth), [Firebase user-based security rules](https://firebase.google.com/docs/rules/rules-and-auth).

## Memory, wiki, and token budget

- **Streaming:** `/api/chat` forwards OpenRouter's SSE body without buffering. The client handles split UTF-8 chunks, keepalives, provider errors, interruption, and cancellation. Response latency depends on the selected model/provider and network. See [OpenRouter chat API](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request).
- **Automatic wiki:** a completed response creates or updates one wiki entry for its conversation. It contains the rolling summary and recent conversation excerpts. This is a searchable conversation knowledge base, not an independently researched encyclopedia. Saving wiki entries costs no additional model tokens.
- **Lightweight retrieval:** query terms rank same-bot entries; the best three contribute at most 3,600 characters. Entries from the current conversation are excluded to avoid duplicating active context. Source chips open the original note. No paid embedding calls or vector database are required. Lexical matching is intentionally simple and can miss synonyms or non-Latin queries.
- **Compaction:** once active history exceeds approximately 6,000 tokens and has more than four messages, older messages are summarized in bounded chunks. The latest four messages remain verbatim. Each chunk is processed before advancing the compaction cursor; the summary is carried forward. Summaries are reused on subsequent turns. Compaction is a billed model call and can delay the first response on that turn.
- **Bounds:** recent context is capped at 26,000 characters; retrieved context at 3,600; summary at 6,000; bot instructions at 5,000. Completion is capped at 2,048 tokens and summary calls at 700. The displayed token count is an estimate (`characters / 4`), not the provider's billed count. Exceptionally long recent histories can be truncated by the hard cap. Original messages remain in local history.
- **Persistence:** browser localStorage saves conversations, bots, and wiki entries. Optional Firestore saves one private workspace document. It guards at 850 KB before Firestore's document limit and reports failures while keeping local data. This initial architecture is for personal workspaces; larger deployments should move conversations and messages into separate documents, use indexed retrieval, and add conflict resolution. Browser storage also has a quota. Use **Export workspace backup** to download your data; JSON restore is not yet implemented.

Conversation text is sent to the selected model provider through OpenRouter, and to Firebase only when cloud sync is connected. This is not end-to-end encrypted storage. Notes and summaries are treated as untrusted reference material in the model prompt. No tools are exposed.

## Validation

```powershell
npm test
npm run typecheck
npm run build
```

For browser tests, leave the dev server running in another terminal:

```powershell
npx playwright install chromium
npx playwright test
```

Unit tests cover retrieval isolation, context bounds, compaction threshold, streaming chunk boundaries, interruption, API validation, and streaming pass-through. Browser tests cover custom bot creation, chat → wiki → retrieval, persistence, key non-persistence, automatic compaction, missing keys, provider errors, and mobile overflow. Browser model responses are mocked; no API credits are used. Live provider and Firebase integration require your credentials and were not verified against a real account.

## Structure

- `src/app/page.tsx`: responsive workspace, bot editor, chat, settings, and wiki.
- `src/app/api/chat/route.ts`: validated streaming OpenRouter proxy.
- `src/lib/memory.ts`: context budgeting, retrieval, and wiki extraction.
- `src/lib/stream.ts`: streaming response parser.
- `src/lib/firebase.ts`: optional authenticated cloud persistence.
- `firestore.rules`: per-user workspace access rules.

For a public deployment, use a Node-compatible Next.js host, HTTPS, abuse controls, and a storage design appropriate for the expected scale. No deployment has been made by this project setup.
