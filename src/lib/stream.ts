export async function readStream(
  response: Response,
  onText: (text: string) => void,
) {
  if (!response.body) throw new Error("No response stream received.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";
  let complete = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (done && buffer && !buffer.endsWith("\n")) buffer += "\n";
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          complete = true;
          break;
        }
        if (!data) continue;
        const chunk = JSON.parse(data);
        if (chunk.error)
          throw new Error(chunk.error.message || "Model stream failed.");
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          result += delta;
          onText(result);
        }
        if (chunk.choices?.[0]?.finish_reason === "error")
          throw new Error("The model stopped with an error.");
      }
      if (complete) { await reader.cancel(); break; }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (!complete)
    throw new Error("Response was interrupted. Partial text has been kept.");
  if (!result)
    throw new Error("The model returned no text. Try another model.");
  return result;
}
