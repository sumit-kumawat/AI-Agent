// Browser test for the admin panel. Seeds a throwaway admin and user, drives
// the real UI in headless Chrome as the admin, checks each effect from the
// user's session, restores settings, then deletes both accounts.
//
//   npm run e2e:admin              (server must be running; uses Chrome)
//   CHROME_PATH=/path/to/chrome E2E_URL=http://host:3000 npm run e2e:admin
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
fs.mkdirSync(shots, { recursive: true });

const stamp = Date.now();
const admin = { email: `e2e-admin-${stamp}@harbor.local`, password: `admin-${stamp}-pw` };
const user = { email: `e2e-user-${stamp}@harbor.local`, password: `user-${stamp}-pw` };

// Seeded the way production is: ADMIN_EMAIL plus an escaped bcrypt hash, so the
// admin starts on a password it must change.
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
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", account.email);
  await page.type("#password", account.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
  return page;
}

/** Fills the forced change-password form and waits for the redirect away from it. */
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

/** Calls the API from inside the page so the session cookie is used. */
function api(page, path, init = {}) {
  return page.evaluate(
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
}

async function chat(page, text, model) {
  const created = await api(page, "/api/conversations", { method: "POST", body: JSON.stringify({ model }) });
  const conversationId = created.body?.id;
  const response = await api(page, "/api/chat", {
    method: "POST",
    body: JSON.stringify({
      conversationId,
      messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] }],
      ...(model ? { model } : {}),
    }),
  });
  return { ...response, conversationId };
}

async function clickText(page, text, scope = "") {
  const handle = await page.waitForSelector(`${scope} ::-p-text(${text})`, { visible: true });
  await handle.click();
}

async function userRowAction(page, email, item) {
  await page.goto(`${base}/admin/users?q=${encodeURIComponent(email)}`, { waitUntil: "networkidle0" });
  await page.click(`button[aria-label="Actions for ${email}"]`);
  await clickText(page, item, "[role=menu]");
}

/**
 * Waits for the in-app lightbox popup whose text includes `title`, optionally
 * types into its input, presses `button` (or the primary button), and waits
 * for that popup to close.
 */
async function popup(page, title, { input, button } = {}) {
  const find = (value) =>
    [...document.querySelectorAll("[role=alertdialog]")].find((node) => node.innerText.includes(value)) ?? null;
  await page.waitForFunction(find, {}, title);
  const dialog = await page.evaluateHandle(find, title);
  if (input !== undefined) await (await dialog.$("input")).type(input);
  const clicked = await dialog.evaluate((node, label) => {
    const target = label
      ? [...node.querySelectorAll("button")].find((item) => item.innerText.trim() === label)
      : node.querySelector("button[type=submit]");
    target?.click();
    return Boolean(target);
  }, button ?? null);
  if (!clicked) throw new Error(`popup "${title}" has no "${button ?? "submit"}" button`);
  await page.waitForFunction(
    (value) =>
      ![...document.querySelectorAll("[role=alertdialog]")].some((node) => node.innerText.includes(value)),
    {},
    title,
  );
}

async function waitForText(page, text) {
  await page.waitForFunction((value) => document.body.innerText.includes(value), {}, text);
}

