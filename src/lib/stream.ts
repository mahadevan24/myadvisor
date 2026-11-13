import {
  isEncryptedStreamChunk,
  decryptStreamChunk,
  getFastStreamKey,
} from "./crypto";

export async function readStream(
  response: Response,
  onText: (text: string) => void,
  onReasoning?: (reasoning: string) => void,
  encryptionKey?: string,
) {
  if (!response.body) throw new Error("No response stream received.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let streamCryptoKey: CryptoKey | null = null;
  let buffer = "";
  let result = "";
  let reasoning = "";
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
        let chunk = JSON.parse(data);
        if (isEncryptedStreamChunk(chunk) && encryptionKey) {
          if (!streamCryptoKey) {
            streamCryptoKey = await getFastStreamKey(encryptionKey);
          }
          chunk = await decryptStreamChunk(chunk, streamCryptoKey);
        }
        if (chunk.error)
          throw new Error(chunk.error.message || "Model stream failed.");
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        const reasoningDelta =
          delta?.reasoning || delta?.reasoning_content || delta?.thought;
        if (reasoningDelta && onReasoning) {
          reasoning += reasoningDelta;
          onReasoning(reasoning);
        }
        const contentDelta = delta?.content ?? delta?.text;
        if (contentDelta) {
          result += contentDelta;
          onText(result);
        }
        if (choice?.finish_reason === "error")
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
  if (!result && !reasoning)
    throw new Error("The model returned no text. Try another model.");
  return result;
}
