// Browser test for the admin panel. Seeds a throwaway admin and user, drives
// the real UI in headless Chrome as the admin, checks each effect from the
// user's session, restores settings, then deletes both accounts.
//
//   npm run e2e:admin              (server must be running; uses Chrome)
//   CHROME_PATH=/path/to/chrome E2E_URL=http://host:3000 npm run e2e:admin
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
fs.mkdirSync(shots, { recursive: true });

const stamp = Date.now();
const admin = { email: `e2e-admin-${stamp}@harbor.local`, password: `admin-${stamp}-pw` };
const user = { email: `e2e-user-${stamp}@harbor.local`, password: `user-${stamp}-pw` };

execFileSync(
  process.execPath,
  ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/seed.mjs"],
  {
    env: {
      ...process.env,
      SEED_ADMIN_EMAIL: admin.email,
      SEED_ADMIN_PASSWORD: admin.password,
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
  page.on("dialog", (dialog) => void dialog.accept(dialog.type() === "prompt" ? "e2e flag reason" : undefined));
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", account.email);
  await page.type("#password", account.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
  return page;
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

async function waitForText(page, text) {
  await page.waitForFunction((value) => document.body.innerText.includes(value), {}, text);
}

try {
  const userPage = await session(user);
  check(userPage.url().endsWith("/chat"), "user signs in");
  await userPage.goto(`${base}/admin`, { waitUntil: "networkidle0" });
  check(!userPage.url().includes("/admin"), "non-admin is redirected away from /admin");

  const adminPage = await session(admin);
  for (const path of ["/admin", "/admin/users", "/admin/usage", "/admin/agents", "/admin/settings", "/admin/conversations"]) {
    const response = await adminPage.goto(`${base}${path}`, { waitUntil: "networkidle0" });
    check(response.status() === 200 && adminPage.url().endsWith(path), `admin opens ${path}`);
    await adminPage.screenshot({ path: `${shots}/${path.replaceAll("/", "_").slice(1) || "admin"}.png`, fullPage: true });
  }

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

  // Kill a running session.
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
  const killed = await Promise.race([pendingChat, new Promise((resolve) => setTimeout(() => resolve(null), 20_000))]);
  check(killed !== null, "killed session ends the user's stream");

  // Quota.
  await userRowAction(adminPage, user.email, "Adjust plan and quota");
  await adminPage.waitForSelector('input[name="quota"]');
  await adminPage.$eval('input[name="plan"]', (input) => (input.value = ""));
  await adminPage.type('input[name="plan"]', "pro");
  await adminPage.type('input[name="quota"]', "1");
  await clickText(adminPage, "Save", "[role=dialog]");
  await adminPage.waitForSelector("[role=dialog]", { hidden: true });
  await adminPage.waitForFunction((email) => {
    const row = [...document.querySelectorAll("tr")].find((tr) => tr.innerText.includes(email));
    return /Pro/.test(row?.innerText ?? "") && /\/\s*1\b/.test(row?.innerText ?? "");
  }, {}, user.email);
  const overQuota = await chat(userPage, "hi");
  check(overQuota.status === 429 && /allowance/.test(overQuota.body?.error ?? ""), "user over quota is blocked");
  await userRowAction(adminPage, user.email, "Adjust plan and quota");
  await adminPage.waitForSelector('input[name="quota"]');
  await adminPage.$eval('input[name="quota"]', (input) => (input.value = ""));
  await clickText(adminPage, "Save", "[role=dialog]");
  await adminPage.waitForSelector("[role=dialog]", { hidden: true });
  check((await chat(userPage, "Reply with one word: ok", target)).status === 200, "unlimited quota allows chat again");

  // Settings: blocklist and rate limit.
  await adminPage.goto(`${base}/admin/settings`, { waitUntil: "networkidle0" });
  await adminPage.$eval("#keywords", (input) => (input.value = "forbiddenword"));
  await clickText(adminPage, "Save settings");
  await waitForText(adminPage, "Saved.");
  const blocked = await chat(userPage, "this has forbiddenword inside");
  check(blocked.status === 400, `blocklisted keyword is rejected (${blocked.status})`);
  await adminPage.goto(`${base}/admin/settings`, { waitUntil: "networkidle0" });
  await adminPage.$eval("#rate", (input) => (input.value = "2"));
  await clickText(adminPage, "Save settings");
  await waitForText(adminPage, "Saved.");
  const statuses = [];
  for (let attempt = 0; attempt < 3; attempt += 1) statuses.push((await chat(userPage, "Reply with one word: ok", target)).status);
  check(statuses.includes(429), `global rate limit applies (${statuses.join(", ")})`);
  await adminPage.$eval("#keywords", (input) => (input.value = ""));
  await adminPage.$eval("#rate", (input) => (input.value = "30"));
  await clickText(adminPage, "Save settings");
  await waitForText(adminPage, "Saved.");

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
  await clickText(adminPage, "Flag", "ol");
  await waitForText(adminPage, "e2e flag reason");
  check(true, "message flagged with a reason");
  const before = await adminPage.$$eval("ol > li", (items) => items.length);
  await clickText(adminPage, "Delete");
  await adminPage.waitForFunction((count) => document.querySelectorAll("ol > li").length === count - 1, {}, before);
  check(true, "message deleted");

  // Suspend and reactivate.
  await userRowAction(adminPage, user.email, "Suspend");
  await waitForText(adminPage, "suspended");
  check((await api(userPage, "/api/conversations")).status === 401, "suspended user's session stops working");
  await userRowAction(adminPage, user.email, "Reactivate");
  await adminPage.waitForFunction(() => !document.body.innerText.includes("suspended"));

  // Reset password: old session ends, temporary password works.
  await userRowAction(adminPage, user.email, "Reset password");
  const tempInput = await adminPage.waitForSelector("[role=dialog] input[readonly]");
  const temporary = await tempInput.evaluate((input) => input.value);
  check(temporary.length >= 12, "temporary password shown once");
  await clickText(adminPage, "Done", "[role=dialog]");
  const relogged = await session({ email: user.email, password: temporary });
  check(relogged.url().endsWith("/chat"), "user signs in with the temporary password");
  user.password = temporary;

  // Role change.
  await userRowAction(adminPage, user.email, "Change role to admin");
  await adminPage.waitForFunction((email) => {
    const row = [...document.querySelectorAll("tr")].find((tr) => tr.innerText.includes(email));
    return row?.innerText.includes("admin");
  }, {}, user.email);
  await relogged.goto(`${base}/admin`, { waitUntil: "networkidle0" });
  check(relogged.url().endsWith("/admin"), "promoted user can open /admin immediately");
  await userRowAction(adminPage, user.email, "Change role to user");
  await relogged.goto(`${base}/admin/users`, { waitUntil: "networkidle0" });
  check(!relogged.url().includes("/admin"), "demoted user loses /admin immediately");

  // Audit log recorded the actions.
  await adminPage.goto(`${base}/admin/settings?q=${encodeURIComponent("user.")}#audit`, { waitUntil: "networkidle0" });
  const auditText = await adminPage.evaluate(() => document.body.innerText);
  for (const action of ["user.quota", "user.suspend", "user.password_reset", "user.role"]) {
    check(auditText.includes(action), `audit log has ${action}`);
  }
  await adminPage.goto(`${base}/admin/settings`, { waitUntil: "networkidle0" });
  const fullAudit = await adminPage.evaluate(() => document.body.innerText);
  for (const action of ["settings.update", "session.kill", "message.delete", "model.enable", "agent.update"]) {
    check(fullAudit.includes(action), `audit log has ${action}`);
  }

} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error);
  for (const page of await browser.pages().catch(() => [])) {
    if (page.url().includes("/admin")) await page.screenshot({ path: `${shots}/failure.png`, fullPage: true }).catch(() => {});
  }
} finally {
  // Both throwaway accounts delete themselves, even after a failure.
  // E2E_CLEANUP_STAMPS removes accounts left behind by an interrupted earlier run.
  const leftovers = (process.env.E2E_CLEANUP_STAMPS ?? "").split(",").filter(Boolean).flatMap((old) => [
    { email: `e2e-user-${old}@harbor.local`, password: `user-${old}-pw` },
    { email: `e2e-admin-${old}@harbor.local`, password: `admin-${old}-pw` },
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
