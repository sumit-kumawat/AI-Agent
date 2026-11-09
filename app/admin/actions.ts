"use server";

import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { killSession, listSessions, getAgent, updateAgent } from "@/lib/agents";
import { adminAction, assertCanManage, type AdminUser } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { adminCount, findUserById, superAdminCount } from "@/lib/db/queries";
import { isStaff, ROLES, type Role } from "@/lib/roles";
import { conversations, messages, modelConfig, users } from "@/lib/db/schema";
import { ACCESS_ACTION, activeContentGrant } from "@/lib/content-access";
import { parseKeywords } from "@/lib/moderation";
import { getPlans, savePlans } from "@/lib/plans/config";
import { PLAN_IDS } from "@/lib/plans/types";
import { getSettings, updateSettings } from "@/lib/settings";
import { modelNameSchema } from "@/lib/validators";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(
  work: (admin: AdminUser) => T | Promise<T>,
): Promise<ActionResult<T>> {
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

const userId = z.string().uuid();

function targetUser(id: unknown) {
  const parsed = userId.safeParse(id);
  if (!parsed.success) fail("Unknown user.");
  return findUserById(parsed.data) ?? fail("That user no longer exists.");
}

function endSessionsFor(id: string) {
  for (const session of listSessions()) {
    if (session.userId === id) killSession(session.id);
  }
}

/** Granting or removing admin rights is reserved for super admins. */
export async function setUserRole(id: string, role: Role) {
  return run((admin) => {
    if (admin.role !== "superadmin") fail("Only a Super Administrator can change roles.");
    const user = targetUser(id);
    if (!ROLES.includes(role)) fail("Unknown role.");
    if (user.role === role) return {};
    if (user.id === admin.id) fail("You cannot change your own role.");
    if (user.role === "superadmin" && superAdminCount() <= 1) fail("At least one Super Administrator must remain.");
    db.update(users).set({ role }).where(eq(users.id, user.id)).run();
    audit(admin, "user.role", { type: "user", id: user.id }, { email: user.email, from: user.role, to: role });
    revalidatePath("/admin/users");
    return {};
  });
}

export async function resetUserPassword(id: string) {
  return run(async (admin) => {
    const user = targetUser(id);
    assertCanManage(admin, user);
    const password = randomBytes(12).toString("base64url");
    db.update(users)
      .set({
        passwordHash: await hash(password, 12),
        sessionVersion: sql`${users.sessionVersion} + 1`,
        firstLogin: true,
      })
      .where(eq(users.id, user.id))
      .run();
    endSessionsFor(user.id);
    audit(admin, "user.password_reset", { type: "user", id: user.id }, { email: user.email });
    return { password };
  });
}

export async function setUserSuspended(id: string, suspended: boolean) {
  return run((admin) => {
    const user = targetUser(id);
    if (user.id === admin.id) fail("You cannot suspend yourself.");
    assertCanManage(admin, user);
    if (suspended && user.role === "superadmin" && superAdminCount() <= 1) {
      fail("At least one Super Administrator must remain.");
    }
    if (suspended && isStaff(user.role) && adminCount() <= 1) fail("At least one admin must remain.");
    db.update(users)
      .set({
        suspended,
        ...(suspended ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
      })
      .where(eq(users.id, user.id))
      .run();
    if (suspended) endSessionsFor(user.id);
    audit(admin, suspended ? "user.suspend" : "user.reactivate", { type: "user", id: user.id }, { email: user.email });
    revalidatePath("/admin/users");
    return {};
  });
}

const tokenLimit = z.number().int().min(0).max(100_000_000_000).nullable();
const userPlanSchema = z.object({
  plan: z.enum(PLAN_IDS),
  /** null uses the plan's limit; 0 is unlimited. */
  overrides: z.object({ daily: tokenLimit, weekly: tokenLimit, monthly: tokenLimit }),
});

export async function updateUserPlan(id: string, input: z.input<typeof userPlanSchema>) {
  return run((admin) => {
    const user = targetUser(id);
    assertCanManage(admin, user);
    const parsed = userPlanSchema.safeParse(input);
    if (!parsed.success) fail("Pick a plan, and enter limits of 0 (unlimited) or more, or leave them empty to use the plan's.");
    const { plan, overrides } = parsed.data;
    const kept = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== null));
    const limitOverrides = Object.keys(kept).length ? JSON.stringify(kept) : null;
    db.update(users)
      .set({ plan, limitOverrides, ...(plan !== user.plan ? { planStartedAt: Date.now() } : {}) })
      .where(eq(users.id, user.id))
      .run();
    audit(admin, "user.plan", { type: "user", id: user.id }, {
      email: user.email,
      from: { plan: user.plan, overrides: user.limitOverrides ? JSON.parse(user.limitOverrides) : null },
      to: { plan, overrides: limitOverrides ? kept : null },
    });
    revalidatePath("/admin/users");
    return {};
  });
}

export async function savePlanConfig(input: unknown) {
  return run((admin) => {
    const before = getPlans();
    const result = savePlans(input);
    if (!result.ok) fail(result.error);
    audit(admin, "plans.update", { type: "settings", id: "plans" }, { from: before, to: result.plans });
    revalidatePath("/admin/plans");
    revalidatePath("/plans");
    return {};
  });
}

