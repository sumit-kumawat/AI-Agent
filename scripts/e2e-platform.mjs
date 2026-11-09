// Browser test for the platform features: settings and appearance,
// personalization, memory, feedback, edit and resend, pin, search, archive,
// temporary chats, export, CSRF protection, bulk actions and account deletion.
//
//   npm run e2e:platform           (server must be running; uses Chrome)
//   E2E_MODEL=llama3.2:1b CHROME_PATH=... E2E_URL=... npm run e2e:platform
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
const model = process.env.E2E_MODEL ?? "llama3.2:1b";
fs.mkdirSync(shots, { recursive: true });

const stamp = Date.now();
const user = { email: `e2e-platform-${stamp}@harbor.local`, password: `platform-${stamp}-pw` };
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

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const context = await browser.createBrowserContext();
const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.on("dialog", (dialog) => {
  check(false, `native ${dialog.type()} dialog appeared: ${dialog.message()}`);
  void dialog.dismiss();
});
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.setViewport({ width: 1366, height: 860 });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = (name) => page.screenshot({ path: `${shots}/platform_${name}.png` });
/** Waits until the latest reply has finished streaming and shows its actions. */
const waitIdle = () =>
  page.waitForFunction(
    () => {
      const replies = document.querySelectorAll('[data-role="assistant"]');
      const last = replies[replies.length - 1];
      return (
        !document.querySelector('button[aria-label="Stop generating"]') &&
        last?.querySelector('button[aria-label="Copy"]')
      );
    },
    { timeout: 180_000 },
  );
const sidebarText = () =>
  page.$eval('aside nav[aria-label="Conversations"]', (node) => node.textContent ?? "");

/** Clicks the button whose whole label is `text`. */
async function button(text, scope = "body") {
  await page.waitForFunction(
    (value, root) => [...document.querySelectorAll(`${root} button`)].some((node) => node.textContent.trim() === value),
    {},
    text,
    scope,
  );
  await page.evaluate(
    (value, root) => [...document.querySelectorAll(`${root} button`)].find((node) => node.textContent.trim() === value).click(),
    text,
    scope,
  );
}

async function menuItem(text) {
  const item = await page.waitForSelector(`[role=menu] [role=menuitem] ::-p-text(${text})`, { visible: true });
  await sleep(120);
  await item.evaluate((node) => node.closest("[role=menuitem]").click());
}

/** Answers the in-app popup whose text includes `title`. */
async function popup(title, { input, button } = {}) {
  await page.waitForFunction(
    (value) => [...document.querySelectorAll("[role=alertdialog]")].some((node) => node.textContent.includes(value)),
    {},
    title,
  );
  if (input !== undefined) {
    await page.$eval("[role=alertdialog] input", (node) => node.select());
    await page.keyboard.press("Backspace");
    await page.type("[role=alertdialog] input", input);
  }
  await page.evaluate((label) => {
    const dialog = document.querySelector("[role=alertdialog]");
    const buttons = [...dialog.querySelectorAll("button")];
    const target = label ? buttons.find((node) => node.textContent.trim() === label) : dialog.querySelector("button[type=submit]");
    target.click();
  }, button);
  await page.waitForFunction(
    (value) => ![...document.querySelectorAll("[role=alertdialog]")].some((node) => node.textContent.includes(value)),
    {},
    title,
  );
}

async function toast(text) {
  await page.waitForFunction(
    (value) => [...document.querySelectorAll("[data-toast]")].some((node) => node.textContent.includes(value)),
    {},
    text,
  );
}

async function send(text) {
  await page.waitForSelector('textarea[aria-label="Message"]');
  await page.click('textarea[aria-label="Message"]');
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

async function openSettings(tab) {
  await page.evaluate((name) => {
    location.hash = `#settings/${name}`;
  }, tab);
  await page.waitForSelector(`[data-settings] [data-settings-tab="${tab}"][aria-current="page"]`);
}

async function closeSettings() {
  await page.click('button[aria-label="Close settings"]');
  await page.waitForSelector("[data-settings]", { hidden: true });
}

const api = (path, init = {}) =>
  page.evaluate(
    async (url, options) => {
      const response = await fetch(url, options);
      return { status: response.status, text: await response.text() };
    },
    path,
    { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } },
  );

let deleted = false;

