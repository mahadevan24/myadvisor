import { z } from "zod";

export const catalogSchema = z.object({
  data: z.array(z.object({
    id: z.string(), name: z.string(), context_length: z.number().nullish(),
    architecture: z.object({ input_modalities: z.array(z.string()), output_modalities: z.array(z.string()) }),
    pricing: z.object({ prompt: z.string(), completion: z.string() }),
  })),
});
export type Model = { id: string; name: string; context: number; inputPrice: number | null; outputPrice: number | null };
export function parseModels(raw: unknown): Model[] {
  const price = (s: string) => Number.isFinite(Number(s)) && Number(s) >= 0 ? Number(s) * 1e6 : null;
  return catalogSchema.parse(raw).data
    .filter(m => m.architecture.input_modalities.includes("text") && m.architecture.output_modalities.length === 1 && m.architecture.output_modalities[0] === "text" && !m.id.endsWith(":batch"))
    .map(m => ({ id: m.id, name: m.name, context: m.context_length || 0, inputPrice: price(m.pricing.prompt), outputPrice: price(m.pricing.completion) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
