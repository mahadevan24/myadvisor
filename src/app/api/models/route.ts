import { parseModels } from "../../../lib/models";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/models", {
      cache: "no-store", signal: AbortSignal.any([req.signal, AbortSignal.timeout(15000)]),
    });
    if (!upstream.ok) throw new Error("Catalog unavailable");
    return Response.json({ models: parseModels(await upstream.json()) });
  } catch {
    return Response.json({ error: "Could not load OpenRouter models. Retry or enter a model ID in bot settings." }, { status: 502 });
  }
}
