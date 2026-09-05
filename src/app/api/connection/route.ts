import { z } from "zod";
import { deleteOpenRouterKey, getOpenRouterKey, requireUser, saveOpenRouterKey } from "@/lib/firebase-admin";

export const runtime = "nodejs";
const schema = z.object({ key: z.string().trim().min(15).max(300) });
const unauthorized = () => Response.json({ error: "Sign in to manage your API key." }, { status: 401 });
const unavailable = () => Response.json({ error: "Server authentication is unavailable. Configure Firebase Admin credentials on the server, then restart the app." }, { status: 503 });
const storageUnavailable = () => Response.json({ error: "Secure key storage is unavailable. Configure Firebase Admin credentials on the server, then redeploy the app." }, { status: 503 });

function isAdminCredentialError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code ?? "";
  return code.startsWith("app/")
    || code === "auth/internal-error"
    || code === "auth/insufficient-permission"
    || code === "firestore/unauthenticated"
    || code === "firestore/permission-denied"
    || /credential|could not load the default credentials/i.test(error.message);
}

export async function GET(req: Request) {
  try {
    const { uid } = await requireUser(req);
    return Response.json({ connected: Boolean(await getOpenRouterKey(uid)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_SERVICE_UNAVAILABLE") return unavailable();
    if (error instanceof Error && error.message === "UNAUTHENTICATED") return unauthorized();
    return Response.json({ error: "Could not read API key status." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  let stage = "authentication";
  try {
    const { uid } = await requireUser(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Enter a valid OpenRouter API key." }, { status: 400 });
    stage = "verification";
    const verification = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${parsed.data.key}` }, cache: "no-store",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(15000)]),
    });
    if (!verification.ok) return Response.json({ error: verification.status === 401 || verification.status === 403
      ? "OpenRouter rejected this API key." : "Could not verify your key. Try again shortly." }, { status: verification.status });
    stage = "storage";
    await saveOpenRouterKey(uid, parsed.data.key);
    return Response.json({ connected: true });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_SERVICE_UNAVAILABLE") return unavailable();
    if (error instanceof Error && error.message === "UNAUTHENTICATED") return unauthorized();
    console.error("[api/connection] save failed", { stage, name: error instanceof Error ? error.name : "UnknownError" });
    if (stage === "verification") return Response.json({ error: "The server could not reach OpenRouter to verify your key. Try again shortly." }, { status: 502 });
    if (stage === "storage" && isAdminCredentialError(error)) return storageUnavailable();
    return Response.json({ error: "Could not securely save the API key." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { uid } = await requireUser(req);
    await deleteOpenRouterKey(uid);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_SERVICE_UNAVAILABLE") return unavailable();
    if (error instanceof Error && error.message === "UNAUTHENTICATED") return unauthorized();
    return Response.json({ error: "Could not remove the API key." }, { status: 500 });
  }
}
