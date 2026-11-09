import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, like, lte, ne, or, sql } from "drizzle-orm";
import { getBillingConfig } from "@/lib/billing/config";
import { addMonths, cycleMonths, taxOn, type Currency, type Cycle } from "@/lib/billing/money";
import { db } from "@/lib/db";
import {
  billingProfiles,
  invoiceItems,
  invoices,
  payments,
  productPrices,
  products,
  projects,
  projectUpdates,
  proposals,
  services,
  users,
} from "@/lib/db/schema";

const DAY = 24 * 60 * 60 * 1000;

export class BillingError extends Error {}

function fail(message: string): never {
  throw new BillingError(message);
}

export type Product = typeof products.$inferSelect;
export type ProductPrice = typeof productPrices.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;

// Catalogue

export function listProducts() {
  return db.select().from(products).orderBy(asc(products.groupSlug), asc(products.sort), asc(products.name)).all();
}

export function getProduct(id: string) {
  return db.select().from(products).where(eq(products.id, id)).get();
}

export function getProductBySlug(slug: string) {
  return db.select().from(products).where(eq(products.slug, slug)).get();
}

export function pricesFor(productId: string) {
  return db.select().from(productPrices).where(eq(productPrices.productId, productId)).all();
}

export type CatalogItem = Product & { prices: ProductPrice[] };

/** Visible products in a website group that have a price in `currency`. */
export function catalogGroup(groupSlug: string, currency: Currency): CatalogItem[] {
  const rows = db
    .select()
    .from(products)
    .where(and(eq(products.groupSlug, groupSlug), eq(products.hidden, false)))
    .orderBy(asc(products.sort), asc(products.name))
    .all();
  if (rows.length === 0) return [];
  const prices = db
    .select()
    .from(productPrices)
    .where(and(inArray(productPrices.productId, rows.map((row) => row.id)), eq(productPrices.currency, currency)))
    .all();
  return rows
    .map((row) => ({ ...row, prices: prices.filter((price) => price.productId === row.id) }))
    .filter((row) => row.prices.length > 0);
}

export type ProductInput = {
  slug: string;
  groupSlug: string;
  kind: "hosting" | "ai";
  name: string;
  tagline: string;
  features: string;
  featured: boolean;
  hidden: boolean;
  sort: number;
  aiQuotaTokens: number | null;
};

export function saveProduct(id: string | null, input: ProductInput) {
  const now = Date.now();
  const clash = getProductBySlug(input.slug);
  if (clash && clash.id !== id) fail("Another product already uses that URL slug.");
  if (id) {
    if (!getProduct(id)) fail("That product no longer exists.");
    db.update(products).set({ ...input, updatedAt: now }).where(eq(products.id, id)).run();
    return id;
  }
  const newId = randomUUID();
  db.insert(products).values({ id: newId, ...input, createdAt: now, updatedAt: now }).run();
  return newId;
}

export function setProductPrices(
  productId: string,
  rows: { currency: Currency; cycle: Cycle; amountMinor: number; setupMinor: number }[],
) {
  db.transaction((tx) => {
    tx.delete(productPrices).where(eq(productPrices.productId, productId)).run();
    for (const row of rows) tx.insert(productPrices).values({ productId, ...row }).run();
  });
}

export function deleteProduct(id: string) {
  const used = db.select({ id: services.id }).from(services).where(eq(services.productId, id)).get();
  if (used) fail("Customers have services on this product. Hide it instead.");
  db.delete(products).where(eq(products.id, id)).run();
}

// Billing profile

export type BillingProfile = Omit<typeof billingProfiles.$inferSelect, "userId" | "updatedAt">;

