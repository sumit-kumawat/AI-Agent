import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import type { Currency } from "@/lib/billing/money";
import { db } from "@/lib/db";
import { projects, projectUpdates, proposals, users } from "@/lib/db/schema";

export const PROJECT_TYPES = {
  custom_hosting: "Custom hosting",
  cloud_infrastructure: "Cloud infrastructure",
  vps_config: "VPS configuration",
  dedicated_config: "Dedicated server configuration",
  enterprise: "Enterprise requirement",
  domain: "Domain registration or transfer",
  professional_services: "Migration or setup work",
  other: "Other",
} as const;
export type ProjectType = keyof typeof PROJECT_TYPES;

export const PROJECT_STATUSES = {
  submitted: "Submitted",
  under_review: "Under review",
  proposal_sent: "Proposal sent",
  accepted: "Accepted",
  in_progress: "In progress",
  onboarding: "Onboarding",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
} as const;
export type ProjectStatus = keyof typeof PROJECT_STATUSES;

/** Delivery stages shown as a tracker; declined and cancelled sit outside it. */
export const PROJECT_FLOW: ProjectStatus[] = [
  "submitted",
  "under_review",
  "proposal_sent",
  "accepted",
  "in_progress",
  "onboarding",
  "completed",
];

export const CLIENT_CANCELLABLE: ProjectStatus[] = ["submitted", "under_review", "proposal_sent"];
export const CLOSED: ProjectStatus[] = ["completed", "declined", "cancelled"];

export const BUDGETS = {
  "": "Not specified",
  under_500: "Under 500 per month",
  "500_2000": "500 to 2,000 per month",
  "2000_10000": "2,000 to 10,000 per month",
  over_10000: "Over 10,000 per month",
  one_off: "One-off project budget",
} as const;

export const TIMELINES = {
  "": "Not specified",
  asap: "As soon as possible",
  "1_month": "Within 1 month",
  "1_3_months": "Within 1 to 3 months",
  over_3_months: "More than 3 months",
} as const;

export class ProjectError extends Error {}

function fail(message: string): never {
  throw new ProjectError(message);
}

export type Project = typeof projects.$inferSelect;

