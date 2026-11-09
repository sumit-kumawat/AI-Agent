import { z } from "zod";

export const THEMES = ["system", "light", "dark"] as const;
export const ACCENTS = ["teal", "blue", "violet", "rose", "amber", "slate"] as const;
export const FONT_SIZES = ["small", "medium", "large"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;
export const PERSONALITIES = [
  "default",
  "concise",
  "friendly",
  "professional",
  "candid",
  "teacher",
] as const;
export const RESPONSE_LENGTHS = ["auto", "short", "detailed"] as const;

export const PERSONALITY_LABELS: Record<(typeof PERSONALITIES)[number], string> = {
  default: "Default",
  concise: "Concise",
  friendly: "Friendly",
  professional: "Professional",
  candid: "Candid",
  teacher: "Teacher",
};

const text = (max: number) => z.string().trim().max(max).catch("");

/**
 * Every field has a default so older stored documents, and new users with no
 * row yet, always parse.
 */
export const preferencesSchema = z.object({
  theme: z.enum(THEMES).catch("system"),
  accent: z.enum(ACCENTS).catch("teal"),
  fontSize: z.enum(FONT_SIZES).catch("medium"),
  density: z.enum(DENSITIES).catch("comfortable"),
  language: text(40),
  nickname: text(60),
  occupation: text(120),
  aboutMe: text(1500),
  instructions: text(1500),
  personality: z.enum(PERSONALITIES).catch("default"),
  responseLength: z.enum(RESPONSE_LENGTHS).catch("auto"),
  customInstructionsEnabled: z.boolean().catch(true),
  memoryEnabled: z.boolean().catch(true),
  referenceHistory: z.boolean().catch(true),
  sendWithEnter: z.boolean().catch(true),
  /** The user agreed that cloud models may receive their chats, instructions and memories. */
  cloudModels: z.boolean().catch(false),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const preferencesPatchSchema = z
  .object({
    theme: z.enum(THEMES),
    accent: z.enum(ACCENTS),
    fontSize: z.enum(FONT_SIZES),
    density: z.enum(DENSITIES),
    language: z.string().trim().max(40),
    nickname: z.string().trim().max(60),
    occupation: z.string().trim().max(120),
    aboutMe: z.string().trim().max(1500),
    instructions: z.string().trim().max(1500),
    personality: z.enum(PERSONALITIES),
    responseLength: z.enum(RESPONSE_LENGTHS),
    customInstructionsEnabled: z.boolean(),
    memoryEnabled: z.boolean(),
    referenceHistory: z.boolean(),
    sendWithEnter: z.boolean(),
    cloudModels: z.boolean(),
  })
  .partial()
  .strict();

export const THEME_COOKIE = "cx-appearance";

/** Appearance travels in a cookie so the first paint already has the right theme. */
export function appearanceCookie(prefs: Pick<Preferences, "theme" | "accent" | "fontSize" | "density">) {
  return [prefs.theme, prefs.accent, prefs.fontSize, prefs.density].join(".");
}

export function parseAppearanceCookie(value: string | undefined) {
  const [theme, accent, fontSize, density] = (value ?? "").split(".");
  return {
    theme: (THEMES as readonly string[]).includes(theme ?? "") ? (theme as Preferences["theme"]) : "system",
    accent: (ACCENTS as readonly string[]).includes(accent ?? "") ? (accent as Preferences["accent"]) : "teal",
    fontSize: (FONT_SIZES as readonly string[]).includes(fontSize ?? "")
      ? (fontSize as Preferences["fontSize"])
      : "medium",
    density: (DENSITIES as readonly string[]).includes(density ?? "")
      ? (density as Preferences["density"])
      : "comfortable",
  };
}
