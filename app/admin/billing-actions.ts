"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/components/action-form";
import { adminAction, type AdminUser } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { saveBillingConfig, saveRazorpay } from "@/lib/billing/config";
import { CURRENCIES, CYCLES, parseMoney, type Currency, type Cycle } from "@/lib/billing/money";
import {
  applyPayment,
  BillingError,
  cancelInvoice,
  deleteProduct,
  getInvoice,
  runRenewals,
  saveProduct,
  setProductPrices,
  setServiceStatus,
} from "@/lib/billing/store";
import { addProjectMessage, getProject, PROJECT_STATUSES, sendProposal, type ProjectStatus } from "@/lib/projects";
import { PRODUCT_GROUPS } from "@/lib/site/pages";

async function run(work: (admin: AdminUser) => FormResult | Promise<FormResult>): Promise<FormResult> {
  try {
    const admin = await adminAction();
    return await work(admin);
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Check the form." };
    if (error instanceof Error) return { ok: false, error: error.message };
    return { ok: false, error: "Something went wrong." };
  }
}

const id = z.string().uuid();

const productSchema = z.object({
  id: z.string().uuid().or(z.literal("")),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,60}$/, "The URL slug uses lowercase letters, digits and hyphens."),
  groupSlug: z.enum(PRODUCT_GROUPS.map((group) => group.slug) as [string, ...string[]]),
  name: z.string().trim().min(2, "Give the plan a name.").max(80),
  tagline: z.string().trim().max(160),
  features: z.string().trim().max(2000),
  sort: z.coerce.number().int().min(0).max(999).catch(0),
  aiQuotaTokens: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value.replace(/[,_\s]/g, ""))))
    .pipe(z.number().int().min(1).max(1_000_000_000_000).nullable()),
});

/** Prices arrive as price.INR.monthly and setup.INR.monthly fields; blank means not offered. */
function pricesFrom(form: FormData) {
  const rows: { currency: Currency; cycle: Cycle; amountMinor: number; setupMinor: number }[] = [];
  for (const currency of CURRENCIES) {
    for (const cycle of CYCLES) {
      const raw = String(form.get(`price.${currency}.${cycle}`) ?? "").trim();
      if (!raw) continue;
      const amount = parseMoney(raw);
      if (amount === null) throw new BillingError(`${currency} ${cycle} price is not a valid amount.`);
      const setupRaw = String(form.get(`setup.${currency}.${cycle}`) ?? "").trim();
      const setup = setupRaw ? parseMoney(setupRaw) : 0;
      if (setup === null) throw new BillingError(`${currency} ${cycle} setup fee is not a valid amount.`);
      rows.push({ currency, cycle, amountMinor: amount, setupMinor: setup });
    }
  }
  return rows;
}

export async function saveProductAction(form: FormData): Promise<FormResult> {
  return run((admin) => {
    const input = productSchema.parse(Object.fromEntries(form));
    const prices = pricesFrom(form);
    const visible = form.get("visible") === "on";
    if (visible && prices.length === 0) return { ok: false, error: "Add at least one price before showing a plan on the website." };
    const kind = input.groupSlug === "ai-plans" ? "ai" : "hosting";
    const productId = saveProduct(input.id || null, {
      slug: input.slug,
      groupSlug: input.groupSlug,
      kind,
      name: input.name,
      tagline: input.tagline,
      features: input.features,
      featured: form.get("featured") === "on",
      hidden: !visible,
      sort: input.sort,
      aiQuotaTokens: kind === "ai" ? input.aiQuotaTokens : null,
    });
    setProductPrices(productId, prices);
    audit(admin, input.id ? "product.update" : "product.create", { type: "product", id: productId }, {
      name: input.name,
      visible,
      prices: prices.length,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Plan saved", redirect: input.id ? undefined : `/admin/billing/products/${productId}` };
  });
}

export async function deleteProductAction(form: FormData): Promise<FormResult> {
  return run((admin) => {
    const productId = id.parse(form.get("id"));
    deleteProduct(productId);
    audit(admin, "product.delete", { type: "product", id: productId });
    return { ok: true, message: "Plan deleted", redirect: "/admin/billing/products" };
  });
}

export async function markInvoicePaid(form: FormData): Promise<FormResult> {
  return run((admin) => {
    const invoiceId = id.parse(form.get("id"));
    const note = z.string().trim().min(3, "Say how it was paid, e.g. the bank reference.").max(200).parse(form.get("note"));
    const found = getInvoice(invoiceId);
    if (!found) return { ok: false, error: "That invoice no longer exists." };
    applyPayment({
      invoiceId,
      gateway: "manual",
      amountMinor: found.invoice.totalMinor,
      currency: found.invoice.currency,
      note,
    });
    audit(admin, "invoice.mark_paid", { type: "invoice", id: invoiceId }, { number: found.invoice.number, note });
    return { ok: true, message: "Invoice marked paid" };
  });
}

export async function cancelInvoiceAction(form: FormData): Promise<FormResult> {
  return run((admin) => {
    const invoiceId = id.parse(form.get("id"));
    const found = getInvoice(invoiceId);
    cancelInvoice(invoiceId);
    audit(admin, "invoice.cancel", { type: "invoice", id: invoiceId }, { number: found?.invoice.number });
    return { ok: true, message: "Invoice cancelled" };
  });
}

export async function setServiceStatusAction(form: FormData): Promise<FormResult> {
  return run((admin) => {
    const serviceId = id.parse(form.get("id"));
    const status = z.enum(["active", "suspended", "cancelled"]).parse(form.get("status"));
    setServiceStatus(serviceId, status);
    audit(admin, `service.${status}`, { type: "service", id: serviceId });
    return { ok: true, message: `Service ${status === "active" ? "activated" : status}` };
  });
}

export async function runRenewalsAction(): Promise<FormResult> {
  return run((admin) => {
    const result = runRenewals();
    audit(admin, "billing.renewals", { type: "billing" }, result);
    return { ok: true, message: `${result.issued} renewal invoice${result.issued === 1 ? "" : "s"} issued, ${result.ended} service${result.ended === 1 ? "" : "s"} ended` };
  });
}

const configSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  companyAddress: z.string().trim().max(500),
  companyTaxId: z.string().trim().toUpperCase().max(40),
  supportEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid support email, or leave it blank.")]),
  invoicePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,12}$/, "The invoice prefix uses up to 12 letters, digits or hyphens."),
  taxRate: z.coerce.number().min(0).max(50),
  taxLabel: z.string().trim().max(30),
  renewalLeadDays: z.coerce.number().int().min(0).max(60),
  paymentTermsDays: z.coerce.number().int().min(0).max(60),
  defaultCurrency: z.enum(CURRENCIES),
});

