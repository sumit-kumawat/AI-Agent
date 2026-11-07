import { z } from "zod";

export const MAX_MESSAGE_CHARS = 32_000;

const bcryptSafePassword = z
  .string()
  .min(8, "Use at least 8 characters.")
  .refine((value) => new TextEncoder().encode(value).length <= 72, {
    message: "Use at most 72 bytes.",
  });

export const registerSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.email().max(254),
  password: bcryptSafePassword,
});

export const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

const messagePartSchema = z.looseObject({
  type: z.string().max(50),
  text: z.string().max(MAX_MESSAGE_CHARS).optional(),
});

export const chatRequestSchema = z.object({
  conversationId: z.uuid(),
  messages: z
    .array(
      z.looseObject({
        id: z.string().min(1).max(100),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(messagePartSchema).max(50),
      }),
    )
    .min(1)
    .max(200),
});
