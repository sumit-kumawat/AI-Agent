"use server";

import { z } from "zod";
import type { FormResult } from "@/components/action-form";
import { CURRENCIES, CYCLES } from "@/lib/billing/money";
import {
  acceptProposal,
  BillingError,
  getBillingProfile,
  placeOrder,
  requestCancellation,
  saveBillingProfile,
} from "@/lib/billing/store";
import { customerAction } from "@/lib/customer";
import {
  addProjectMessage,
  BUDGETS,
  cancelProjectByClient,
  createProject,
  declineProposal,
  getProjectForUser,
  PROJECT_TYPES,
  ProjectError,
  TIMELINES,
} from "@/lib/projects";
import { rateLimit } from "@/lib/rate-limit";

async function run(work: (user: { id: string }) => FormResult | Promise<FormResult>): Promise<FormResult> {
  try {
    return await work(await customerAction());
  } catch (error) {
    if (error instanceof BillingError || error instanceof ProjectError || error instanceof z.ZodError) {
      return { ok: false, error: error instanceof z.ZodError ? (error.issues[0]?.message ?? "Check the form.") : error.message };
    }
    if (error instanceof Error && error.message === "Sign in again to continue.") return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const profileSchema = z.object({
  company: text(120),
  address1: text(200),
  address2: text(200),
  city: text(80),
  state: text(80),
  postcode: text(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Choose a country.")
    .transform((value) => value || null),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9 ()-]{0,25}$/, "Enter a phone number using digits, spaces and +.")
    .transform((value) => value || null),
  taxId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{0,20}$/, "A GSTIN or tax ID uses letters and digits only.")
    .transform((value) => value || null),
  currency: z.enum(CURRENCIES),
});

export async function saveBillingDetails(form: FormData): Promise<FormResult> {
  return run((user) => {
    const profile = profileSchema.parse(Object.fromEntries(form));
    saveBillingProfile(user.id, profile);
    return { ok: true, message: "Billing details saved" };
  });
}

const orderSchema = z.object({
  productId: z.string().uuid(),
  cycle: z.enum(CYCLES),
  label: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value || null),
});

export async function placeOrderAction(form: FormData): Promise<FormResult> {
  return run((user) => {
    const limit = rateLimit(`order:${user.id}`, 10, 10 * 60_000);
    if (!limit.ok) return { ok: false, error: "Too many orders in a short time. Wait a few minutes." };
    const input = orderSchema.parse(Object.fromEntries(form));
    const currency = getBillingProfile(user.id).currency;
    const invoiceId = placeOrder(user.id, { ...input, currency });
    return { ok: true, message: "Order placed", redirect: `/portal/invoices/${invoiceId}` };
  });
}

const projectSchema = z.object({
  type: z.enum(Object.keys(PROJECT_TYPES) as [keyof typeof PROJECT_TYPES]),
  title: z.string().trim().min(3, "Give the request a short title.").max(150),
  requirements: z.string().trim().min(10, "Describe what you need in a sentence or two.").max(10_000),
  budget: z.enum(Object.keys(BUDGETS) as [keyof typeof BUDGETS]).catch(""),
  timeline: z.enum(Object.keys(TIMELINES) as [keyof typeof TIMELINES]).catch(""),
});

export async function submitProject(form: FormData): Promise<FormResult> {
  return run((user) => {
    const limit = rateLimit(`project:${user.id}`, 5, 60 * 60_000);
    if (!limit.ok) return { ok: false, error: "You have sent several requests already. Wait a while, or reply on an existing one." };
    const input = projectSchema.parse(Object.fromEntries(form));
    const id = createProject(user.id, input);
    return { ok: true, message: "Request sent", redirect: `/portal/projects/${id}` };
  });
}

const idSchema = z.string().uuid();

export async function postProjectMessage(form: FormData): Promise<FormResult> {
  return run((user) => {
    const projectId = idSchema.parse(form.get("projectId"));
    const message = z.string().trim().min(1, "Write a message first.").max(5000).parse(form.get("message"));
    if (!getProjectForUser(projectId, user.id)) return { ok: false, error: "That project does not exist." };
    const limit = rateLimit(`project-message:${user.id}`, 30, 10 * 60_000);
    if (!limit.ok) return { ok: false, error: "Too many messages. Wait a moment." };
    addProjectMessage(projectId, { type: "client", id: user.id }, message);
    return { ok: true, message: "Message sent" };
  });
}

export async function cancelProject(form: FormData): Promise<FormResult> {
  return run((user) => {
    cancelProjectByClient(idSchema.parse(form.get("projectId")), user.id);
    return { ok: true, message: "Request cancelled" };
  });
}

export async function acceptProposalAction(form: FormData): Promise<FormResult> {
  return run((user) => {
    const invoiceId = acceptProposal(idSchema.parse(form.get("proposalId")), user.id);
    return { ok: true, message: "Proposal accepted", redirect: `/portal/invoices/${invoiceId}` };
  });
}

export async function declineProposalAction(form: FormData): Promise<FormResult> {
  return run((user) => {
    declineProposal(idSchema.parse(form.get("proposalId")), user.id);
    return { ok: true, message: "Proposal declined" };
  });
}

export async function cancelServiceAction(form: FormData): Promise<FormResult> {
  return run((user) => {
    const outcome = requestCancellation(idSchema.parse(form.get("serviceId")), user.id);
    return {
      ok: true,
      message: outcome === "cancelled" ? "Order cancelled" : "Cancellation requested. The service ends when the paid term does.",
    };
  });
}
