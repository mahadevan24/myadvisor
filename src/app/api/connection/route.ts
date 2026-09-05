export const runtime = "nodejs";
export async function GET(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length < 15)
    return Response.json({ error: "Enter a valid OpenRouter API key." }, { status: 401 });
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: authorization }, cache: "no-store",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(15000)]),
    });
    if (!res.ok) return Response.json({ error: res.status === 401 || res.status === 403
      ? "OpenRouter rejected this API key. Check it in Settings."
      : "Could not verify your key. Try again shortly." }, { status: res.status });
    const data = await res.json();
    if (!data.data) throw new Error("Invalid response");
    return Response.json({ connected: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not reach OpenRouter to verify your key." }, { status: 502 });
  }
}
