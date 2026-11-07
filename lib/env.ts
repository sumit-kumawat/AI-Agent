import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters."),
  AUTH_URL: z.url().optional(),
  OLLAMA_BASE_URL: z.url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen2.5-coder:14b"),
  DATA_DIR: z.string().min(1).optional(),
  ADMIN_EMAILS: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    parsed.data.AUTH_SECRET.startsWith("replace-with")
  ) {
    throw new Error("AUTH_SECRET is still the placeholder from .env.example.");
  }
  return parsed.data;
}

export const env = load();
