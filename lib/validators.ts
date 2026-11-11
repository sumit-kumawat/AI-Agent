import { z } from "zod";
import { AUTO_MODES } from "@/lib/model-ref";

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

/** An email address, or a plain username such as the env-seeded "admin". */
const loginId = z
  .string()
  .min(3)
  .max(254)
  .refine((value) => z.email().safeParse(value).success || /^[a-z0-9._-]+$/.test(value));

export const credentialsSchema = z.object({
  email: loginId,
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: bcryptSafePassword,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "Choose a password different from the current one.",
    path: ["newPassword"],
  });

const messagePartSchema = z.looseObject({
  type: z.string().max(50),
  text: z.string().max(MAX_MESSAGE_CHARS).optional(),
});

export const modelNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._\-/]*(:[a-z0-9._\-]+)?$/i, "Not a valid model name.");

export const providerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/);

export const chatRequestSchema = z.object({
  conversationId: z.uuid(),
  model: modelNameSchema.optional(),
  providerId: providerIdSchema.optional(),
  /** Auto selection mode, used when no model is named. */
  mode: z.enum(AUTO_MODES).optional(),
  /** The user edited an earlier message, so the stored thread is replaced from that point. */
  edit: z.boolean().optional(),
  /** Run Deep Research for the latest message instead of a normal reply. */
  research: z.boolean().optional(),
  /** DeepSeek-style web Search for this turn (lighter than Deep Research). */
  search: z.boolean().optional(),
  /** Ask a reasoning-capable model to think before answering. */
  deepThink: z.boolean().optional(),
  messages: z
    .array(
      z.looseObject({
        id: z.string().min(1).max(100),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(messagePartSchema).max(50),
        /** Client-sent details such as attached file ids. Kept so chat can bind uploads. */
        metadata: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(200),
});
