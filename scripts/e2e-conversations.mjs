// Browser test for admin conversation management and customer-facing assistant
// names. Seeds a throwaway admin and user with conversations, drives the real
// admin UI in headless Chrome, checks the database and audit log, restores
// settings, then deletes both accounts.
//
//   node scripts/e2e-conversations.mjs        (server must be running; uses Chrome)
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import Database from "better-sqlite3";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
fs.mkdirSync(shots, { recursive: true });

const stamp = Date.now();
const admin = { email: `e2e-cadmin-${stamp}@harbor.local`, password: `admin-${stamp}-pw` };
const user = { email: `e2e-cuser-${stamp}@harbor.local`, password: `user-${stamp}-pw` };
for (const account of [admin, user]) {
  execFileSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/seed.mjs"],
    {
      env: { ...process.env, SEED_USER_EMAIL: account.email, SEED_USER_PASSWORD: account.password, SEED_USER_PLAN: "advance", ADMIN_EMAIL: "", ADMIN_PASSWORD_HASH: "" },
      stdio: "ignore",
    },
  );
}

const withDb = (work) => {
  const db = new Database("data/harbor.db");
  db.pragma("foreign_keys = ON");
  try {
    return work(db);
  } finally {
    db.close();
  }
};
withDb((db) => db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(admin.email));
const userId = withDb((db) => db.prepare("SELECT id FROM users WHERE email = ?").get(user.email).id);

const DAY = 24 * 60 * 60 * 1000;
function seedConversation(title, ageDays, pinned = false) {
  const id = crypto.randomUUID();
  const at = Date.now() - ageDays * DAY;
  withDb((db) => {
    db.prepare("INSERT INTO conversations (id, user_id, title, created_at, updated_at, pinned_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      userId,
      title,
      at,
      at,
      pinned ? at : null,
    );
    const add = db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)");
    add.run(crypto.randomUUID(), id, "user", `question for ${title}`, at);
    add.run(crypto.randomUUID(), id, "assistant", `answer for ${title}`, at + 1);
  });
  return id;
}
const fresh = [seedConversation(`e2e fresh A ${stamp}`, 0), seedConversation(`e2e fresh B ${stamp}`, 0)];
const old = seedConversation(`e2e old ${stamp}`, 400);
const oldPinned = seedConversation(`e2e old pinned ${stamp}`, 400, true);
const exists = (id) => withDb((db) => Boolean(db.prepare("SELECT 1 FROM conversations WHERE id = ?").get(id)));
const audited = (action, id) =>
  withDb((db) => db.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = ? AND target_id = ?").get(action, id).n);

let failures = 0;
function check(ok, label) {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
async function session(account) {
  const page = await (await browser.createBrowserContext()).newPage();
  page.setDefaultTimeout(20_000);
  await page.setViewport({ width: 1366, height: 900 });
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", account.email);
  await page.type("#password", account.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
  return page;
}
const api = (page, path, init = {}) =>
  page.evaluate(
    async (url, options) => {
      const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers ?? {}) } });
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {}
      return { status: response.status, body };
    },
    path,
    init,
  );
async function popup(page, title, button) {
  const find = (value) => [...document.querySelectorAll("[role=alertdialog]")].find((node) => node.innerText.includes(value)) ?? null;
  await page.waitForFunction(find, {}, title);
  await page.evaluate(
    (value, label) => {
      const node = [...document.querySelectorAll("[role=alertdialog]")].find((item) => item.innerText.includes(value));
      const target = label ? [...node.querySelectorAll("button")].find((item) => item.innerText.trim() === label) : node.querySelector("button[type=submit]");
      target?.click();
    },
    title,
    button ?? null,
  );
  await page.waitForFunction((value) => ![...document.querySelectorAll("[role=alertdialog]")].some((node) => node.innerText.includes(value)), {}, title);
}

