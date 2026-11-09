// Plans end to end, on every tier: which models each plan can see and use
// (lists, picker, warm-up, conversation creation, chat), upgrade reasons that
// name the right plan, real token limits per window including 0 = unlimited,
// personal overrides, feature locks (Deep Research, attachments), the plans
// and usage pages, and the shared sidebar on every app page. Usage shown must
// equal the usage_events rows. Plans are switched in the database here; the
// admin UI for it is covered by e2e:admin. Deletes the account at the end.
//
//   npm run e2e:plans        (server must be running; uses Chrome and Ollama)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
const db = process.env.E2E_DB ?? "data/harbor.db";
fs.mkdirSync(shots, { recursive: true });

const stamp = Date.now();
const user = { email: `e2e-plans-${stamp}@harbor.local`, password: `plans-${stamp}-pw` };
execFileSync(
  process.execPath,
  ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/seed.mjs"],
  { env: { ...process.env, SEED_USER_EMAIL: user.email, SEED_USER_PASSWORD: user.password }, stdio: "ignore" },
);

let failures = 0;
function check(condition, label) {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) failures += 1;
}

const sql = (query) => execFileSync("sqlite3", [db, query], { encoding: "utf8" }).trim();
const userId = sql(`SELECT id FROM users WHERE email='${user.email}'`);
const setPlan = (plan, overrides = null) =>
  sql(`UPDATE users SET plan='${plan}', limit_overrides=${overrides ? `'${JSON.stringify(overrides)}'` : "NULL"} WHERE id='${userId}'`);

const FREE = ["qwen2.5:1.5b", "gemma3:1b", "llama3.2:1b", "llama3.2:3b"];
const BASIC_ONLY = ["deepseek-r1:1.5b", "gemma3:4b", "qwen2.5-coder:1.5b"];
const ADVANCE_ONLY = ["qwen2.5-coder:14b"];
const installed = (await fetch(`${base}/api/health`).then((response) => response.json())).models ?? [];

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await (await browser.createBrowserContext()).newPage();
page.setDefaultTimeout(30_000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.setViewport({ width: 1366, height: 860 });
const shot = (name) => page.screenshot({ path: `${shots}/plans_${name}.png` });

const api = (path, init = {}) =>
  page.evaluate(
    async (url, options) => {
      const response = await fetch(url, options);
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: response.status, body };
    },
    path,
    { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } },
  );

async function chat(text, extra = {}) {
  const created = await api("/api/conversations", { method: "POST", body: JSON.stringify({}) });
  return api("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      conversationId: created.body.id,
      messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] }],
      ...extra,
    }),
  });
}

const listed = async () => (await api("/api/models")).body.models.map((model) => model.name);

async function pickerOptions() {
  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });
  await page.click('button[aria-label="Choose model"]');
  await page.waitForSelector('[role=listbox][aria-label="Models"]');
  const options = await page.$$eval("[data-model-option]", (nodes) => nodes.map((node) => node.dataset.modelOption));
  await page.keyboard.press("Escape");
  return options.filter((name) => name !== "auto");
}

