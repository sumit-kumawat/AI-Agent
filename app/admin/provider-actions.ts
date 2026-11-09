"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, type AdminUser } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { checkProvider } from "@/lib/providers/health";
import {
  createCompatibleProvider,
  deleteProvider,
  getProvider,
  getRouting,
  ProviderError,
  publicProviders,
  saveProvider,
  setRouting,
  updateProviderModel,
  type ModelRef,
} from "@/lib/providers/store";
import { rateLimit } from "@/lib/rate-limit";
import { providerIdSchema } from "@/lib/validators";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(work: (admin: AdminUser) => Promise<T> | T): Promise<ActionResult<T>> {
  try {
    const admin = await adminAction();
    return { ok: true, ...(await work(admin)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

function fail(message: string): never {
  throw new Error(message);
}

const refSchema = z.object({ providerId: providerIdSchema, modelId: z.string().trim().min(1).max(200) }).nullable();

function refOf(value: unknown, label: string): ModelRef | null {
  const parsed = refSchema.safeParse(value);
  if (!parsed.success) fail(`Choose a valid ${label}, or none.`);
  return parsed.data;
}

function known(id: string) {
  return getProvider(id) ?? fail("That provider does not exist.");
}

export async function loadProviders() {
  return run(() => ({ providers: publicProviders(), routing: getRouting() }));
}

const saveSchema = z.object({
  id: providerIdSchema,
  name: z.string().trim().min(1).max(60).optional(),
  baseUrl: z.string().trim().max(300).nullable().optional(),
  enabled: z.boolean().optional(),
  apiKey: z.string().max(400).nullable().optional(),
});

export async function updateProvider(input: z.infer<typeof saveSchema>) {
  return run((admin) => {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
    known(parsed.data.id);
    try {
      saveProvider(parsed.data.id, {
        name: parsed.data.name,
        baseUrl: parsed.data.baseUrl,
        enabled: parsed.data.enabled,
        apiKey: parsed.data.apiKey,
      });
    } catch (error) {
      if (error instanceof ProviderError) fail(error.message);
      throw error;
    }
    audit(admin, "provider.update", { type: "provider", id: parsed.data.id }, {
      enabled: parsed.data.enabled,
      keyChanged: parsed.data.apiKey !== undefined,
    });
    revalidatePath("/admin/providers");
    revalidatePath("/chat");
    return {};
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  baseUrl: z.string().trim().min(1).max(300),
  apiKey: z.string().min(8).max(400),
});

export async function addCompatibleProvider(input: z.infer<typeof createSchema>) {
  return run((admin) => {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
    let created;
    try {
      created = createCompatibleProvider(parsed.data);
    } catch (error) {
      if (error instanceof ProviderError) fail(error.message);
      throw error;
    }
    audit(admin, "provider.create", { type: "provider", id: created.id }, { name: created.name });
    revalidatePath("/admin/providers");
    return { id: created.id };
  });
}

export async function removeProvider(id: string) {
  return run((admin) => {
    known(id);
    try {
      deleteProvider(id);
    } catch (error) {
      if (error instanceof ProviderError) fail(error.message);
      throw error;
    }
    audit(admin, "provider.delete", { type: "provider", id });
    revalidatePath("/admin/providers");
    revalidatePath("/chat");
    return {};
  });
}

export async function testProvider(id: string) {
  return run(async (admin) => {
    known(id);
    const limited = rateLimit(`provider:health:${admin.id}`, 20, 10 * 60 * 1000);
    if (!limited.ok) fail("Too many connection checks. Wait a few minutes.");
    const result = await checkProvider(id);
    audit(admin, "provider.health", { type: "provider", id }, { ok: result.ok });
    revalidatePath("/admin/providers");
    revalidatePath("/chat");
    if (!result.ok) fail(result.error);
    return { models: result.models };
  });
}

const modelSchema = z.object({
  providerId: providerIdSchema,
  modelId: z.string().trim().min(1).max(200),
  enabled: z.boolean().optional(),
  inputPerMillion: z.number().min(0).max(1000).nullable().optional(),
  outputPerMillion: z.number().min(0).max(1000).nullable().optional(),
});

export async function updateModel(input: z.infer<typeof modelSchema>) {
  return run((admin) => {
    const parsed = modelSchema.safeParse(input);
    if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Check the price and try again.");
    known(parsed.data.providerId);
    if (
      !updateProviderModel(parsed.data.providerId, parsed.data.modelId, {
        enabled: parsed.data.enabled,
        inputPerMillion: parsed.data.inputPerMillion,
        outputPerMillion: parsed.data.outputPerMillion,
      })
    ) {
      fail("That model is no longer listed. Run the connection check again.");
    }
    audit(admin, "provider.model", { type: "provider", id: parsed.data.providerId }, {
      model: parsed.data.modelId,
      enabled: parsed.data.enabled,
    });
    revalidatePath("/admin/providers");
    revalidatePath("/chat");
    return {};
  });
}

export async function updateRouting(input: { defaultModel: unknown; fallbackModel: unknown }) {
  return run((admin) => {
    const routing = {
      defaultModel: refOf(input.defaultModel, "default model"),
      fallbackModel: refOf(input.fallbackModel, "fallback model"),
    };
    setRouting(routing);
    audit(admin, "provider.routing", { type: "provider" }, {
      defaultModel: routing.defaultModel?.modelId ?? null,
      fallbackModel: routing.fallbackModel?.modelId ?? null,
    });
    revalidatePath("/admin/providers");
    revalidatePath("/chat");
    return {};
  });
}