try {
  const adminPage = await session(admin);
  const userPage = await session(user);

  // ---------- export ----------
  const noReason = await api(adminPage, "/api/admin/conversations/export", { method: "POST", body: JSON.stringify({ ids: fresh, reason: "short" }) });
  check(noReason.status === 400, "export without a proper reason is refused");
  const asUser = await api(userPage, "/api/admin/conversations/export", { method: "POST", body: JSON.stringify({ ids: fresh, reason: "a long enough reason" }) });
  check(asUser.status === 403, "customers cannot export conversations");
  const exported = await api(adminPage, "/api/admin/conversations/export", {
    method: "POST",
    body: JSON.stringify({ ids: fresh, reason: "e2e: support request export" }),
  });
  check(
    exported.status === 200 &&
      exported.body.conversations.length === 2 &&
      exported.body.conversations.every((conversation) => conversation.messages.length === 2),
    "export returns both conversations with their messages",
  );
  check(fresh.every((id) => audited("conversation.export", id) === 1), "each exported conversation is in the audit log");

  // ---------- bulk delete ----------
  await adminPage.goto(`${base}/admin/conversations?q=${encodeURIComponent(`e2e fresh`)}`, { waitUntil: "networkidle0" });
  for (const id of fresh) await adminPage.click(`[data-select-conversation="${id}"]`);
  await adminPage.waitForSelector("[data-bulk-actions]");
  await adminPage.click('[data-bulk="delete"]');
  await adminPage.waitForSelector('[data-conversation-delete] [data-affected="conversations"]');
  await adminPage.waitForFunction(() => document.querySelector('[data-affected="conversations"]')?.textContent?.trim().startsWith("2 from 1 user"));
  const messagesShown = await adminPage.$eval('[data-affected="messages"]', (node) => node.textContent.trim());
  check(messagesShown === "4", `the delete preview counts 2 conversations and 4 messages (${messagesShown})`);
  check(
    await adminPage.$eval("[data-conversation-confirm]", (node) => node.disabled),
    "delete stays disabled until DELETE is typed",
  );
  await adminPage.type("[data-conversation-delete] input", "DELETE");
  await adminPage.click("[data-conversation-confirm]");
  await adminPage.waitForFunction(() => document.body.innerText.includes("2 conversations deleted"));
  check(fresh.every((id) => !exists(id)), "bulk delete removes the selected conversations");
  check(fresh.every((id) => audited("conversation.delete", id) === 1), "each deleted conversation is in the audit log");
  check(exists(old) && exists(oldPinned), "unselected conversations are untouched");
  await adminPage.screenshot({ path: `${shots}/conversations_bulk.png` });

  // ---------- retention ----------
  // Retention applies to every account, so it is only exercised when no real chat would be removed.
  const others = withDb(
    (db) =>
      db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id != ? AND pinned_at IS NULL AND updated_at < ?").get(userId, Date.now() - 365 * DAY).n,
  );
  if (others > 0) {
    console.log(`skip retention: ${others} real conversation(s) are older than 365 days`);
  } else {
  await adminPage.goto(`${base}/admin/conversations`, { waitUntil: "networkidle0" });
  await adminPage.$eval("#retention-days", (input) => input.select());
  await adminPage.type("#retention-days", "365");
  await adminPage.click("[data-retention-form] button[type=submit]");
  await popup(adminPage, "Delete", "Cancel");
  check(exists(old), "cancelling the retention warning deletes nothing");
  await adminPage.click("[data-retention-form] button[type=submit]");
  await popup(adminPage, "Delete", "Save and delete");
  await adminPage.waitForFunction(() => document.body.innerText.includes("Retention saved"));
  check(!exists(old), "retention deletes chats older than the limit");
  check(exists(oldPinned), "retention keeps pinned chats");
  await adminPage.goto(`${base}/admin/conversations`, { waitUntil: "networkidle0" });
  await adminPage.$eval("#retention-days", (input) => input.select());
  await adminPage.type("#retention-days", "0");
  await adminPage.click("[data-retention-form] button[type=submit]");
  await adminPage.waitForFunction(() => document.body.innerText.includes("Retention saved"));
  check(
    withDb((db) => db.prepare("SELECT value FROM settings WHERE key = 'conversationRetentionDays'").get()?.value ?? "0") === "0",
    "retention can be turned off again",
  );
  }

  // ---------- assistant names ----------
  await adminPage.goto(`${base}/admin/models#names`, { waitUntil: "networkidle0" });
  const rows = await adminPage.$$eval("[data-assistant-row]", (nodes) => nodes.map((node) => node.dataset.assistantRow));
  check(rows.length > 0, `admins see every assistant with its model ID (${rows.length})`);
  const target = rows[0];
  const otherName = await adminPage.$eval(`[data-assistant-row="${rows[1] ?? rows[0]}"] [data-assistant-name-input]`, (node) => node.placeholder);
  const input = `[data-assistant-row="${target}"] [data-assistant-name-input]`;
  await adminPage.type(input, otherName);
  await adminPage.click(`[data-assistant-row="${target}"] [data-assistant-save]`);
  if (rows.length > 1) {
    await adminPage.waitForFunction(() => document.body.innerText.includes("already used by another assistant"));
    check(true, "a name already used by another assistant is refused");
    await adminPage.keyboard.press("Escape");
  }
  const custom = `E2E Helper ${stamp % 1000}`;
  await adminPage.$eval(input, (node) => node.select());
  await adminPage.type(input, custom);
  await adminPage.click(`[data-assistant-row="${target}"] [data-assistant-save]`);
  await adminPage.waitForFunction((value) => document.body.innerText.includes(`Saved as ${value}`), {}, custom);
  await userPage.goto(`${base}/chat`, { waitUntil: "networkidle0" });
  await userPage.click('button[aria-label="Choose assistant"]');
  await userPage.waitForSelector(`[data-model-option="${target}"]`);
  const shown = await userPage.$eval(`[data-model-option="${target}"] [data-assistant-name]`, (node) => node.textContent.trim());
  check(shown === custom, `customers see the admin's name (${shown})`);
  await userPage.keyboard.press("Escape");
  await adminPage.goto(`${base}/admin/models#names`, { waitUntil: "networkidle0" });
  await adminPage.click(`[data-assistant-row="${target}"] button[aria-label="Use the generated name"]`);
  await adminPage.waitForFunction(() => document.body.innerText.includes("Saved as xAI "));
  check(withDb((db) => db.prepare("SELECT COUNT(*) AS n FROM model_branding").get().n) === 0, "resetting removes the override");
} catch (error) {
  check(false, `unexpected error: ${error.stack ?? error}`);
} finally {
  await browser.close();
  withDb((db) => {
    db.prepare("DELETE FROM model_branding WHERE display_name LIKE 'E2E Helper%'").run();
    for (const account of [admin, user]) db.prepare("DELETE FROM users WHERE email = ?").run(account.email);
  });
  check(true, "cleanup: test accounts deleted");
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nConversations e2e passed.");
process.exit(failures ? 1 : 0);