try {
  const userPage = await session(user);
  check(userPage.url().endsWith("/chat"), "user signs in");
  await userPage.goto(`${base}/admin`, { waitUntil: "networkidle0" });
  check(!userPage.url().includes("/admin"), "non-admin is redirected away from /admin");

  const wrong = await (await browser.createBrowserContext()).newPage();
  await wrong.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await wrong.type("#email", admin.email);
  await wrong.type("#password", "definitely-wrong");
  await wrong.click("button[type=submit]");
  await wrong.waitForSelector("[role=alertdialog]");
  await wrong.screenshot({ path: `${shots}/login_error_popup.png` });
  await popup(wrong, "Sign-in failed");
  check(true, "a wrong password shows the sign-in error popup");

  const adminPage = await session(admin);
  check(adminPage.url().includes("/account/password"), "seeded admin is sent to change password on first sign-in");
  await adminPage.goto(`${base}/admin`, { waitUntil: "networkidle0" });
  check(adminPage.url().includes("/account/password"), "admin panel stays locked until the password changes");
  const locked = await api(adminPage, "/api/models", { method: "POST", body: JSON.stringify({ name: "x" }) });
  check(locked.status === 403 || locked.status === 401, `admin APIs refuse a first-login admin (${locked.status})`);
  await adminPage.screenshot({ path: `${shots}/account_password_forced.png`, fullPage: true });
  await adminPage.goto(`${base}/account/password?next=/admin`, { waitUntil: "networkidle0" });
  await changePassword(adminPage, admin, `admin-${stamp}-changed`);
  check(new URL(adminPage.url()).pathname === "/admin", "after changing it, the admin lands on /admin");
  check(
    !(await adminPage.evaluate(() => document.body.innerText)).includes("A Product Of"),
    "the admin panel carries no promotional credit",
  );
  for (const path of ["/admin", "/admin/users", "/admin/usage", "/admin/plans", "/admin/agents", "/admin/providers", "/admin/research", "/admin/settings", "/admin/conversations"]) {
    const response = await adminPage.goto(`${base}${path}`, { waitUntil: "networkidle0" });
    check(response.status() === 200 && adminPage.url().endsWith(path), `admin opens ${path}`);
    await adminPage.screenshot({ path: `${shots}/${path.replaceAll("/", "_").slice(1) || "admin"}.png`, fullPage: true });
  }

  // Plans editor: saving unchanged plans round-trips and is audited.
  await adminPage.goto(`${base}/admin/plans`, { waitUntil: "networkidle0" });
  await adminPage.click("[data-plan-tab='basic']");
  await adminPage.waitForSelector("[data-plan-form='basic']");
  await adminPage.click("[data-save-plans]");
  await popup(adminPage, "Plans saved");
  check(true, "the plans editor saves");

  // Models: disable one, confirm users lose it, enable it again.
  const models = (await api(userPage, "/api/models")).body.models.map((model) => model.name);
  const target = models.find((name) => name !== "qwen2.5-coder:14b") ?? models[0];
  await adminPage.goto(`${base}/admin/agents`, { waitUntil: "networkidle0" });
  await adminPage.click(`button[aria-label="Disable ${target}"]`);
  await adminPage.waitForSelector(`button[aria-label="Enable ${target}"]`);
  const afterDisable = (await api(userPage, "/api/models")).body.models.map((model) => model.name);
  check(!afterDisable.includes(target), `disabled model ${target} hidden from users`);
  check((await chat(userPage, "hi", target)).status === 400, "chat with a disabled model is rejected");
  await adminPage.click(`button[aria-label="Enable ${target}"]`);
  await adminPage.waitForSelector(`button[aria-label="Disable ${target}"]`);
  check((await api(userPage, "/api/models")).body.models.some((model) => model.name === target), "re-enabled model is back");

  // Agent toggle.
  await adminPage.click('button[aria-label="Disable Ollama chat"]');
  await adminPage.waitForSelector('button[aria-label="Enable Ollama chat"]');
  const off = await chat(userPage, "hi");
  check(off.status === 503 && /turned off/.test(off.body?.error ?? ""), "disabled agent rejects chat");
  await adminPage.click('button[aria-label="Enable Ollama chat"]');
  await adminPage.waitForSelector('button[aria-label="Disable Ollama chat"]');
  check((await chat(userPage, "Reply with one word: ok", target)).status === 200, "re-enabled agent accepts chat");

  // Kill a running session. The slow 14b model is on the Advance plan only.
  const planDb = new Database(path.join(process.env.DATA_DIR ?? "data", "harbor.db"));
  planDb.prepare("UPDATE users SET plan = 'advance' WHERE email = ?").run(user.email);
  planDb.close();
  const longConversation = (await api(userPage, "/api/conversations", { method: "POST", body: "{}" })).body.id;
  const pendingChat = userPage.evaluate(async (conversationId) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        model: "qwen2.5-coder:14b",
        messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "Write a 2000 word essay about harbors." }] }],
      }),
    });
    const text = await response.text();
    return { status: response.status, length: text.length };
  }, longConversation);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await adminPage.goto(`${base}/admin/agents`, { waitUntil: "networkidle0" });
  await adminPage.waitForSelector("::-p-text(Kill)");
  await adminPage.screenshot({ path: `${shots}/admin_agents_running.png`, fullPage: true });
  await clickText(adminPage, "Kill");
  await popup(adminPage, "Stop this session?", { button: "Stop session" });
  await popup(adminPage, "Session stopped");
  const killed = await Promise.race([pendingChat, new Promise((resolve) => setTimeout(() => resolve(null), 20_000))]);
  check(killed !== null, "killed session ends the user's stream");

  // Plan and personal limits.
  await userRowAction(adminPage, user.email, "Change plan and limits");
  await adminPage.waitForSelector('input[name="monthly"]');
  await adminPage.waitForFunction(() => {
    const dialog = document.querySelector("[role=dialog]");
    return dialog && dialog.getAnimations({ subtree: true }).every((animation) => animation.playState === "finished");
  });
  await adminPage.select('select[name="plan"]', "basic");
  await adminPage.type('input[name="monthly"]', "1");
  await clickText(adminPage, "Save", "[role=dialog]");
  await popup(adminPage, "Plan and limits saved");
  await adminPage.waitForSelector("[role=dialog]", { hidden: true });
  await adminPage
    .waitForFunction((email) => {
      const row = [...document.querySelectorAll("tr")].find((tr) => tr.innerText.includes(email));
      return /Basic/.test(row?.innerText ?? "") && /\/\s*1 this month/.test(row?.innerText ?? "");
    }, {}, user.email)
    .catch(async (error) => {
      const row = await adminPage.evaluate(
        (email) => [...document.querySelectorAll("tr")].find((tr) => tr.innerText.includes(email))?.innerText ?? "(row not found)",
        user.email,
      );
      throw new Error(`plan and quota not shown for the user; row reads: ${row.replace(/\s+/g, " ")}`, { cause: error });
    });
  const overQuota = await chat(userPage, "hi");
  check(
    overQuota.status === 429 && overQuota.body?.plan?.code === "limit_reached" && /allowance/.test(overQuota.body?.error ?? ""),
    "user over a personal limit is blocked with a limit_reached reason",
  );
  await userRowAction(adminPage, user.email, "Change plan and limits");
  await adminPage.waitForSelector('input[name="monthly"]');
  await adminPage.$eval('input[name="monthly"]', (input) => (input.value = ""));
  await adminPage.type('input[name="monthly"]', "0");
  await clickText(adminPage, "Save", "[role=dialog]");
  await popup(adminPage, "Plan and limits saved");
  await adminPage.waitForSelector("[role=dialog]", { hidden: true });
  check((await chat(userPage, "Reply with one word: ok", target)).status === 200, "a limit of 0 means unlimited: chat works again");

  // Settings: blocklist and rate limit.
  await adminPage.goto(`${base}/admin/settings`, { waitUntil: "networkidle0" });
  await adminPage.$eval("#keywords", (input) => (input.value = "forbiddenword"));
  await clickText(adminPage, "Save settings");
  await popup(adminPage, "Settings saved");
  const blocked = await chat(userPage, "this has forbiddenword inside");
  check(blocked.status === 400, `blocklisted keyword is rejected (${blocked.status})`);
  await adminPage.goto(`${base}/admin/settings`, { waitUntil: "networkidle0" });
  await adminPage.$eval("#rate", (input) => (input.value = "2"));
  await clickText(adminPage, "Save settings");
  await popup(adminPage, "Settings saved");
  const statuses = [];
  for (let attempt = 0; attempt < 3; attempt += 1) statuses.push((await chat(userPage, "Reply with one word: ok", target)).status);
  check(statuses.includes(429), `global rate limit applies (${statuses.join(", ")})`);
  await adminPage.$eval("#keywords", (input) => (input.value = ""));
  await adminPage.$eval("#rate", (input) => (input.value = "30"));
  await clickText(adminPage, "Save settings");
  await popup(adminPage, "Settings saved");

  // Usage dashboard shows the rate-limit hit and token usage.
  await adminPage.goto(`${base}/admin/usage?period=daily`, { waitUntil: "networkidle0" });
  const usageText = await adminPage.evaluate(() => document.body.innerText);
  check(usageText.includes(user.email), "usage dashboard lists the user");
  check(/chat/.test(usageText) && usageText.includes("Rate-limit hits"), "rate-limit log renders");
  await adminPage.screenshot({ path: `${shots}/admin_usage_data.png`, fullPage: true });

  // Conversation audit: flag and delete a message.
  await adminPage.goto(`${base}/admin/conversations?email=${encodeURIComponent(user.email)}`, { waitUntil: "networkidle0" });
  await adminPage.waitForSelector('table a[href^="/admin/conversations/"]');
  const withMessages = await adminPage.$$eval("tbody tr", (rows) => {
    const row = rows.find((tr) => Number(tr.children[3]?.textContent?.replace(/\D/g, "") || 0) > 0);
    return row?.querySelector('a[href^="/admin/conversations/"]')?.getAttribute("href") ?? null;
  });
  check(Boolean(withMessages), "audit search finds the user's conversations");
  await adminPage.goto(`${base}${withMessages}`, { waitUntil: "networkidle0" });
  check((await adminPage.$$("ol > li")).length === 0, "messages stay hidden until a reason is recorded");
  await adminPage.type('textarea[name="reason"]', "e2e: investigating a support request");
  await clickText(adminPage, "Record reason and view", "form");
  await adminPage.waitForSelector("[data-access-granted]");
  await adminPage.waitForSelector("ol > li");
  check(true, "recording a reason unlocks the conversation");
  await clickText(adminPage, "Flag", "ol");
  await popup(adminPage, "Flag this message?", { input: "e2e flag reason" });
  await popup(adminPage, "Message flagged");
  await waitForText(adminPage, "e2e flag reason");
  check(true, "message flagged with a reason");
  const before = await adminPage.$$eval("ol > li", (items) => items.length);
  await clickText(adminPage, "Delete", "ol");
  await popup(adminPage, "Delete this message?", { button: "Cancel" });
  check((await adminPage.$$eval("ol > li", (items) => items.length)) === before, "cancelling the delete popup keeps the message");
  await clickText(adminPage, "Delete", "ol");
  await popup(adminPage, "Delete this message?", { button: "Delete" });
  await popup(adminPage, "Message deleted");
  await adminPage.waitForFunction((count) => document.querySelectorAll("ol > li").length === count - 1, {}, before);
  check(true, "message deleted");

  // Suspend and reactivate.
  await userRowAction(adminPage, user.email, "Suspend");
  await popup(adminPage, "Suspend account?", { button: "Suspend" });
  await popup(adminPage, "Account suspended");
  await waitForText(adminPage, "suspended");
  check((await api(userPage, "/api/conversations")).status === 401, "suspended user's session stops working");
  await userRowAction(adminPage, user.email, "Reactivate");
  await popup(adminPage, "Reactivate account?");
  await popup(adminPage, "Account reactivated");
  await adminPage.waitForFunction(() => !document.body.innerText.includes("suspended"));

  // Reset password: old session ends, temporary password works.
  await userRowAction(adminPage, user.email, "Reset password");
  await popup(adminPage, "Reset password?", { button: "Reset password" });
  const tempInput = await adminPage.waitForSelector("[role=dialog] input[readonly]");
  const temporary = await tempInput.evaluate((input) => input.value);
  check(temporary.length >= 12, "temporary password shown once");
  await clickText(adminPage, "Done", "[role=dialog]");
  const resetAccount = { email: user.email, password: temporary };
  const relogged = await session(resetAccount);
  check(relogged.url().includes("/account/password"), "temporary password forces a password change");
  await changePassword(relogged, resetAccount, `user-${stamp}-changed`);
  check(new URL(relogged.url()).pathname === "/chat", "user reaches chat after choosing a new password");
  user.password = resetAccount.password;

  // Role change.
  await userRowAction(adminPage, user.email, "Change role to Administrator");
  await popup(adminPage, "an Administrator?");
  await popup(adminPage, "Role updated");
  await adminPage.waitForFunction((email) => {
    const row = [...document.querySelectorAll("tr")].find((tr) => tr.innerText.includes(email));
    return row?.innerText.includes("Administrator");
  }, {}, user.email);
  await relogged.goto(`${base}/admin`, { waitUntil: "networkidle0" });
  check(relogged.url().endsWith("/admin"), "promoted user can open /admin immediately");
  await userRowAction(adminPage, user.email, "Change role to User");
  await popup(adminPage, "a regular user?");
  await popup(adminPage, "Role updated");
  await relogged.goto(`${base}/admin/users`, { waitUntil: "networkidle0" });
  check(!relogged.url().includes("/admin"), "demoted user loses /admin immediately");

  // Providers: a saved key is encrypted, a failed check stays failed, and a
  // cloud model is refused until the user allows it.
  const secret = "sk-test-conzex-phase5-key";
  const dbFile = path.join(process.env.DATA_DIR ?? "data", "harbor.db");
    const withDb = (fn) => {
    const db = new Database(dbFile);
    db.pragma("busy_timeout = 5000");
    try {
      return fn(db);
    } finally {
      db.close();
    }
  };
  const resetOpenAi = () =>
    withDb((db) => {
      db.prepare(
        `UPDATE providers SET api_key_enc=NULL, api_key_hint=NULL, enabled=0, health_ok=NULL, health_at=NULL, health_error=NULL WHERE id='openai'`,
      ).run();
      db.prepare(`DELETE FROM provider_models WHERE provider_id='openai' AND model_id='gpt-test-blocked'`).run();
    });
  try {
    await adminPage.goto(`${base}/admin/providers`, { waitUntil: "networkidle0" });
    const openaiStatus = await adminPage.$eval(
      '[data-provider="openai"] [data-provider-status]',
      (node) => node.textContent,
    );
    check(openaiStatus === "Off", "OpenAI starts turned off");
    for (const id of ["ollama", "openai", "anthropic", "google"]) {
      check(Boolean(await adminPage.$(`[data-provider="${id}"]`)), `providers page shows ${id}`);
    }
    await adminPage.click('[data-provider="openai"] [role=switch]');
    await adminPage.evaluate(() => {
      const card = document.querySelector('[data-provider="openai"]');
      [...card.querySelectorAll("button")].find((button) => button.textContent.trim() === "Save")?.click();
    });
    await adminPage.waitForFunction(() => document.body.innerText.includes("Provider saved"));
    await adminPage.goto(`${base}/admin/providers`, { waitUntil: "networkidle0" });
    check(
      (await adminPage.$eval('[data-provider="openai"] [data-provider-status]', (node) => node.textContent)) ===
        "Needs an API key",
      "an enabled cloud provider without a key is not ready",
    );
    await adminPage.type('[data-provider="openai"] input[name="apiKey"]', secret);
    await adminPage.evaluate(() => {
      const card = document.querySelector('[data-provider="openai"]');
      [...card.querySelectorAll("button")].find((button) => button.textContent.trim() === "Save")?.click();
    });
    await adminPage.waitForFunction(() => document.body.innerText.includes("Provider saved"));
    await adminPage.goto(`${base}/admin/providers`, { waitUntil: "networkidle0" });
    const placeholder = await adminPage.$eval(
      '[data-provider="openai"] input[name="apiKey"]',
      (node) => node.placeholder,
    );
    const html = await adminPage.content();
    check(placeholder.includes("…") && !placeholder.includes(secret), "a saved key is shown only as a hint");
    check(!html.includes(secret), "the API key is not in the page");
    const stored = withDb((db) => db.prepare(`SELECT api_key_enc FROM providers WHERE id='openai'`).get());
    check(
      typeof stored?.api_key_enc === "string" && stored.api_key_enc.startsWith("v1.") && !stored.api_key_enc.includes(secret),
      "the API key is encrypted at rest",
    );
    await adminPage.evaluate(() => {
      const card = document.querySelector('[data-provider="openai"]');
      [...card.querySelectorAll("button")].find((button) => button.textContent.trim() === "Check connection")?.click();
    });
    await popup(adminPage, "Connection failed");
    const afterCheck = await adminPage.$eval(
      '[data-provider="openai"] [data-provider-status]',
      (node) => node.textContent,
    );
    check(afterCheck !== "Ready" && afterCheck !== "Local", "a failed check is not shown as ready");
    await adminPage.goto(`${base}/chat`, { waitUntil: "networkidle0" });
    await adminPage.click('button[aria-label="Choose model"]');
    await adminPage.waitForSelector('[role=listbox][aria-label="Models"]');
    const menu = await adminPage.$eval('[role=listbox][aria-label="Models"]', (node) => node.innerText);
    await adminPage.keyboard.press("Escape");
    check(!menu.includes("OpenAI") && !menu.includes("gpt-test"), "chat only lists models that passed a check");
    withDb((db) => {
      db.prepare(
        `UPDATE providers SET enabled=1, health_ok=1, health_at=?, health_error=NULL WHERE id='openai'`,
      ).run(Date.now());
      db.prepare(
        `INSERT INTO provider_models (provider_id, model_id, enabled, available, input_per_million, output_per_million, updated_at)
         VALUES ('openai', 'gpt-test-blocked', 1, 1, NULL, NULL, ?)`,
      ).run(Date.now());
    });
    const created = await api(adminPage, "/api/conversations", { method: "POST", body: "{}" });
    const blocked = await api(adminPage, "/api/chat", {
      method: "POST",
      body: JSON.stringify({
        conversationId: created.body?.id,
        providerId: "openai",
        model: "gpt-test-blocked",
        messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "hi" }] }],
      }),
    });
    check(blocked.status === 403 && String(blocked.body?.error ?? "").includes("Allow cloud models"), "a cloud model is refused until the user allows it");
  } finally {
    resetOpenAi();
  }

  // Audit log recorded the actions.
  await adminPage.goto(`${base}/admin/settings?q=${encodeURIComponent("user.")}#audit`, { waitUntil: "networkidle0" });
  const auditText = await adminPage.evaluate(() => document.body.innerText);
  for (const action of ["user.plan", "user.suspend", "user.password_reset", "user.role"]) {
    check(auditText.includes(action), `audit log has ${action}`);
  }
  await adminPage.goto(`${base}/admin/settings`, { waitUntil: "networkidle0" });
  const fullAudit = await adminPage.evaluate(() => document.body.innerText);
  for (const action of ["settings.update", "session.kill", "message.delete", "agent.update", "conversation.content_access"]) {
    check(fullAudit.includes(action), `audit log has ${action}`);
  }
  await adminPage.goto(`${base}/admin/settings?q=${encodeURIComponent("model.enable")}#audit`, { waitUntil: "networkidle0" });
  check((await adminPage.evaluate(() => document.body.innerText)).includes("model.enable"), "audit log has model.enable");
  await adminPage.goto(`${base}/admin/settings?q=${encodeURIComponent("plans.update")}#audit`, { waitUntil: "networkidle0" });
  check((await adminPage.evaluate(() => document.body.innerText)).includes("plans.update"), "audit log has plans.update");
  await adminPage.goto(`${base}/admin/settings?q=${encodeURIComponent("provider.")}#audit`, { waitUntil: "networkidle0" });
  const providerAudit = await adminPage.evaluate(() => document.body.innerText);
  check(providerAudit.includes("provider.update") && providerAudit.includes("provider.health"), "provider changes are audited");
  check(!providerAudit.includes(secret), "the audit log does not contain the API key");

} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error);
  const pages = await browser.pages().catch(() => []);
  for (const [index, page] of pages.entries()) {
    await page.screenshot({ path: `${shots}/failure-${index}.png`, fullPage: true }).catch(() => {});
  }
} finally {
  // Both throwaway accounts delete themselves, even after a failure.
  // E2E_CLEANUP_STAMPS removes accounts left behind by an interrupted earlier run.
  const leftovers = (process.env.E2E_CLEANUP_STAMPS ?? "").split(",").filter(Boolean).flatMap((old) => [
    { email: `e2e-user-${old}@harbor.local`, password: `user-${old}-changed` },
    { email: `e2e-admin-${old}@harbor.local`, password: `admin-${old}-changed` },
  ]);
  for (const account of [user, ...leftovers, admin]) {
    try {
      const page = await session(account);
      const removed = await api(page, "/api/account", { method: "DELETE", body: JSON.stringify({ password: account.password }) });
      check(removed.status === 204, `cleanup: ${account.email} deleted`);
    } catch {
      check(false, `cleanup: could not delete ${account.email}`);
    }
  }
  await browser.close();
}

console.log(failures === 0 ? `\nAdmin e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
