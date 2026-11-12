import { z } from "zod";
import { getOpenRouterKey, requireUser } from "@/lib/firebase-admin";
export const runtime = "nodejs";
export const maxDuration = 120;
const contentPartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z.string(),
    }),
  }),
  z.object({
    type: z.literal("file"),
    file: z.object({
      filename: z.string().optional(),
      file_data: z.string().optional(),
      file_url: z.string().optional(),
    }),
  }),
]);

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([z.string(), z.array(contentPartSchema)]),
});

const schema = z.object({
  model: z.string().min(1).max(150),
  messages: z.array(messageSchema).min(1).max(80),
  stream: z.boolean().default(true),
  max_tokens: z.number().int().min(64).max(4096).default(2048),
  plugins: z.array(z.any()).optional(),
});
export async function POST(req: Request) {
  let uid: string;
  try {
    ({ uid } = await requireUser(req));
  } catch {
    return Response.json(
      { error: "Sign in to continue." },
      { status: 401 },
    );
  }
  const key = await getOpenRouterKey(uid);
  if (!key)
    return Response.json(
      { error: "Save your OpenRouter API key in Settings." },
      { status: 403 },
    );
  const MAX_REQUEST_BYTES = 25 * 1024 * 1024;
  if (Number(req.headers.get("content-length") || 0) > MAX_REQUEST_BYTES)
    return Response.json({ error: "Request too large." }, { status: 413 });
  try {
    const raw = await req.text();
    if (raw.length > MAX_REQUEST_BYTES)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return Response.json({ error: "Invalid chat request." }, { status: 400 });
    const upstream = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "MyAdvisor",
        },
        body: JSON.stringify(parsed.data),
        signal: req.signal,
      },
    );
    if (!upstream.ok) {
      return Response.json(
        {
          error:
            upstream.status === 401
              ? "Your OpenRouter key is invalid. Update it in Settings."
              : upstream.status === 402
                ? "Your OpenRouter account needs credits."
                : upstream.status === 429
                  ? "Model rate limit reached. Wait a moment or choose another model."
                  : `OpenRouter could not complete this request (${upstream.status}). Check your model ID and try again.`,
        },
        { status: upstream.status },
      );
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": parsed.data.stream
          ? "text/event-stream"
          : "application/json",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof SyntaxError)
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    return Response.json(
      { error: "Connection interrupted. Please try again." },
      { status: 502 },
    );
  }
}