export function getBillingProfile(userId: string): BillingProfile {
  const row = db.select().from(billingProfiles).where(eq(billingProfiles.userId, userId)).get();
  if (row) {
    return {
      company: row.company,
      address1: row.address1,
      address2: row.address2,
      city: row.city,
      state: row.state,
      postcode: row.postcode,
      country: row.country,
      phone: row.phone,
      taxId: row.taxId,
      currency: row.currency,
    };
  }
  return {
    company: null,
    address1: null,
    address2: null,
    city: null,
    state: null,
    postcode: null,
    country: "IN",
    phone: null,
    taxId: null,
    currency: getBillingConfig().defaultCurrency,
  };
}

export function saveBillingProfile(userId: string, profile: BillingProfile) {
  const now = Date.now();
  db.insert(billingProfiles)
    .values({ userId, ...profile, updatedAt: now })
    .onConflictDoUpdate({ target: billingProfiles.userId, set: { ...profile, updatedAt: now } })
    .run();
}

function billTo(userId: string) {
  const user = db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).get();
  if (!user) fail("That account no longer exists.");
  return JSON.stringify({ name: user.name, email: user.email, ...getBillingProfile(userId) });
}

export type BillTo = BillingProfile & { name: string; email: string };

export function parseBillTo(value: string): BillTo {
  return JSON.parse(value) as BillTo;
}

// Invoices

type NewItem = {
  kind: InvoiceItem["kind"];
  description: string;
  amountMinor: number;
  serviceId?: string | null;
  periodStart?: number | null;
  periodEnd?: number | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function nextNumber(tx: Tx, prefix: string) {
  const year = new Date().getUTCFullYear();
  const stem = `${prefix}-${year}-`;
  const last = tx
    .select({ number: invoices.number })
    .from(invoices)
    .where(like(invoices.number, `${stem}%`))
    .orderBy(desc(invoices.number))
    .get();
  const sequence = last ? Number(last.number.slice(stem.length)) + 1 : 1;
  return `${stem}${String(sequence).padStart(5, "0")}`;
}

function insertInvoice(
  tx: Tx,
  userId: string,
  currency: Currency,
  items: NewItem[],
  options: { projectId?: string | null; dueAt?: number } = {},
) {
  if (items.length === 0) fail("An invoice needs at least one line.");
  const config = getBillingConfig();
  const now = Date.now();
  const subtotal = items.reduce((sum, item) => sum + item.amountMinor, 0);
  const tax = taxOn(subtotal, config.taxRate);
  const id = randomUUID();
  tx.insert(invoices)
    .values({
      id,
      number: nextNumber(tx, config.invoicePrefix),
      userId,
      status: subtotal + tax === 0 ? "paid" : "unpaid",
      currency,
      subtotalMinor: subtotal,
      taxRate: config.taxRate,
      taxLabel: config.taxRate > 0 ? config.taxLabel : "",
      taxMinor: tax,
      totalMinor: subtotal + tax,
      billTo: billTo(userId),
      projectId: options.projectId ?? null,
      dueAt: options.dueAt ?? now + config.paymentTermsDays * DAY,
      paidAt: subtotal + tax === 0 ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  for (const item of items) {
    tx.insert(invoiceItems)
      .values({
        invoiceId: id,
        kind: item.kind,
        description: item.description,
        amountMinor: item.amountMinor,
        serviceId: item.serviceId ?? null,
        periodStart: item.periodStart ?? null,
        periodEnd: item.periodEnd ?? null,
      })
      .run();
  }
  return id;
}

export function createManualInvoice(userId: string, currency: Currency, lines: { description: string; amountMinor: number }[]) {
  return db.transaction((tx) => insertInvoice(tx, userId, currency, lines.map((line) => ({ kind: "manual" as const, ...line }))));
}

export function getInvoice(id: string) {
  const invoice = db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!invoice) return null;
  return {
    invoice,
    items: db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.id)).all(),
    payments: db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(asc(payments.createdAt)).all(),
  };
}

/** Only the owner's invoice; null for anyone else's, so ids cannot be probed. */
export function getInvoiceForUser(id: string, userId: string) {
  const found = getInvoice(id);
  return found && found.invoice.userId === userId ? found : null;
}

