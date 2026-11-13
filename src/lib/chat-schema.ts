import { z } from "zod";

export const contentPartSchema = z.union([
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

export const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([z.string(), z.array(contentPartSchema)]),
});

export const reasoningSchema = z.object({
  effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
  max_tokens: z.number().int().min(0).max(32768).optional(),
  exclude: z.boolean().optional(),
});

export const chatRequestSchema = z.object({
  model: z.string().min(1).max(150),
  messages: z.array(messageSchema).min(1).max(80),
  stream: z.boolean().default(true),
  max_tokens: z.number().int().min(1).max(131072).optional(),
  plugins: z.array(z.any()).optional(),
  reasoning: reasoningSchema.optional(),
});
