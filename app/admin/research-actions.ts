"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, type AdminUser } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { publicResearchConfig, updateResearchConfig } from "@/lib/research/config";
import { clearSourceStatuses, sourceStatuses } from "@/lib/research/health";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(work: (admin: AdminUser) => Promise<T> | T): Promise<ActionResult<T>> {
  try {
    const admin = await adminAction();
    return { ok: true, ...(await work(admin)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

const keySchema = z.string().trim().min(8, "That key looks too short.").max(500).optional().nullable();

const schema = z.object({
  wikipedia: z.object({ enabled: z.boolean(), language: z.string().trim().regex(/^[a-z]{2,3}(-[a-z]+)?$/, "Use a Wikipedia language code such as en or de.") }),
  searxng: z.object({
    enabled: z.boolean(),
    baseUrl: z
      .string()
      .trim()
      .max(300)
      .refine((value) => value === "" || /^https?:\/\/[^\s]+$/.test(value), "The SearXNG address must start with http:// or https://.")
      .transform((value) => value || null),
  }),
  tavily: z.object({ enabled: z.boolean(), key: keySchema }),
  brave: z.object({ enabled: z.boolean(), key: keySchema }),
  maxSources: z.number().int().min(3).max(15),
  linkReading: z.boolean(),
});

export async function saveResearchConfig(input: z.input<typeof schema>) {
  return run((admin) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form.");
    const data = parsed.data;
    if (data.searxng.enabled && !data.searxng.baseUrl) throw new Error("Enter the SearXNG address or turn it off.");
    const current = publicResearchConfig();
    if (data.tavily.enabled && !data.tavily.key && !current.tavily.keyHint) {
      throw new Error("Enter a Tavily API key or turn Tavily off.");
    }
    if (data.brave.enabled && !data.brave.key && !current.brave.keyHint) {
      throw new Error("Enter a Brave Search API key or turn Brave off.");
    }
    const next = updateResearchConfig({
      wikipedia: data.wikipedia,
      searxng: data.searxng,
      tavily: { enabled: data.tavily.enabled, key: data.tavily.key || undefined },
      brave: { enabled: data.brave.enabled, key: data.brave.key || undefined },
      maxSources: data.maxSources,
      linkReading: data.linkReading,
    });
    clearSourceStatuses();
    audit(admin, "research.update", { type: "settings", id: "research" }, {
      wikipedia: data.wikipedia.enabled,
      searxng: data.searxng.enabled ? data.searxng.baseUrl : false,
      tavily: data.tavily.enabled,
      brave: data.brave.enabled,
      keysChanged: [data.tavily.key ? "tavily" : null, data.brave.key ? "brave" : null].filter(Boolean),
      maxSources: data.maxSources,
      linkReading: data.linkReading,
    });
    revalidatePath("/admin/research");
    return { config: next };
  });
}

export async function removeResearchKey(id: "tavily" | "brave") {
  return run((admin) => {
    if (id !== "tavily" && id !== "brave") throw new Error("Unknown source.");
    const config = updateResearchConfig({ [id]: { enabled: false, key: null } });
    clearSourceStatuses();
    audit(admin, "research.key.remove", { type: "settings", id: `research.${id}` });
    revalidatePath("/admin/research");
    return { config };
  });
}

export async function testResearchSources() {
  return run(async (admin) => {
    const limited = rateLimit(`research:test:${admin.id}`, 20, 10 * 60 * 1000);
    if (!limited.ok) throw new Error("Too many tests. Wait a few minutes.");
    return { statuses: await sourceStatuses(true) };
  });
}