export function listInvoicesForUser(userId: string) {
  return db.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.createdAt)).all();
}

export function isOverdue(invoice: Pick<Invoice, "status" | "dueAt">, now = Date.now()) {
  return invoice.status === "unpaid" && invoice.dueAt < now;
}

export function cancelInvoice(id: string) {
  const found = getInvoice(id) ?? fail("That invoice no longer exists.");
  if (found.invoice.status !== "unpaid") fail("Only unpaid invoices can be cancelled.");
  db.transaction((tx) => {
    tx.update(invoices).set({ status: "cancelled", updatedAt: Date.now() }).where(eq(invoices.id, id)).run();
    for (const item of found.items) {
      if (item.kind === "new" && item.serviceId) {
        tx.update(services)
          .set({ status: "cancelled", cancelledAt: Date.now(), updatedAt: Date.now() })
          .where(and(eq(services.id, item.serviceId), eq(services.status, "pending")))
          .run();
      }
    }
    tx.update(proposals).set({ status: "withdrawn" }).where(eq(proposals.invoiceId, id)).run();
  });
}

// Orders

export function placeOrder(
  userId: string,
  input: { productId: string; cycle: Cycle; currency: Currency; label: string | null },
) {
  const product = getProduct(input.productId);
  if (!product || product.hidden) fail("That plan is not available to order.");
  const price = pricesFor(product.id).find((row) => row.currency === input.currency && row.cycle === input.cycle);
  if (!price) fail("That billing cycle is not offered in this currency.");
  const now = Date.now();
  return db.transaction((tx) => {
    const serviceId = randomUUID();
    tx.insert(services)
      .values({
        id: serviceId,
        userId,
        productId: product.id,
        name: product.name,
        kind: product.kind,
        status: "pending",
        cycle: input.cycle,
        currency: input.currency,
        amountMinor: price.amountMinor,
        label: input.label,
        aiQuotaTokens: product.aiQuotaTokens,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const months = cycleMonths(input.cycle);
    const items: NewItem[] = [
      {
        kind: "new",
        description: `${product.name}${input.label ? ` (${input.label})` : ""}`,
        amountMinor: price.amountMinor,
        serviceId,
        periodStart: months ? now : null,
        periodEnd: months ? addMonths(now, months) : null,
      },
    ];
    if (price.setupMinor > 0) {
      items.push({ kind: "setup", description: `${product.name} setup`, amountMinor: price.setupMinor, serviceId });
    }
    const invoiceId = insertInvoice(tx, userId, input.currency, items);
    const created = tx.select().from(invoices).where(eq(invoices.id, invoiceId)).get()!;
    if (created.status === "paid") activateFromItems(tx, invoiceId, now);
    return invoiceId;
  });
}

// Payments

function applyAiPlan(tx: Tx, service: Service) {
  if (service.kind !== "ai") return;
  tx.update(users)
    .set({ plan: service.name.slice(0, 40), quotaTokens: service.aiQuotaTokens })
    .where(eq(users.id, service.userId))
    .run();
}

function clearAiPlan(tx: Tx, service: Service) {
  if (service.kind !== "ai") return;
  const otherActive = tx
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.userId, service.userId), eq(services.kind, "ai"), eq(services.status, "active"), ne(services.id, service.id)))
    .get();
  if (!otherActive) tx.update(users).set({ plan: "free", quotaTokens: null }).where(eq(users.id, service.userId)).run();
}