try {
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", user.email);
  await page.type("#password", user.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
  await page.evaluate((name) => localStorage.setItem("harbor-model", name), model);
  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });

  // Settings opens from the profile menu.
  await page.click("[data-profile-menu]");
  await menuItem("Settings");
  await page.waitForSelector("[data-settings]");
  check(page.url().endsWith("#settings/general"), "profile menu opens Settings at General");
  await shot("settings_general");

  // Appearance: dark theme applies immediately and survives a reload.
  await page.click('[role=radiogroup][aria-label="Theme"] [data-value="dark"]');
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  check(true, "dark theme applies immediately");
  await page.reload({ waitUntil: "networkidle0" });
  const afterReload = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    settings: Boolean(document.querySelector("[data-settings]")),
  }));
  check(afterReload.dark, "dark theme persists across reloads");
  check(afterReload.settings, "settings reopen from the URL after a reload");
  await shot("settings_dark");
  await page.click('[data-accent-option="blue"]');
  await page.waitForFunction(() => document.documentElement.dataset.accent === "blue");
  await page.click('[role=radiogroup][aria-label="Text size"] [data-value="large"]');
  await page.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === "17.5px");
  check(true, "accent and text size apply");
  const stored = JSON.parse((await api("/api/preferences")).text).preferences;
  check(stored.theme === "dark" && stored.accent === "blue" && stored.fontSize === "large", "appearance is saved to the account");
  await page.click('[role=radiogroup][aria-label="Theme"] [data-value="system"]');
  await page.click('[data-accent-option="teal"]');
  await page.click('[role=radiogroup][aria-label="Text size"] [data-value="medium"]');
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));

  // Personalization: nickname is saved and used in the greeting.
  await page.click('[data-settings-tab="personalization"]');
  await page.type('input[name="nickname"]', "Sam");
  await page.type('textarea[name="instructions"]', "Keep answers brief.");
  await button("Save", "[data-settings] form");
  await toast("Custom instructions saved");
  await closeSettings();
  await page.waitForFunction(() => document.body.innerText.includes("What can I help with, Sam?"));
  check(true, "personalization is saved and greets by nickname");

  // Memory: an explicit request is saved and shown under the reply.
  await send("Remember that my favourite colour is teal.");
  await page.waitForFunction(() => location.pathname.startsWith("/chat/") && location.pathname !== "/chat/");
  await waitIdle();
  await page.waitForSelector("[data-memory-chip]");
  check(true, "explicit memory request shows 'Memory updated'");
  await shot("memory_chip");
  await page.click("[data-memory-chip]");
  await page.waitForSelector('[data-settings-tab="memory"][aria-current="page"]');
  await page.waitForFunction(() => document.querySelector("[data-memory-list]")?.textContent?.includes("My favourite colour is teal"));
  check(true, "saved memory appears in Settings → Memory");
  await page.click('[data-memory-list] button[aria-label="Edit memory"]');
  await popup("Edit memory", { input: "My favourite colour is teal green" });
  await toast("Memory updated");
  await page.waitForFunction(() => document.querySelector("[data-memory-list]")?.textContent?.includes("teal green"));
  check(true, "memory can be edited");
  await button("Add", "[data-settings]");
  await popup("Add a memory", { input: "I work in the IST time zone" });
  await page.waitForFunction(() => document.querySelectorAll("[data-memory]").length === 2);
  check(true, "memory can be added manually");
  await page.click('[data-memory-list] [data-memory] button[aria-label="Delete memory"]');
  await page.waitForFunction(() => document.querySelectorAll("[data-memory]").length === 1);
  check(true, "memory can be deleted");
  await closeSettings();

  // Feedback is saved.
  await page.click('[data-role="assistant"] button[aria-label="Good response"]');
  await page.waitForSelector('[data-role="assistant"] button[aria-label="Good response"][aria-pressed="true"]');
  await toast("Thanks for the feedback");
  await page.reload({ waitUntil: "networkidle0" });
  check(
    Boolean(await page.$('[data-role="assistant"] button[aria-label="Good response"][aria-pressed="true"]')),
    "thumbs-up feedback persists",
  );

  // Edit and resend replaces the exchange.
  await page.hover('[data-role="user"]');
  await page.click('[data-role="user"] button[aria-label="Edit message"]');
  await page.waitForSelector('textarea[aria-label="Edit message"]');
  await page.$eval('textarea[aria-label="Edit message"]', (node) => node.select());
  await page.keyboard.press("Backspace");
  await page.type('textarea[aria-label="Edit message"]', "Reply with just the word hello.");
  await button("Send", "form");
  await page.waitForSelector('button[aria-label="Stop generating"]').catch(() => {});
  await waitIdle();
  const exchange = await page.evaluate(() => ({
    users: [...document.querySelectorAll('[data-role="user"]')].map((node) => node.textContent),
    assistants: document.querySelectorAll('[data-role="assistant"]').length,
  }));
  check(
    exchange.users.length === 1 && exchange.users[0].includes("Reply with just the word hello.") && exchange.assistants === 1,
    "editing a message replaces it and its reply",
  );
  const chatId = new URL(page.url()).pathname.split("/").pop();
  const saved = JSON.parse((await api(`/api/conversations/${chatId}`)).text);
  check(
    saved.messages.length === 2 && saved.messages[0].content === "Reply with just the word hello.",
    "the edited thread is what is stored",
  );

  // Pin from the sidebar.
  const title = await page.$eval(`[data-conversation="${chatId}"] a`, (node) => node.textContent);
  await page.click(`[data-conversation="${chatId}"] button[aria-label^="Options for"]`);
  await menuItem("Pin");
  await toast("Chat pinned");
  await page.waitForFunction(() => document.querySelector('section[aria-label="Pinned"]'));
  check(true, "pinned chat appears under Pinned");

  // Search by message text with ⌘K.
  await page.keyboard.down("Meta");
  await page.keyboard.press("k");
  await page.keyboard.up("Meta");
  await page.waitForSelector('input[aria-label="Search chats"]');
  await page.type('input[aria-label="Search chats"]', "hello");
  await page.waitForFunction(
    (value) => document.querySelector("[data-search-results]")?.textContent?.includes(value),
    {},
    title.slice(0, 20),
  );
  check(true, "search finds a chat by message text");
  await shot("search");
  await page.$eval('input[aria-label="Search chats"]', (node) => node.select());
  await page.type('input[aria-label="Search chats"]', "zzqqxxnomatch");
  await page.waitForFunction(() => document.querySelector("[data-search-results]")?.textContent?.includes("No chats match"));
  check(true, "search shows an empty state");
  await page.keyboard.press("Escape");
  await page.waitForSelector('input[aria-label="Search chats"]', { hidden: true });
  await sleep(300);

  // Archive from the chat menu, restore from Settings → Data controls.
  await page.click('button[aria-label="Chat options"]');
  await menuItem("Archive");
  await toast("Chat archived");
  await page.waitForFunction(() => location.pathname === "/chat");
  check(!(await sidebarText()).includes(title), "archived chat leaves the sidebar");
  await openSettings("data");
  await page.waitForSelector(`[data-archived="${chatId}"]`);
  await page.click(`[data-archived="${chatId}"] button[aria-label^="Restore"]`);
  await toast("Chat restored");
  await page.waitForFunction((value) => document.querySelector('aside nav[aria-label="Conversations"]')?.textContent?.includes(value), {}, title);
  check(true, "archived chat can be restored");
  await closeSettings();

  // Temporary chat: not in history, no memory.
  await page.click("[data-temporary-toggle]");
  await page.waitForFunction(() => location.search.includes("temporary=1"));
  await send("Remember that I like cats.");
  await page.waitForFunction(() => location.pathname.startsWith("/chat/") && location.pathname !== "/chat/");
  await waitIdle();
  const temporaryId = new URL(page.url()).pathname.split("/").pop();
  check(!(await page.$("[data-memory-chip]")), "temporary chats do not save memories");
  check(!(await page.$(`[data-conversation="${temporaryId}"]`)), "temporary chat is not in the sidebar");
  const searchTemp = JSON.parse((await api("/api/search?q=cats")).text);
  check(!searchTemp.results.some((result) => result.id === temporaryId), "temporary chat is not searchable");
  const memories = JSON.parse((await api("/api/memories")).text).memories;
  check(memories.length === 1, "memory list unchanged by the temporary chat");

  // Export.
  const exported = await api("/api/account/export");
  const data = JSON.parse(exported.text);
  check(
    exported.status === 200 && data.account.email === user.email && data.conversations.length === 1 && data.memories.length === 1,
    "export includes account, chats and memories (not temporary chats)",
  );

  // Cross-site requests are refused even with a valid session cookie.
  const cookie = (await page.cookies()).map((item) => `${item.name}=${item.value}`).join("; ");
  const forged = await fetch(`${base}/api/preferences`, {
    method: "PATCH",
    headers: { cookie, origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify({ theme: "dark" }),
  });
  check(forged.status === 403, "cross-site preference change is refused");

  // Bulk archive and restore.
  await openSettings("data");
  await button("Archive all", "[data-settings]");
  await popup("Archive all chats?", { button: "Archive all" });
  await toast("All chats archived");
  await page.waitForFunction(() => document.querySelector('aside nav[aria-label="Conversations"]')?.textContent?.includes("Your chats will show up here."));
  check(true, "archive all empties the sidebar");
  await button("Restore all", "[data-settings]");
  await toast("All chats restored");
  await page.waitForFunction((value) => document.querySelector('aside nav[aria-label="Conversations"]')?.textContent?.includes(value), {}, title);
  check(true, "restore all brings chats back");
  await closeSettings();

  // Phone layout: settings fits the screen.
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${base}/chat#settings/account`, { waitUntil: "networkidle0" });
  await page.waitForSelector("[data-settings]");
  const fits = await page.$eval("[data-settings]", (node) => node.getBoundingClientRect().right <= window.innerWidth + 1);
  check(fits, "settings fit on a phone screen");
  await shot("mobile_settings");
  check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(" | ")}` : ""}`);

  // Delete the account from Settings → Account.
  await button("Delete account", "[data-settings]");
  await popup("Delete your account?", { button: "Continue" });
  await popup("Confirm with your password", { input: user.password, button: "Delete account" });
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 30_000 });
  deleted = true;
  check(true, "account can be deleted from settings");
} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error);
  await shot("failure").catch(() => {});
} finally {
  if (!deleted) {
    try {
      const removed = await api("/api/account", { method: "DELETE", body: JSON.stringify({ password: user.password }) });
      check(removed.status === 204, "cleanup: test user deleted");
    } catch {
      check(false, `cleanup: could not delete ${user.email}`);
    }
  }
  await browser.close();
}

console.log(failures === 0 ? `\nPlatform e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