function newReference() {
  const year = new Date().getUTCFullYear();
  return `PRJ-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function createProject(
  userId: string,
  input: { type: ProjectType; title: string; requirements: string; budget: string; timeline: string },
) {
  const now = Date.now();
  const id = randomUUID();
  db.transaction((tx) => {
    tx.insert(projects)
      .values({ id, reference: newReference(), userId, ...input, status: "submitted", createdAt: now, updatedAt: now })
      .run();
    tx.insert(projectUpdates)
      .values({ projectId: id, authorType: "system", status: "submitted", message: "Request received.", createdAt: now })
      .run();
  });
  return id;
}

export function listProjectsForUser(userId: string) {
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt)).all();
}

export function getProject(id: string) {
  return db.select().from(projects).where(eq(projects.id, id)).get();
}

export function getProjectForUser(id: string, userId: string) {
  const project = getProject(id);
  return project && project.userId === userId ? project : null;
}

export function projectTimeline(projectId: string, { includeInternal }: { includeInternal: boolean }) {
  const rows = db
    .select({ update: projectUpdates, authorName: users.name })
    .from(projectUpdates)
    .leftJoin(users, eq(users.id, projectUpdates.authorId))
    .where(
      includeInternal
        ? eq(projectUpdates.projectId, projectId)
        : and(eq(projectUpdates.projectId, projectId), eq(projectUpdates.visibleToClient, true)),
    )
    .orderBy(projectUpdates.createdAt, projectUpdates.id)
    .all();
  return rows.map((row) => ({ ...row.update, authorName: row.authorName }));
}

export function projectProposals(projectId: string) {
  return db.select().from(proposals).where(eq(proposals.projectId, projectId)).orderBy(desc(proposals.createdAt)).all();
}

export function addProjectMessage(
  projectId: string,
  author: { type: "client" | "staff"; id: string },
  message: string,
  options: { visibleToClient?: boolean; status?: ProjectStatus | null } = {},
) {
  const project = getProject(projectId) ?? fail("That project no longer exists.");
  if (author.type === "client" && CLOSED.includes(project.status as ProjectStatus)) {
    fail("This project is closed. Start a new request instead.");
  }
  const now = Date.now();
  db.transaction((tx) => {
    tx.insert(projectUpdates)
      .values({
        projectId,
        authorType: author.type,
        authorId: author.id,
        status: options.status ?? null,
        message,
        visibleToClient: options.visibleToClient ?? true,
        createdAt: now,
      })
      .run();
    tx.update(projects)
      .set({ status: options.status ?? project.status, updatedAt: now })
      .where(eq(projects.id, projectId))
      .run();
  });
}

export function cancelProjectByClient(projectId: string, userId: string) {
  const project = getProjectForUser(projectId, userId) ?? fail("That project does not exist.");
  if (!CLIENT_CANCELLABLE.includes(project.status as ProjectStatus)) {
    fail("This project can no longer be cancelled online. Send us a message instead.");
  }
  db.update(proposals)
    .set({ status: "withdrawn" })
    .where(and(eq(proposals.projectId, projectId), eq(proposals.status, "sent")))
    .run();
  addProjectMessage(projectId, { type: "client", id: userId }, "Request cancelled by the customer.", { status: "cancelled" });
}

export function sendProposal(
  projectId: string,
  staffId: string,
  input: { summary: string; currency: Currency; amountMinor: number },
) {
  const project = getProject(projectId) ?? fail("That project no longer exists.");
  if (CLOSED.includes(project.status as ProjectStatus)) fail("This project is closed.");
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(proposals)
      .set({ status: "withdrawn" })
      .where(and(eq(proposals.projectId, projectId), eq(proposals.status, "sent")))
      .run();
    tx.insert(proposals).values({ id: randomUUID(), projectId, ...input, status: "sent", createdAt: now }).run();
  });
  addProjectMessage(projectId, { type: "staff", id: staffId }, `Proposal sent: ${input.summary}`, {
    status: "proposal_sent",
  });
}

export function declineProposal(proposalId: string, userId: string) {
  const proposal = db.select().from(proposals).where(eq(proposals.id, proposalId)).get();
  const project = proposal ? getProjectForUser(proposal.projectId, userId) : null;
  if (!proposal || !project) fail("That proposal does not exist.");
  if (proposal.status !== "sent") fail("That proposal is no longer open.");
  db.update(proposals).set({ status: "declined", respondedAt: Date.now() }).where(eq(proposals.id, proposalId)).run();
  addProjectMessage(project.id, { type: "client", id: userId }, "Proposal declined.", { status: "under_review" });
}

export function adminProjects({ status, q, page, pageSize }: { status: string; q: string; page: number; pageSize: number }) {
  const filters = [];
  if (status === "open") filters.push(sql`${projects.status} NOT IN ('completed','declined','cancelled')`);
  else if (status in PROJECT_STATUSES) filters.push(eq(projects.status, status));
  if (q) filters.push(or(like(projects.reference, `%${q}%`), like(projects.title, `%${q}%`), like(users.email, `%${q}%`)));
  const where = filters.length ? and(...filters) : undefined;
  const rows = db
    .select({ project: projects, email: users.email, name: users.name })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.userId))
    .where(where)
    .orderBy(desc(projects.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  const total =
    db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .innerJoin(users, eq(users.id, projects.userId))
      .where(where)
      .get()?.count ?? 0;
  return { rows, total };
}

export function openProjectCount() {
  return (
    db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(sql`${projects.status} NOT IN ('completed','declined','cancelled')`)
      .get()?.count ?? 0
  );
}

export function projectLabel(status: string) {
  return PROJECT_STATUSES[status as ProjectStatus] ?? status.replaceAll("_", " ");
}