function activateFromItems(tx: Tx, invoiceId: string, now: number) {
  const items = tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).all();
  for (const item of items) {
    if (!item.serviceId || (item.kind !== "new" && item.kind !== "renewal")) continue;
    const service = tx.select().from(services).where(eq(services.id, item.serviceId)).get();
    if (!service || service.status === "cancelled") continue;
    const months = cycleMonths(service.cycle as Cycle);
    const nextDueAt = months ? (item.periodEnd ?? addMonths(now, months)) : null;
    const next = {
      status: "active" as const,
      activatedAt: service.activatedAt ?? now,
      nextDueAt,
      updatedAt: now,
    };
    tx.update(services).set(next).where(eq(services.id, service.id)).run();
    applyAiPlan(tx, { ...service, ...next });
  }
  const invoice = tx.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (invoice?.projectId) {
    tx.update(projects).set({ status: "in_progress", updatedAt: now }).where(eq(projects.id, invoice.projectId)).run();
    tx.insert(projectUpdates)
      .values({
        projectId: invoice.projectId,
        authorType: "system",
        status: "in_progress",
        message: `Invoice ${invoice.number} was paid. Work is scheduled.`,
        createdAt: now,
      })
      .run();
  }
}

export type PaymentResult = { status: "paid" | "already_paid"; invoiceId: string };

/**
 * Marks an invoice paid and activates what it pays for. Safe to call twice for
 * the same payment (the browser callback and the webhook both arrive).
 */
