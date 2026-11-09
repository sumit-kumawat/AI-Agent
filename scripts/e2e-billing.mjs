// Browser test for the CONZEX website, customer portal and native billing.
// Seeds a throwaway admin and customer, creates a plan, orders it, pays it
// through signed Razorpay webhook and checkout callbacks (no real money or
// network calls to Razorpay), runs a project request through proposal and
// invoice, then restores billing settings and deletes everything it made.
//
//   npm run e2e:billing            (server must be running; uses Chrome)
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
const dbPath = path.resolve(process.env.DATABASE_PATH ?? "data/harbor.db");
fs.mkdirSync(shots, { recursive: true });

const stamp = Date.now();
const admin = { email: `e2e-admin-${stamp}@harbor.local`, password: `admin-${stamp}-pw` };
const user = { email: `e2e-user-${stamp}@harbor.local`, password: `user-${stamp}-pw` };
const slug = `e2e-cloud-${stamp}`;
const keySecret = `e2e-key-secret-${stamp}`;
const webhookSecret = `e2e-webhook-secret-${stamp}`;

execFileSync(
  process.execPath,
  ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/seed.mjs"],
  {
    env: {
      ...process.env,
      ADMIN_EMAIL: admin.email,
      ADMIN_PASSWORD_HASH: bcrypt.hashSync(admin.password, 10).replaceAll("$", "\\$"),
      SEED_USER_EMAIL: user.email,
      SEED_USER_PASSWORD: user.password,
    },
    stdio: "ignore",
  },
);

function withDb(work) {
  const db = new Database(dbPath);
  try {
    return work(db);
  } finally {
    db.close();
  }
}

// Billing settings are restored exactly as they were, even after a failure.
const savedSettings = withDb((db) =>
  db.prepare(`SELECT key, value, updated_at FROM settings WHERE key IN ('billing.config', 'billing.razorpay')`).all(),
);

let failures = 0;
function check(condition, label) {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) failures += 1;
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});

async function session(account) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 860 });
  page.setDefaultTimeout(20_000);
  page.on("dialog", (dialog) => {
    check(false, `native ${dialog.type()} dialog appeared: ${dialog.message()}`);
    void dialog.dismiss();
  });
  page.on("pageerror", (error) => check(false, `page error: ${error.message}`));
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", account.email);
  await page.type("#password", account.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
  return page;
}

async function changePassword(page, account, next) {
  await page.waitForSelector("#current");
  await page.type("#current", account.password);
  await page.type("#new", next);
  await page.type("#confirm", next);
  await Promise.all([
    page.waitForFunction(() => !location.pathname.startsWith("/account/password"), { timeout: 20_000 }),
    page.click("button[type=submit]"),
  ]);
  account.password = next;
}

function api(page, url, init = {}) {
  return page.evaluate(
    async (target, options) => {
      const response = await fetch(target, options);
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: response.status, body };
    },
    url,
    { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } },
  );
}

/** Waits for the in-app popup containing `title` and presses `button` (or its primary button). */
async function popup(page, title, { button } = {}) {
  const find = (value) =>
    [...document.querySelectorAll("[role=alertdialog]")].find((node) => node.innerText.includes(value)) ?? null;
  await page.waitForFunction(find, {}, title);
  const dialog = await page.evaluateHandle(find, title);
  const clicked = await dialog.evaluate((node, label) => {
    const target = label
      ? [...node.querySelectorAll("button")].find((item) => item.innerText.trim() === label)
      : node.querySelector("button[type=submit]");
    target?.click();
    return Boolean(target);
  }, button ?? null);
  if (!clicked) throw new Error(`popup "${title}" has no "${button ?? "submit"}" button`);
}

async function waitForText(page, text) {
  await page.waitForFunction((value) => document.body.innerText.includes(value), {}, text);
}

async function fill(page, selector, value) {
  await page.$eval(selector, (input) => {
    input.focus();
    input.select?.();
  });
  await page.keyboard.type(value);
}

async function submit(page, label, scope = "main") {
  const button = await page.waitForSelector(`${scope} ::-p-text(${label})`, { visible: true });
  await button.click();
}