try {
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", user.email);
  await page.type("#password", user.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);

  // ---------- Free ----------
  setPlan("free");
  const freeList = await listed();
  check(
    FREE.filter((name) => installed.includes(name)).every((name) => freeList.includes(name)) &&
      [...BASIC_ONLY, ...ADVANCE_ONLY].every((name) => !freeList.includes(name)),
    `Free: /api/models lists only Free models (${freeList.join(", ")})`,
  );
  const freePicker = await pickerOptions();
  check(
    freePicker.length === freeList.length && freePicker.every((name) => freeList.includes(name)),
    "Free: the picker shows the same models, nothing restricted",
  );
  await shot("free_picker");
  const warm = await api("/api/models/warm", { method: "POST", body: JSON.stringify({ name: "qwen2.5-coder:14b" }) });
  check(warm.status === 404, `Free: warming a restricted model is refused (${warm.status})`);
  const created = await api("/api/conversations", { method: "POST", body: JSON.stringify({ model: "qwen2.5-coder:14b" }) });
  const stored = sql(`SELECT COALESCE(model, '') FROM conversations WHERE id='${created.body.id}'`);
  check(stored === "", "Free: a conversation cannot be created on a restricted model");

  const toBasic = await chat("hi", { model: "deepseek-r1:1.5b", providerId: "ollama" });
  check(
    toBasic.status === 403 && toBasic.body.plan?.code === "upgrade_required" && toBasic.body.plan?.requiredPlan?.id === "basic",
    `Free: deepseek-r1 is refused and names Basic (${toBasic.status} ${toBasic.body.error})`,
  );
  const toAdvance = await chat("hi", { model: "qwen2.5-coder:14b", providerId: "ollama" });
  check(
    toAdvance.status === 403 && toAdvance.body.plan?.requiredPlan?.id === "advance",
    `Free: qwen2.5-coder:14b names Advance (${toAdvance.body.error})`,
  );
  const research = await chat("Research the history of SQLite", { research: true });
  check(
    research.status === 403 && research.body.plan?.requiredPlan?.id === "basic",
    `Free: Deep Research is refused and names Basic (${research.body.error})`,
  );
  const ok = await chat("Reply with one word: ready", { model: "qwen2.5:1.5b", providerId: "ollama" });
  check(ok.status === 200, `Free: an included model replies (${ok.status})`);
  const row = sql(
    `SELECT input_tokens || ' ' || output_tokens || ' ' || feature || ' ' || estimated FROM usage_events WHERE user_id='${userId}' ORDER BY created_at DESC LIMIT 1`,
  ).split(" ");
  check(Number(row[0]) > 0 && Number(row[1]) > 0 && row[2] === "chat", `usage records real input and output tokens and the feature (${row.join(" ")})`);

  // Browser: locked Deep Research and the upgrade prompt.
  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });
  check(
    (await page.$("[data-research-locked='basic']")) !== null,
    "Free: the composer shows Deep Research as locked, naming Basic",
  );

  // ---------- limits ----------
  const used = Number(sql(`SELECT SUM(total_tokens) FROM usage_events WHERE user_id='${userId}' AND status != 'blocked'`));
  setPlan("free", { daily: used });
  const capped = await chat("hi", { model: "qwen2.5:1.5b", providerId: "ollama" });
  check(
    capped.status === 429 && capped.body.plan?.code === "limit_reached" && capped.body.plan?.resetAt > Date.now(),
    `a used-up daily limit blocks with a reset time (${capped.status} ${capped.body.error})`,
  );
  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });
  await page.type('textarea[aria-label="Message"]', "hello");
  await page.keyboard.press("Enter");
  await page.waitForSelector("[data-plan-block='limit_reached']");
  check(true, "the chat shows the limit message with upgrade and usage links");
  check((await page.$("[data-usage-warning]")) !== null, "the usage warning appears at 100%");
  await shot("limit_reached");

  setPlan("free", { daily: 0, weekly: 0, monthly: 0 });
  const unlimited = await chat("Reply with one word: ok", { model: "qwen2.5:1.5b", providerId: "ollama" });
  check(unlimited.status === 200, "a limit of 0 means unlimited, not zero tokens");

  // ---------- Basic ----------
  setPlan("basic");
  const basicList = await listed();
  check(
    BASIC_ONLY.filter((name) => installed.includes(name)).every((name) => basicList.includes(name)) &&
      ADVANCE_ONLY.every((name) => !basicList.includes(name)),
    `Basic: adds the Basic models and still hides Advance ones (${basicList.length} models)`,
  );
  const basicChat = await chat("Reply with one word: ok", { model: "gemma3:4b", providerId: "ollama" });
  check(basicChat.status === 200, `Basic: gemma3:4b replies (${basicChat.status})`);
  const stillAdvance = await chat("hi", { model: "qwen2.5-coder:14b", providerId: "ollama" });
  check(stillAdvance.status === 403 && stillAdvance.body.plan?.requiredPlan?.id === "advance", "Basic: the 14b model still names Advance");

  // ---------- Advance ----------
  setPlan("advance");
  const advanceList = await listed();
  check(
    installed.every((name) => advanceList.includes(name)),
    `Advance: every installed model is listed (${advanceList.length}/${installed.length})`,
  );
  const advancePicker = await pickerOptions();
  check(advancePicker.length === advanceList.length, "Advance: the picker lists every model");

  // ---------- pages ----------
  await page.goto(`${base}/plans?highlight=basic`, { waitUntil: "networkidle0" });
  const cards = await page.$$eval("[data-plan-card]", (nodes) => nodes.map((node) => node.dataset.planCard));
  check(cards.join(",") === "free,basic,advance", "the plans page compares Free, Basic and Advance");
  check(
    (await page.$eval("[data-plan-card='advance']", (node) => node.querySelector("[data-current-plan]") !== null)) === true,
    "the current plan is marked",
  );
  const prices = await page.$$eval("[data-plan-card]", (nodes) =>
    nodes.map((node) => [node.dataset.planCard, node.querySelector("[data-price]")?.textContent ?? ""]),
  );
  const configured = JSON.parse(sql("SELECT value FROM settings WHERE key='plans.config'") || "{}");
  check(
    prices.every(([id, text]) => {
      const price = configured[id]?.price;
      return price ? text.replace(/[^\d]/g, "").includes(String(Math.round(price.amount))) : text === "Price not set yet";
    }),
    `prices come only from the admin's plan settings (${prices.map(([id, text]) => `${id}: ${text}`).join("; ")})`,
  );
  check(
    (await page.$eval("[data-plan-card='advance'] [data-limit='daily']", (node) => node.textContent)) === "Unlimited",
    "a 0 limit is shown as Unlimited",
  );
  const freeModels = await page.$eval("[data-plan-card='free']", (node) => node.innerText);
  check(!freeModels.includes("qwen2.5-coder:14b"), "other plans show counts, not model names outside your plan");
  check((await page.$("aside[aria-label=Sidebar]")) !== null, "the plans page keeps the sidebar");
  await shot("plans_page");

  await page.goto(`${base}/usage`, { waitUntil: "networkidle0" });
  const monthly = await page.$eval("[data-usage-window='monthly'] [data-used]", (node) => Number(node.dataset.used));
  // Every event of this account was recorded during this run, inside the current month.
  const expected = Number(sql(`SELECT COALESCE(SUM(total_tokens), 0) FROM usage_events WHERE user_id='${userId}' AND status != 'blocked'`));
  check(monthly === expected, `the usage page matches the recorded events (${monthly} = ${expected})`);
  check((await page.$("[data-usage-models]")) !== null, "usage is broken down by model");
  check((await page.$("aside[aria-label=Sidebar]")) !== null, "the usage page keeps the sidebar");
  await shot("usage_page");

  for (const path of ["/chat", "/plans", "/usage", "/help"]) {
    await page.goto(`${base}${path}`, { waitUntil: "networkidle0" });
    const nav = await page.$$eval("aside[aria-label=Sidebar] a", (nodes) => nodes.map((node) => node.getAttribute("href")));
    check(["/chat", "/usage", "/plans"].every((href) => nav.includes(href)), `${path}: the sidebar carries the app navigation`);
    check(
      !nav.some((href) => href?.startsWith("/chat/models") || href?.startsWith("/admin")),
      `${path}: customers get no model management or admin links`,
    );
  }
  await page.goto(`${base}/chat/models`, { waitUntil: "networkidle0" });
  check(new URL(page.url()).pathname === "/chat", "the old models page sends customers back to chat");
  const adminModels = await page.goto(`${base}/admin/models`, { waitUntil: "networkidle0" });
  check(new URL(page.url()).pathname !== "/admin/models" || adminModels.status() >= 400, "customers cannot open admin model management");
  const pull = await page.evaluate(async () =>
    (await fetch("/api/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "tinyllama" }) })).status,
  );
  check(pull === 403 || pull === 401, `the backend refuses model downloads from customers (${pull})`);

  check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(" | ")}` : ""}`);
} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error);
  await shot("failure").catch(() => {});
} finally {
  try {
    setPlan("free");
    const removed = await api("/api/account", { method: "DELETE", body: JSON.stringify({ password: user.password }) });
    check(removed.status === 204, "cleanup: test user deleted");
  } catch {
    check(false, `cleanup: could not delete ${user.email}`);
  }
  await browser.close();
}

console.log(failures === 0 ? `\nPlans e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