export function applyPayment(input: {
  invoiceId: string;
  gateway: "razorpay" | "manual";
  amountMinor: number;
  currency: string;
  orderId?: string | null;
  paymentId?: string | null;
  note?: string | null;
}): PaymentResult {
  return db.transaction((tx) => {
    const invoice = tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).get();
    if (!invoice) fail("That invoice no longer exists.");
    if (invoice.status === "paid") return { status: "already_paid" as const, invoiceId: invoice.id };
    if (invoice.status === "cancelled") fail("That invoice was cancelled.");
    if (input.currency !== invoice.currency || input.amountMinor !== invoice.totalMinor) {
      fail("The payment amount does not match the invoice.");
    }
    const now = Date.now();
    const existing = input.orderId
      ? tx.select().from(payments).where(eq(payments.gatewayOrderId, input.orderId)).get()
      : undefined;
    if (existing) {
      tx.update(payments)
        .set({ status: "captured", gatewayPaymentId: input.paymentId ?? existing.gatewayPaymentId, updatedAt: now })
        .where(eq(payments.id, existing.id))
        .run();
    } else {
      tx.insert(payments)
        .values({
          id: randomUUID(),
          invoiceId: invoice.id,
          gateway: input.gateway,
          gatewayOrderId: input.orderId ?? null,
          gatewayPaymentId: input.paymentId ?? null,
          amountMinor: input.amountMinor,
          currency: input.currency,
          status: "captured",
          note: input.note ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    tx.update(invoices).set({ status: "paid", paidAt: now, updatedAt: now }).where(eq(invoices.id, invoice.id)).run();
    activateFromItems(tx, invoice.id, now);
    return { status: "paid" as const, invoiceId: invoice.id };
  });
}

export function recordGatewayOrder(invoice: Invoice, orderId: string) {
  const now = Date.now();
  db.insert(payments)
    .values({
      id: randomUUID(),
      invoiceId: invoice.id,
      gateway: "razorpay",
      gatewayOrderId: orderId,
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      status: "created",
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function paymentByOrderId(orderId: string) {
  return db.select().from(payments).where(eq(payments.gatewayOrderId, orderId)).get();
}

export function markPaymentFailed(orderId: string, note: string) {
  db.update(payments)
    .set({ status: "failed", note: note.slice(0, 300), updatedAt: Date.now() })
    .where(and(eq(payments.gatewayOrderId, orderId), eq(payments.status, "created")))
    .run();
}

// Services

export function listServicesForUser(userId: string) {
  return db.select().from(services).where(eq(services.userId, userId)).orderBy(desc(services.createdAt)).all();
}

export function getServiceForUser(id: string, userId: string) {
  const service = db.select().from(services).where(eq(services.id, id)).get();
  return service && service.userId === userId ? service : null;
}

export function getService(id: string) {
  return db.select().from(services).where(eq(services.id, id)).get();
}

export function invoicesForService(serviceId: string) {
  return db
    .selectDistinct({ invoice: invoices })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoices.id, invoiceItems.invoiceId))
    .where(eq(invoiceItems.serviceId, serviceId))
    .orderBy(desc(invoices.createdAt))
    .all()
    .map((row) => row.invoice);
}

export function requestCancellation(id: string, userId: string) {
  const service = getServiceForUser(id, userId) ?? fail("That service does not exist.");
  if (service.status === "cancelled") fail("That service is already cancelled.");
  if (service.status === "pending") {
    const unpaid = invoicesForService(id).find((invoice) => invoice.status === "unpaid");
    if (unpaid) cancelInvoice(unpaid.id);
    return "cancelled" as const;
  }
  db.update(services).set({ cancelRequestedAt: Date.now(), updatedAt: Date.now() }).where(eq(services.id, id)).run();
  return "end_of_term" as const;
}

export function setServiceStatus(id: string, status: Service["status"]) {
  const service = getService(id) ?? fail("That service no longer exists.");
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(services)
      .set({
        status,
        activatedAt: status === "active" ? (service.activatedAt ?? now) : service.activatedAt,
        cancelledAt: status === "cancelled" ? now : null,
        updatedAt: now,
      })
      .where(eq(services.id, id))
      .run();
    if (status === "active") applyAiPlan(tx, service);
    else clearAiPlan(tx, { ...service, status });
  });
}

// Renewals

/**
 * Issues renewal invoices ahead of each due date and ends services whose
 * owner asked to cancel once their paid term is over. Idempotent: a period is
 * only invoiced once.
 */
export function runRenewals(now = Date.now()) {
  const config = getBillingConfig();
  let issued = 0;
  let ended = 0;
  const due = db
    .select()
    .from(services)
    .where(and(eq(services.status, "active"), lte(services.nextDueAt, now + config.renewalLeadDays * DAY)))
    .all();
  for (const service of due) {
    if (service.nextDueAt === null) continue;
    if (service.cancelRequestedAt) {
      if (service.nextDueAt <= now) {
        setServiceStatus(service.id, "cancelled");
        ended += 1;
      }
      continue;
    }
    const months = cycleMonths(service.cycle as Cycle);
    if (!months) continue;
    const already = db
      .select({ id: invoiceItems.id })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoices.id, invoiceItems.invoiceId))
      .where(
        and(
          eq(invoiceItems.serviceId, service.id),
          eq(invoiceItems.periodStart, service.nextDueAt),
          ne(invoices.status, "cancelled"),
        ),
      )
      .get();
    if (already) continue;
    const periodEnd = addMonths(service.nextDueAt, months);
    db.transaction((tx) =>
      insertInvoice(
        tx,
        service.userId,
        service.currency,
        [
          {
            kind: "renewal",
            description: `${service.name}${service.label ? ` (${service.label})` : ""} renewal`,
            amountMinor: service.amountMinor,
            serviceId: service.id,
            periodStart: service.nextDueAt,
            periodEnd,
          },
        ],
        { dueAt: service.nextDueAt! },
      ),
    );
    issued += 1;
  }
  return { issued, ended };
}

// Admin views

