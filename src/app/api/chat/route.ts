import { getOpenRouterKey, requireUser } from "@/lib/firebase-admin";
import { chatRequestSchema } from "@/lib/chat-schema";
import {
  decryptPayload,
  encryptPayload,
  encryptStreamChunk,
  getChatEncryptionKey,
  isEncryptedPayload,
} from "@/lib/crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

function createEncryptedStream(
  upstreamStream: ReadableStream<Uint8Array>,
  chatKey: string,
): ReadableStream<Uint8Array> {
  const reader = upstreamStream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          if (done && buffer && !buffer.endsWith("\n")) buffer += "\n";

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith("data:")) {
              const data = trimmed.slice(5).trim();
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }
              if (!data) continue;
              try {
                const chunkObj = JSON.parse(data);
                const encryptedChunk = await encryptStreamChunk(chunkObj, chatKey);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(encryptedChunk)}\n\n`),
                );
              } catch {
                controller.enqueue(encoder.encode(`${line}\n\n`));
              }
            } else {
              controller.enqueue(encoder.encode(`${line}\n`));
            }
          }

          if (done) {
            controller.close();
            break;
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

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

    let bodyData: unknown;
    try {
      bodyData = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const chatKey = getChatEncryptionKey(uid);
    let wasEncrypted = false;
    if (isEncryptedPayload(bodyData)) {
      wasEncrypted = true;
      try {
        bodyData = await decryptPayload(bodyData, chatKey);
      } catch {
        return Response.json(
          { error: "Decryption failed: could not decrypt request payload." },
          { status: 400 },
        );
      }
    }

    const parsed = chatRequestSchema.safeParse(bodyData);
    if (!parsed.success)
      return Response.json({ error: "Invalid chat request." }, { status: 400 });
    const openRouterPayload: Record<string, any> = { ...parsed.data };
    if (!openRouterPayload.reasoning) {
      // Default reasoning effort to "high" so models use think mode by default.
      openRouterPayload.reasoning = { effort: "high" };
    }

    const postToOpenRouter = async (payload: Record<string, any>) => {
      return fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "MyAdvisor",
        },
        body: JSON.stringify(payload),
        signal: req.signal,
      });
    };

    let upstream = await postToOpenRouter(openRouterPayload);

    // If the model has mandatory reasoning and rejects effort: "none", or doesn't support reasoning parameters,
    // seamlessly retry without the reasoning block so the request succeeds.
    if (upstream.status === 400 && openRouterPayload.reasoning) {
      const errClone = upstream.clone();
      const errJson = await errClone.json().catch(() => null);
      const errMsg = String(errJson?.error?.message || errJson?.error || "").toLowerCase();
      if (
        errMsg.includes("reasoning") ||
        errMsg.includes("thinking") ||
        errMsg.includes("mandatory") ||
        errMsg.includes("unsupported") ||
        errMsg.includes("effort")
      ) {
        delete openRouterPayload.reasoning;
        upstream = await postToOpenRouter(openRouterPayload);
      }
    }
    // If a model rejects max_tokens as exceeding its context or output limit, retry without max_tokens.
    if (upstream.status === 400 && openRouterPayload.max_tokens) {
      const errClone = upstream.clone();
      const errJson = await errClone.json().catch(() => null);
      const errMsg = String(errJson?.error?.message || errJson?.error || "").toLowerCase();
      if (
        errMsg.includes("max_tokens") ||
        errMsg.includes("maximum context length") ||
        errMsg.includes("context length") ||
        errMsg.includes("too large")
      ) {
        delete openRouterPayload.max_tokens;
        upstream = await postToOpenRouter(openRouterPayload);
      }
    }
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

    if (!parsed.data.stream) {
      const data = await upstream.json();
      if (wasEncrypted) {
        const encrypted = await encryptPayload(data, chatKey);
        return Response.json(encrypted, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-transform",
          },
        });
      }
      return Response.json(data);
    }

    if (wasEncrypted && upstream.body) {
      const encryptedStream = createEncryptedStream(upstream.body, chatKey);
      return new Response(encryptedStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
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