const agentSchema = z.object({
  enabled: z.boolean().optional(),
  maxConcurrency: z.number().int().min(1).max(64).optional(),
});

export async function updateAgentConfig(id: string, input: z.input<typeof agentSchema>) {
  return run((admin) => {
    const agent = getAgent(id) ?? fail("Unknown agent.");
    const parsed = agentSchema.safeParse(input);
    if (!parsed.success) fail("Concurrency must be between 1 and 64.");
    updateAgent(agent.id, parsed.data);
    audit(admin, "agent.update", { type: "agent", id: agent.id }, {
      from: { enabled: agent.enabled, maxConcurrency: agent.maxConcurrency },
      to: parsed.data,
    });
    if (parsed.data.enabled === false) {
      for (const session of listSessions()) {
        if (session.agentId === agent.id) killSession(session.id);
      }
    }
    revalidatePath("/admin/agents");
    return {};
  });
}

export async function killAgentSession(sessionId: string) {
  return run((admin) => {
    const session = listSessions().find((entry) => entry.id === sessionId);
    if (!session || !killSession(sessionId)) fail("That session already ended.");
    audit(admin, "session.kill", { type: "session", id: sessionId }, {
      agent: session.agentId,
      user: session.userEmail,
      model: session.model,
    });
    revalidatePath("/admin/agents");
    return {};
  });
}

export async function setModelEnabled(name: string, enabled: boolean) {
  return run((admin) => {
    const parsed = modelNameSchema.safeParse(name);
    if (!parsed.success) fail("Invalid model name.");
    db.insert(modelConfig)
      .values({ name: parsed.data, enabled, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: modelConfig.name, set: { enabled, updatedAt: Date.now() } })
      .run();
    audit(admin, enabled ? "model.enable" : "model.disable", { type: "model", id: parsed.data });
    revalidatePath("/admin/agents");
    return {};
  });
}

const settingsSchema = z.object({
  chatRateLimitPerMinute: z.number().int().min(1).max(1000),
  registrationEnabled: z.boolean(),
  moderationKeywords: z.string().max(50_000),
});

export async function saveSystemSettings(input: z.input<typeof settingsSchema>) {
  return run((admin) => {
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) fail("The rate limit must be between 1 and 1000 requests per minute.");
    const before = getSettings();
    const next = updateSettings({
      chatRateLimitPerMinute: parsed.data.chatRateLimitPerMinute,
      registrationEnabled: parsed.data.registrationEnabled,
      moderationKeywords: parseKeywords(parsed.data.moderationKeywords),
    });
    audit(admin, "settings.update", { type: "settings" }, {
      chatRateLimitPerMinute: { from: before.chatRateLimitPerMinute, to: next.chatRateLimitPerMinute },
      registrationEnabled: { from: before.registrationEnabled, to: next.registrationEnabled },
      moderationKeywords: { from: before.moderationKeywords.length, to: next.moderationKeywords.length },
    });
    revalidatePath("/admin/settings");
    return { keywords: next.moderationKeywords.length };
  });
}

function findMessage(id: string, admin: AdminUser) {
  const message =
    db
      .select({ id: messages.id, conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.id, id))
      .get() ?? fail("That message no longer exists.");
  if (!activeContentGrant(admin.id, message.conversationId)) {
    fail("Your access to this conversation has expired. Request access again.");
  }
  return message;
}

const accessReason = z.string().trim().min(10, "Give a reason of at least 10 characters.").max(500);

/** Records why an admin needs to read a conversation; the audit entry grants access for 30 minutes. */
export async function requestConversationAccess(id: string, reason: string) {
  return run((admin) => {
    const parsed = accessReason.safeParse(reason);
    if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Give a reason.");
    const conversation =
      db
        .select({ id: conversations.id, userId: conversations.userId })
        .from(conversations)
        .where(eq(conversations.id, String(id)))
        .get() ?? fail("That conversation no longer exists.");
    audit(admin, ACCESS_ACTION, { type: "conversation", id: conversation.id }, {
      owner: conversation.userId,
      reason: parsed.data,
    });
    revalidatePath(`/admin/conversations/${conversation.id}`);
    return {};
  });
}

export async function flagMessage(id: string, flagged: boolean, reason: string) {
  return run((admin) => {
    const message = findMessage(id, admin);
    const note = reason.trim().slice(0, 500) || null;
    db.update(messages)
      .set(
        flagged
          ? { flagged: true, flagReason: note, flaggedBy: admin.email, flaggedAt: Date.now() }
          : { flagged: false, flagReason: null, flaggedBy: null, flaggedAt: null },
      )
      .where(eq(messages.id, message.id))
      .run();
    audit(admin, flagged ? "message.flag" : "message.unflag", { type: "message", id: message.id }, {
      conversation: message.conversationId,
      reason: note,
    });
    revalidatePath(`/admin/conversations/${message.conversationId}`);
    return {};
  });
}

export async function deleteMessage(id: string) {
  return run((admin) => {
    const message = findMessage(id, admin);
    db.delete(messages)
      .where(and(eq(messages.id, message.id), eq(messages.conversationId, message.conversationId)))
      .run();
    audit(admin, "message.delete", { type: "message", id: message.id }, {
      conversation: message.conversationId,
    });
    revalidatePath(`/admin/conversations/${message.conversationId}`);
    return {};
  });
}