function signedWebhook(body, secret) {
  const raw = JSON.stringify(body);
  return fetch(`${base}/api/billing/razorpay/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Razorpay-Signature": createHmac("sha256", secret).update(raw).digest("hex") },
    body: raw,
  });
}

function gatewayOrder(invoiceId, orderId) {
  withDb((db) => {
    const invoice = db.prepare(`SELECT total_minor, currency FROM invoices WHERE id = ?`).get(invoiceId);
    db.prepare(
      `INSERT INTO payments (id, invoice_id, gateway, gateway_order_id, amount_minor, currency, status, created_at, updated_at)
       VALUES (?, ?, 'razorpay', ?, ?, ?, 'created', ?, ?)`,
    ).run(crypto.randomUUID(), invoiceId, orderId, invoice.total_minor, invoice.currency, Date.now(), Date.now());
  });
}

const invoiceIdFrom = (page) => new URL(page.url()).pathname.split("/").pop();

try {
  // Public website.
  for (const route of ["/", "/domains", "/hosting/cloud", "/servers/vps", "/email", "/security/ssl", "/solutions/enterprise", "/ai", "/faq", "/support", "/about"]) {
    const response = await fetch(`${base}${route}`);
    const html = await response.text();
    check(response.status === 200 && html.includes("CONZEX") && !/whmcs/i.test(html), `website ${route} renders`);
  }
  check((await fetch(`${base}/no-such-page`)).status === 404, "unknown website path is a 404");
  const portalRedirect = await fetch(`${base}/portal/invoices`, { redirect: "manual" });
  check(
    portalRedirect.status === 307 && (portalRedirect.headers.get("location") ?? "").includes("/login"),
    "portal requires sign-in",
  );
  const unsigned = await fetch(`${base}/api/billing/razorpay/webhook`, { method: "POST", body: "{}" });
  check(unsigned.status === 401, "unsigned webhook is refused");

  // Admin creates a plan with an INR price and sets GST.
  const adminPage = await session(admin);
  await changePassword(adminPage, admin, `admin-${stamp}-changed`);
  await adminPage.goto(`${base}/admin/billing/products/new`, { waitUntil: "networkidle0" });
  await fill(adminPage, "#product-name", "E2E Cloud");
  await fill(adminPage, "#product-slug", slug);
  await adminPage.select("#product-group", "cloud-hosting");
  await fill(adminPage, "#product-tagline", "A plan made by the billing test");
  await fill(adminPage, "#product-features", "2 vCPU\n4 GB RAM");
  await fill(adminPage, 'input[name="price.INR.monthly"]', "1000");
  await fill(adminPage, 'input[name="setup.INR.monthly"]', "");
  await adminPage.click('input[name="visible"]');
  await submit(adminPage, "Create plan");
  await adminPage.waitForFunction(() => /\/admin\/billing\/products\/[0-9a-f-]{36}$/.test(location.pathname));
  check(true, "admin creates a plan");

  await adminPage.goto(`${base}/admin/billing/settings`, { waitUntil: "networkidle0" });
  await fill(adminPage, 'input[name="taxRate"]', "18");
  await submit(adminPage, "Save billing settings");
  await waitForText(adminPage, "Billing settings saved");
  check(true, "admin sets GST to 18%");

  const cloud = await (await fetch(`${base}/hosting/cloud`)).text();
  check(cloud.includes("E2E Cloud") && cloud.includes(`/order/${slug}`), "the plan is listed on the cloud hosting page");

  // Customer saves billing details and orders.
  const userPage = await session(user);
  await userPage.goto(`${base}/portal/billing`, { waitUntil: "networkidle0" });
  await fill(userPage, "#billing-address1", "1 Test Road");
  await fill(userPage, "#billing-city", "Pune");
  await fill(userPage, "#billing-state", "Maharashtra");
  await fill(userPage, "#billing-postcode", "411001");
  await submit(userPage, "Save");
  await waitForText(userPage, "Billing details saved");
  check(true, "customer saves billing details");

  await userPage.goto(`${base}/order/${slug}`, { waitUntil: "networkidle0" });
  await submit(userPage, "Place order");
  await userPage.waitForFunction(() => /\/portal\/invoices\/[0-9a-f-]{36}$/.test(location.pathname));
  await userPage.waitForSelector("[data-invoice-total]");
  const firstInvoice = invoiceIdFrom(userPage);
  const total = await userPage.$eval("[data-invoice-total]", (node) => node.textContent);
  check(/1,180\.00/.test(total ?? ""), `invoice total includes 18% GST (${total})`);
  check(Boolean(await userPage.$("[data-payment-unavailable]")), "invoice says online payment is not set up");
  check(!(await userPage.$("::-p-text(Pay ₹)")), "no pay button without Razorpay keys");
  await userPage.screenshot({ path: `${shots}/billing_invoice.png`, fullPage: true });

  const otherView = await adminPage.goto(`${base}/portal/invoices/${firstInvoice}`, { waitUntil: "networkidle0" });
  check(otherView?.status() === 404, "another customer cannot open the invoice");

  // Admin connects Razorpay (test keys; nothing is sent to Razorpay here).
  await adminPage.goto(`${base}/admin/billing/settings`, { waitUntil: "networkidle0" });
  await fill(adminPage, 'input[name="keyId"]', "rzp_test_E2Ebilling01");
  await fill(adminPage, 'input[name="secret"]', keySecret);
  await fill(adminPage, 'input[name="webhookSecret"]', webhookSecret);
  await submit(adminPage, "Save Razorpay keys");
  await waitForText(adminPage, "Razorpay settings saved");
  await adminPage.reload({ waitUntil: "networkidle0" });
  const settingsText = await adminPage.evaluate(() => document.body.innerText + document.body.innerHTML);
  check(settingsText.includes("Connected in test mode"), "Razorpay shows as connected in test mode");
  check(!settingsText.includes(keySecret) && !settingsText.includes(webhookSecret), "saved secrets are never sent back to the browser");
  const stored = withDb((db) => db.prepare(`SELECT value FROM settings WHERE key = 'billing.razorpay'`).get()?.value ?? "");
  check(!stored.includes(keySecret) && !stored.includes(webhookSecret), "secrets are stored encrypted");

  await userPage.reload({ waitUntil: "networkidle0" });
  check(Boolean(await userPage.$("::-p-text(Pay ₹)")), "pay button appears once Razorpay is set up");

  // Webhook confirms the payment.
  const orderOne = `order_E2E${stamp}`;
  gatewayOrder(firstInvoice, orderOne);
  const event = {
    event: "payment.captured",
    payload: { payment: { entity: { id: `pay_E2E${stamp}`, order_id: orderOne, amount: 118000, currency: "INR" } } },
  };
  check((await signedWebhook(event, "wrong-secret")).status === 401, "webhook with a wrong signature is refused");
  const short = await signedWebhook(
    { ...event, payload: { payment: { entity: { ...event.payload.payment.entity, amount: 100 } } } },
    webhookSecret,
  );
  check(short.status === 409, "webhook for the wrong amount is refused");
  const paid = await signedWebhook(event, webhookSecret);
  check(paid.status === 200 && (await paid.json()).status === "paid", "signed webhook pays the invoice");
  const replay = await signedWebhook(event, webhookSecret);
  check(replay.status === 200 && (await replay.json()).status === "already_paid", "replayed webhook changes nothing");
  const state = withDb((db) => ({
    invoice: db.prepare(`SELECT status FROM invoices WHERE id = ?`).get(firstInvoice)?.status,
    payments: db.prepare(`SELECT count(*) AS n FROM payments WHERE invoice_id = ? AND status = 'captured'`).get(firstInvoice).n,
    service: db
      .prepare(`SELECT s.status, s.next_due_at FROM services s JOIN invoice_items i ON i.service_id = s.id WHERE i.invoice_id = ?`)
      .get(firstInvoice),
  }));
  check(state.invoice === "paid" && state.payments === 1, "invoice is paid once");
  check(state.service?.status === "active" && state.service.next_due_at > Date.now(), "service is active with a renewal date");
  await userPage.goto(`${base}/portal/services`, { waitUntil: "networkidle0" });
  check((await userPage.evaluate(() => document.body.innerText)).includes("E2E Cloud"), "customer sees the active service");

  // Checkout callback confirms a second order.
  await userPage.goto(`${base}/order/${slug}`, { waitUntil: "networkidle0" });
  await submit(userPage, "Place order");
  await userPage.waitForFunction((previous) => /\/portal\/invoices\/[0-9a-f-]{36}$/.test(location.pathname) && !location.pathname.endsWith(previous), {}, firstInvoice);
  const secondInvoice = invoiceIdFrom(userPage);
  const orderTwo = `order_E2F${stamp}`;
  const paymentTwo = `pay_E2F${stamp}`;
  gatewayOrder(secondInvoice, orderTwo);
  const sign = (secret) => createHmac("sha256", secret).update(`${orderTwo}|${paymentTwo}`).digest("hex");
  const forged = await api(userPage, "/api/billing/razorpay/verify", {
    method: "POST",
    body: JSON.stringify({ razorpay_order_id: orderTwo, razorpay_payment_id: paymentTwo, razorpay_signature: sign("forged") }),
  });
  check(forged.status === 400, "checkout callback with a forged signature is refused");
  const strangerVerify = await api(adminPage, "/api/billing/razorpay/verify", {
    method: "POST",
    body: JSON.stringify({ razorpay_order_id: orderTwo, razorpay_payment_id: paymentTwo, razorpay_signature: sign(keySecret) }),
  });
  check(strangerVerify.status === 404, "another customer cannot confirm the payment");
  const verified = await api(userPage, "/api/billing/razorpay/verify", {
    method: "POST",
    body: JSON.stringify({ razorpay_order_id: orderTwo, razorpay_payment_id: paymentTwo, razorpay_signature: sign(keySecret) }),
  });
  check(verified.status === 200 && verified.body?.status === "paid", "signed checkout callback pays the invoice");

  // Project request → proposal → invoice.
  await userPage.goto(`${base}/portal/projects/new?type=cloud_infrastructure&title=E2E%20migration`, { waitUntil: "networkidle0" });
  check(
    (await userPage.$eval("#project-title", (input) => input.value)) === "E2E migration" &&
      (await userPage.$eval("#project-type", (input) => input.value)) === "cloud_infrastructure",
    "request form is prefilled from the link",
  );
  await fill(userPage, "#project-requirements", "Move three web apps to managed cloud hosting.");
  await submit(userPage, "Send request");
  await userPage.waitForFunction(() => /\/portal\/projects\/[0-9a-f-]{36}$/.test(location.pathname));
  const projectId = new URL(userPage.url()).pathname.split("/").pop();
  check(true, "customer sends a project request");

  await adminPage.goto(`${base}/admin/projects`, { waitUntil: "networkidle0" });
  check((await adminPage.evaluate(() => document.body.innerText)).includes("E2E migration"), "admin sees the open request");
  await adminPage.goto(`${base}/admin/projects/${projectId}`, { waitUntil: "networkidle0" });
  await fill(adminPage, 'textarea[name="message"]', "Internal: check capacity first.");
  await adminPage.click('input[name="internal"]');
  await submit(adminPage, "Save");
  await waitForText(adminPage, "Internal note saved");
  await fill(adminPage, 'textarea[name="summary"]', "Migration of three apps with a week of support.");
  await fill(adminPage, 'input[name="amount"]', "5000");
  await submit(adminPage, "Send proposal");
  await popup(adminPage, "Send this proposal?", { button: "Send" });
  await waitForText(adminPage, "Proposal sent");
  check(true, "admin sends a proposal");

  await userPage.reload({ waitUntil: "networkidle0" });
  const projectText = await userPage.evaluate(() => document.body.innerText);
  check(!projectText.includes("check capacity"), "customer does not see internal notes");
  await submit(userPage, "Accept proposal");
  await popup(userPage, "Accept this proposal?", { button: "Accept" });
  await userPage.waitForFunction(() => /\/portal\/invoices\/[0-9a-f-]{36}$/.test(location.pathname));
  await userPage.waitForSelector("[data-invoice-total]");
  const proposalTotal = await userPage.$eval("[data-invoice-total]", (node) => node.textContent);
  check(/5,900\.00/.test(proposalTotal ?? ""), `accepted proposal is invoiced with GST (${proposalTotal})`);

  // Admin records a bank transfer for it.
  const proposalInvoice = invoiceIdFrom(userPage);
  await adminPage.goto(`${base}/admin/billing/invoices/${proposalInvoice}`, { waitUntil: "networkidle0" });
  await fill(adminPage, "#paid-note", "NEFT E2E reference");
  await submit(adminPage, "Mark paid");
  await popup(adminPage, "as received?", { button: "Mark paid" });
  await waitForText(adminPage, "Invoice marked paid");
  const projectStatus = withDb((db) => db.prepare(`SELECT status FROM projects WHERE id = ?`).get(projectId)?.status);
  check(projectStatus === "in_progress", "paying the proposal invoice starts the project");

  await adminPage.goto(`${base}/admin/settings?q=${encodeURIComponent("billing.")}#audit`, { waitUntil: "networkidle0" });
  const audit = await adminPage.evaluate(() => document.body.innerText);
  check(audit.includes("billing.razorpay") && audit.includes("billing.settings"), "billing changes are audited");
  check(!audit.includes(keySecret), "the audit log does not contain the Razorpay secret");
  await adminPage.goto(`${base}/admin/billing`, { waitUntil: "networkidle0" });
  await adminPage.screenshot({ path: `${shots}/billing_admin.png`, fullPage: true });
} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error);
  const pages = await browser.pages().catch(() => []);
  for (const [index, page] of pages.entries()) {
    await page.screenshot({ path: `${shots}/billing-failure-${index}.png`, fullPage: true }).catch(() => {});
  }
} finally {
  for (const account of [user, admin]) {
    try {
      const page = await session(account);
      const removed = await api(page, "/api/account", { method: "DELETE", body: JSON.stringify({ password: account.password }) });
      check(removed.status === 204, `cleanup: ${account.email} deleted`);
    } catch {
      check(false, `cleanup: could not delete ${account.email}`);
    }
  }
  withDb((db) => {
    db.prepare(`DELETE FROM products WHERE slug = ?`).run(slug);
    db.prepare(`DELETE FROM settings WHERE key IN ('billing.config', 'billing.razorpay')`).run();
    const restore = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)`);
    for (const row of savedSettings) restore.run(row.key, row.value, row.updated_at);
  });
  check(true, "cleanup: test plan removed and billing settings restored");
  await browser.close();
}

console.log(failures === 0 ? `\nBilling e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
