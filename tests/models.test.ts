import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModels } from "../src/lib/models";
import { GET as models } from "../src/app/api/models/route";
import { GET as connection } from "../src/app/api/connection/route";
const model = { id: "test/chat", name: "Test Chat", context_length: 32000,
  architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
  pricing: { prompt: "0.000001", completion: "0.000002" } };
test("catalog includes text chat, excludes media output and batch models, converts pricing", () => {
  const result = parseModels({ data: [model,
    { ...model, id: "test/chat:batch" },
    { ...model, id: "test/image", architecture: { input_modalities: ["text"], output_modalities: ["text", "image"] } },
    { ...model, id: "test/router", pricing: { prompt: "-1", completion: "-1" } },
  ] });
  assert.equal(result.length, 2);
  assert.equal(result[0].inputPrice, 1);
  assert.equal(result[0].outputPrice, 2);
  assert.equal(result[1].inputPrice, null);
});
test("models route returns normalized catalog and handles provider failure", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ data: [model] });
    assert.equal((await (await models(new Request("http://localhost/api/models"))).json()).models[0].id, model.id);
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    assert.equal((await models(new Request("http://localhost/api/models"))).status, 502);
    globalThis.fetch = async () => Response.json({ unexpected: [] });
    assert.equal((await models(new Request("http://localhost/api/models"))).status, 502);
  } finally { globalThis.fetch = original; }
});
test("connection key status is private to authenticated users", async () => {
  assert.equal((await connection(new Request("http://localhost/api/connection"))).status, 401);
});