export async function saveBillingSettings(form: FormData): Promise<FormResult> {
  return run((admin) => {
    const config = saveBillingConfig(configSchema.parse(Object.fromEntries(form)));
    audit(admin, "billing.settings", { type: "settings" }, { taxRate: config.taxRate, invoicePrefix: config.invoicePrefix });
    return { ok: true, message: "Billing settings saved" };
  });
}

export async function saveRazorpayAction(form: FormData): Promise<FormResult> {
  return run((admin) => {
    const value = (name: string) => {
      const raw = form.get(name);
      return typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
    };
    const clear = form.get("clear") === "1";
    const patch = clear
      ? { keyId: "", secret: "", webhookSecret: "" }
      : { keyId: String(form.get("keyId") ?? ""), secret: value("secret"), webhookSecret: value("webhookSecret") };
    const saved = saveRazorpay(patch);
    audit(admin, "billing.razorpay", { type: "settings" }, {
      keyId: saved.keyId || null,
      secretChanged: clear || patch.secret !== undefined,
      webhookSecretChanged: clear || patch.webhookSecret !== undefined,
    });
    return { ok: true, message: clear ? "Razorpay disconnected" : "Razorpay settings saved" };
  });
}

export async function staffProjectUpdate(form: FormData): Promise<FormResult> {
  return run((admin) => {
    const projectId = id.parse(form.get("projectId"));
    if (!getProject(projectId)) return { ok: false, error: "That project no longer exists." };
    const statusRaw = String(form.get("status") ?? "");
    const status = statusRaw && statusRaw in PROJECT_STATUSES ? (statusRaw as ProjectStatus) : null;
    const message = z.string().trim().max(5000).parse(form.get("message") ?? "");
    if (!message && !status) return { ok: false, error: "Write a message or choose a new status." };
    const internal = form.get("internal") === "on";
    addProjectMessage(
      projectId,
      { type: "staff", id: admin.id },
      message || `Status changed to ${PROJECT_STATUSES[status!]}.`,
      { status, visibleToClient: !internal },
    );
    audit(admin, "project.update", { type: "project", id: projectId }, { status, internal });
    return { ok: true, message: internal ? "Internal note saved" : "Update sent" };
  });
}

export async function sendProposalAction(form: FormData): Promise<FormResult> {
  return run((admin) => {
    const projectId = id.parse(form.get("projectId"));
    const summary = z.string().trim().min(5, "Describe what the proposal covers.").max(5000).parse(form.get("summary"));
    const currency = z.enum(CURRENCIES).parse(form.get("currency"));
    const amountMinor = parseMoney(form.get("amount"));
    if (!amountMinor) return { ok: false, error: "Enter the proposal amount." };
    sendProposal(projectId, admin.id, { summary, currency, amountMinor });
    audit(admin, "project.proposal", { type: "project", id: projectId }, { currency, amountMinor });
    return { ok: true, message: "Proposal sent" };
  });
}