export function adminInvoices({ status, q, page, pageSize }: { status: string; q: string; page: number; pageSize: number }) {
  const filters = [];
  if (status === "unpaid" || status === "paid" || status === "cancelled") filters.push(eq(invoices.status, status));
  if (status === "overdue") filters.push(and(eq(invoices.status, "unpaid"), lte(invoices.dueAt, Date.now())));
  if (q) filters.push(or(like(invoices.number, `%${q}%`), like(users.email, `%${q}%`)));
  const where = filters.length ? and(...filters) : undefined;
  const rows = db
    .select({ invoice: invoices, email: users.email, name: users.name })
    .from(invoices)
    .innerJoin(users, eq(users.id, invoices.userId))
    .where(where)
    .orderBy(desc(invoices.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  const total =
    db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .innerJoin(users, eq(users.id, invoices.userId))
      .where(where)
      .get()?.count ?? 0;
  return { rows, total };
}

export function adminServices({ status, q, page, pageSize }: { status: string; q: string; page: number; pageSize: number }) {
  const filters = [];
  if (["pending", "active", "suspended", "cancelled"].includes(status)) filters.push(eq(services.status, status as Service["status"]));
  if (status === "cancel_requested") filters.push(and(eq(services.status, "active"), sql`${services.cancelRequestedAt} IS NOT NULL`));
  if (q) filters.push(or(like(services.name, `%${q}%`), like(users.email, `%${q}%`), like(services.label, `%${q}%`)));
  const where = filters.length ? and(...filters) : undefined;
  const rows = db
    .select({ service: services, email: users.email })
    .from(services)
    .innerJoin(users, eq(users.id, services.userId))
    .where(where)
    .orderBy(desc(services.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  const total =
    db
      .select({ count: sql<number>`count(*)` })
      .from(services)
      .innerJoin(users, eq(users.id, services.userId))
      .where(where)
      .get()?.count ?? 0;
  return { rows, total };
}

export function billingOverview(now = Date.now()) {
  const month = new Date(now);
  const monthStart = Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1);
  const revenue = db
    .select({ currency: invoices.currency, total: sql<number>`sum(${invoices.totalMinor})` })
    .from(invoices)
    .where(and(eq(invoices.status, "paid"), sql`${invoices.paidAt} >= ${monthStart}`))
    .groupBy(invoices.currency)
    .all();
  const outstanding = db
    .select({ currency: invoices.currency, total: sql<number>`sum(${invoices.totalMinor})`, count: sql<number>`count(*)` })
    .from(invoices)
    .where(eq(invoices.status, "unpaid"))
    .groupBy(invoices.currency)
    .all();
  const overdue =
    db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(and(eq(invoices.status, "unpaid"), lte(invoices.dueAt, now)))
      .get()?.count ?? 0;
  const activeServices =
    db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, "active")).get()?.count ?? 0;
  const pendingServices =
    db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, "pending")).get()?.count ?? 0;
  return { revenue, outstanding, overdue, activeServices, pendingServices };
}

/** Accepting a proposal issues its invoice; paying it moves the project to In progress. */
export function acceptProposal(proposalId: string, userId: string) {
  return db.transaction((tx) => {
    const proposal = tx.select().from(proposals).where(eq(proposals.id, proposalId)).get();
    const project = proposal ? tx.select().from(projects).where(eq(projects.id, proposal.projectId)).get() : undefined;
    if (!proposal || !project || project.userId !== userId) fail("That proposal does not exist.");
    if (proposal.status !== "sent") fail("That proposal is no longer open.");
    const now = Date.now();
    const invoiceId = insertInvoice(
      tx,
      userId,
      proposal.currency,
      [{ kind: "proposal", description: `${project.reference}: ${project.title}`, amountMinor: proposal.amountMinor }],
      { projectId: project.id },
    );
    tx.update(proposals).set({ status: "accepted", invoiceId, respondedAt: now }).where(eq(proposals.id, proposal.id)).run();
    tx.update(projects).set({ status: "accepted", updatedAt: now }).where(eq(projects.id, project.id)).run();
    tx.insert(projectUpdates)
      .values({
        projectId: project.id,
        authorType: "client",
        authorId: userId,
        status: "accepted",
        message: "Proposal accepted. An invoice has been issued.",
        createdAt: now,
      })
      .run();
    const created = tx.select().from(invoices).where(eq(invoices.id, invoiceId)).get()!;
    if (created.status === "paid") activateFromItems(tx, invoiceId, now);
    return invoiceId;
  });
}
