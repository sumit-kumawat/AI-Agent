import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creativeSchedules, creativeWorkflows } from "@/lib/db/schema";

function parseJson(raw: string) {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function listSchedulesForUser(userId: string) {
  return db
    .select()
    .from(creativeSchedules)
    .where(eq(creativeSchedules.userId, userId))
    .orderBy(desc(creativeSchedules.updatedAt))
    .all()
    .map((row) => ({
      ...row,
      payload: parseJson(row.payload),
    }));
}

export function createSchedule(input: {
  userId: string;
  name: string;
  cron: string;
  payload?: Record<string, unknown>;
  enabled?: boolean;
}) {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.insert(creativeSchedules)
    .values({
      id,
      userId: input.userId,
      name: input.name.trim() || "Untitled schedule",
      cron: input.cron.trim() || "0 9 * * *",
      enabled: input.enabled === true,
      payload: JSON.stringify(input.payload ?? {}),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return listSchedulesForUser(input.userId).find((row) => row.id === id)!;
}

export function deleteSchedule(id: string, userId: string) {
  const result = db
    .delete(creativeSchedules)
    .where(and(eq(creativeSchedules.id, id), eq(creativeSchedules.userId, userId)))
    .run();
  return result.changes > 0;
}

export function listWorkflowsForUser(userId: string) {
  return db
    .select()
    .from(creativeWorkflows)
    .where(eq(creativeWorkflows.userId, userId))
    .orderBy(desc(creativeWorkflows.updatedAt))
    .all()
    .map((row) => ({
      ...row,
      graph: parseJson(row.graph),
    }));
}

export function createWorkflow(input: { userId: string; name: string; graph?: Record<string, unknown> }) {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.insert(creativeWorkflows)
    .values({
      id,
      userId: input.userId,
      name: input.name.trim() || "Untitled workflow",
      graph: JSON.stringify(input.graph ?? { nodes: [], edges: [] }),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return listWorkflowsForUser(input.userId).find((row) => row.id === id)!;
}

export function deleteWorkflow(id: string, userId: string) {
  const result = db
    .delete(creativeWorkflows)
    .where(and(eq(creativeWorkflows.id, id), eq(creativeWorkflows.userId, userId)))
    .run();
  return result.changes > 0;
}
