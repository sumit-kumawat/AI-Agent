// Browser test for the IDE. Seeds a throwaway admin and user, creates a
// workspace in headless Chrome, edits, saves, searches, renames and deletes
// files, runs a real terminal, checks the security boundaries, then removes
// the workspace and both accounts.
//
//   npm run e2e:ide                (server must be running; uses Chrome)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
fs.mkdirSync(shots, { recursive: true });

const stamp = Date.now();
const admin = { email: `e2e-ide-admin-${stamp}@harbor.local`, password: `ide-admin-${stamp}-pw` };
const user = { email: `e2e-ide-user-${stamp}@harbor.local`, password: `ide-user-${stamp}-pw` };

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
let unloadWarnings = 0;
function check(condition, label) {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) failures += 1;
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-first-run"] });
const mod = process.platform === "darwin" ? "Meta" : "Control";

async function session(account) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.setDefaultTimeout(20_000);
  page.on("dialog", (dialog) => {
    // Leaving with unsaved edits is meant to trigger the browser's own unload warning.
    if (dialog.type() === "beforeunload") {
      unloadWarnings += 1;
      void dialog.accept();
      return;
    }
    check(false, `native ${dialog.type()} dialog appeared: ${dialog.message()}`);
    void dialog.dismiss();
  });
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", account.email);
  await page.type("#password", account.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
  return page;
}

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
    { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } },
  );
}

/** Presses `button` (default: the primary one) in the popup containing `title`, typing `input` first. */
async function popup(page, title, { input, button } = {}) {
  const find = (value) => [...document.querySelectorAll("[role=alertdialog]")].find((node) => node.innerText.includes(value)) ?? null;
  await page.waitForFunction(find, {}, title);
  const dialog = await page.evaluateHandle(find, title);
  if (input !== undefined) {
    const field = await dialog.$("input");
    const preselected = await field.evaluate((element) => element.selectionStart === 0 && element.selectionEnd === element.value.length);
    if (!preselected) throw new Error(`popup "${title}" did not select its pre-filled text`);
    await field.type(input);
  }
  const clicked = await dialog.evaluate((node, label) => {
    const target = label
      ? [...node.querySelectorAll("button")].find((item) => item.innerText.trim() === label)
      : node.querySelector("button[type=submit]");
    target?.click();
    return Boolean(target);
  }, button ?? null);
  if (!clicked) throw new Error(`popup "${title}" has no "${button ?? "submit"}" button`);
  await page.waitForFunction(
    (value) => ![...document.querySelectorAll("[role=alertdialog]")].some((node) => node.innerText.includes(value)),
    {},
    title,
  );
}

const terminalText = (page) =>
  page.evaluate(() => [...document.querySelectorAll("[data-terminal]:not(.hidden) .xterm-rows > div")].map((row) => row.textContent).join("\n"));

const sql = (query) => execFileSync("sqlite3", [process.env.DB_PATH ?? "data/harbor.db", query], { encoding: "utf8" }).trim();

let workspaceId = null;
let customerWorkspace = null;
let originalPlans = null;
let adminPage = null;
try {
  // Customers whose plan includes the IDE.
  const userPage = await session(user);
  const userId = sql(`SELECT id FROM users WHERE email='${user.email}'`);
  const planId = sql(`SELECT plan FROM users WHERE id='${userId}'`);
  originalPlans = sql("SELECT value FROM settings WHERE key='plans.config'");
  const plans = JSON.parse(originalPlans || "{}");
  if (!plans[planId]?.features?.ide) throw new Error(`the ${planId} plan does not include the IDE; enable it to run this test`);
  const created = await api(userPage, "/api/ide/workspaces", { method: "POST", body: JSON.stringify({ name: `cust ${stamp}` }) });
  check(created.status === 201, `a customer on the ${planId} plan can create a workspace (${created.status})`);
  customerWorkspace = created.body.workspace?.id;
  const listed = await api(userPage, "/api/ide/workspaces");
  check(
    listed.status === 200 && listed.body.workspaces.every((workspace) => workspace.createdBy === userId) && listed.body.workspaces.length === 1,
    "customers only see their own workspaces",
  );
  const foreign = sql("SELECT id FROM workspaces WHERE created_by IS NOT NULL AND created_by != '" + userId + "' LIMIT 1");
  if (foreign) {
    check((await api(userPage, `/api/ide/workspaces/${foreign}/files?dir=`)).status === 404, "another user's workspace is not readable");
    check((await api(userPage, `/api/ide/workspaces/${foreign}`, { method: "DELETE" })).status === 404, "another user's workspace cannot be deleted");
  }
  const terminal = await api(userPage, "/api/ide/terminals", { method: "POST", body: JSON.stringify({ workspace: customerWorkspace }) });
  check(terminal.status === 403, `customers cannot open a server terminal (${terminal.status})`);

  const filesUrl = `/api/ide/workspaces/${customerWorkspace}/files`;
  const code = "export function answerCode() {\n  return 4817;\n}\n";
  const write = await api(userPage, filesUrl, { method: "PUT", body: JSON.stringify({ path: "src/answer.ts", content: code }) });
  check(write.status === 200, "customers can save files in their workspace");
  const storageLimit = plans[planId].storageMb.ide * 1024 * 1024;
  if (storageLimit > 0 && storageLimit <= 60 * 1024 * 1024) {
    const chunk = "x".repeat(5 * 1024 * 1024 - 64);
    let refused = null;
    for (let index = 0; index < Math.ceil(storageLimit / chunk.length) + 1 && !refused; index += 1) {
      const result = await api(userPage, filesUrl, { method: "PUT", body: JSON.stringify({ path: `big/${index}.txt`, content: chunk }) });
      if (result.status !== 200) refused = result;
    }
    check(refused?.status === 413 && /IDE storage/.test(refused.body.error), `saving past the plan's ${plans[planId].storageMb.ide} MB is refused (${refused?.body?.error ?? "never refused"})`);
    const removed = await api(userPage, `${filesUrl}?path=big`, { method: "DELETE" });
    const trashed = sql(`SELECT folder FROM workspaces WHERE id='${customerWorkspace}'`);
    check(removed.status === 204 && !fs.existsSync(`data/workspaces/.trash/${trashed}`), "customer deletes free the space (nothing kept in the trash)");
  }

  await userPage.goto(`${base}/ide`, { waitUntil: "networkidle0" });
  check(new URL(userPage.url()).pathname === "/ide", "customers with the IDE in their plan open /ide");
  check(
    (await userPage.$("aside[aria-label=Sidebar]")) !== null && (await userPage.$("[data-ide-storage]")) !== null,
    "the workspace list sits in the app shell and shows storage use",
  );
  check(!(await userPage.evaluate(() => document.body.innerText.includes("data/workspaces"))), "customers are not shown server paths");
  await userPage.goto(`${base}/ide/${customerWorkspace}`, { waitUntil: "networkidle0" });
  await userPage.waitForSelector('[data-ide] [aria-label="Explorer"]');
  check(Boolean(await userPage.$("[data-terminal-unavailable]")), "the terminal panel explains it is admin-only");

  // The assistant answers from the open file, counted as IDE usage.
  const before = Number(sql(`SELECT COUNT(*) FROM usage_events WHERE user_id='${userId}' AND feature='ide'`));
  await userPage.waitForSelector('button[data-path="src"]');
  await userPage.click('button[data-path="src"]');
  await userPage.waitForSelector('button[data-path="src/answer.ts"]');
  await userPage.click('button[data-path="src/answer.ts"]');
  await userPage.waitForSelector(".monaco-editor");
  await userPage.click('button[aria-label="Assistant"]');
  await userPage.waitForSelector("[data-ide-assistant]");
  check(
    (await userPage.$eval("[data-assistant-file]", (node) => node.dataset.assistantFile)) === "src/answer.ts",
    "the assistant offers to include the open file",
  );
  await userPage.type('textarea[aria-label="Ask the assistant"]', "What number does answerCode return? Reply with the number only.");
  await userPage.keyboard.press("Enter");
  await userPage.waitForFunction(
    () => {
      const last = [...document.querySelectorAll('[data-assistant-turn="assistant"]')].at(-1);
      return last?.querySelector("[data-assistant-model]") && !document.querySelector('[data-ide-assistant] button[aria-label="Stop"]');
    },
    { timeout: 120_000 },
  );
  const reply = await userPage.$eval('[data-assistant-turn="assistant"]', (node) => node.innerText);
  check(/4817/.test(reply), `the assistant reads the open file (${reply.slice(0, 60).replace(/\n/g, " ")})`);
  await userPage.screenshot({ path: `${shots}/ide_assistant.png` });
  const after = Number(sql(`SELECT COUNT(*) FROM usage_events WHERE user_id='${userId}' AND feature='ide'`));
  check(after === before + 1, "the assistant's tokens are recorded as IDE usage");
  const secret = await api(userPage, `/api/ide/workspaces/${customerWorkspace}/assist`, {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], file: { path: ".env", content: "KEY=1" } }),
  });
  check(secret.status === 400, "secrets files are never sent to the assistant");

  // A plan without the IDE is refused by the API and the pages.
  const locked = JSON.parse(originalPlans);
  locked[planId].features.ide = false;
  sql(`UPDATE settings SET value='${JSON.stringify(locked).replaceAll("'", "''")}' WHERE key='plans.config'`);
  try {
    const refused = await api(userPage, "/api/ide/workspaces");
    check(refused.status === 403 && refused.body.block?.code === "upgrade_required", "a plan without the IDE gets 403 from the IDE API");
    await userPage.goto(`${base}/ide`, { waitUntil: "networkidle0" });
    check(new URL(userPage.url()).pathname === "/plans", "a plan without the IDE is sent to the plans page");
  } finally {
    sql(`UPDATE settings SET value='${originalPlans.replaceAll("'", "''")}' WHERE key='plans.config'`);
    originalPlans = null;
  }

  adminPage = await session(admin);
  await adminPage.goto(`${base}/account/password?next=/ide`, { waitUntil: "networkidle0" });
  await adminPage.type("#current", admin.password);
  admin.password = `ide-admin-${stamp}-changed`;
  await adminPage.type("#new", admin.password);
  await adminPage.type("#confirm", admin.password);
  await Promise.all([
    adminPage.waitForFunction(() => !location.pathname.startsWith("/account/password"), { timeout: 20_000 }),
    adminPage.click("button[type=submit]"),
  ]);

  // Create a workspace from the UI.
  await adminPage.goto(`${base}/ide`, { waitUntil: "networkidle0" });
  await adminPage.type("#ws-name", `e2e ${stamp}`);
  await Promise.all([adminPage.waitForNavigation({ waitUntil: "networkidle0" }), adminPage.click("form button[type=submit]")]);
  workspaceId = new URL(adminPage.url()).pathname.split("/").at(-1);
  check(/^[0-9a-f-]{36}$/.test(workspaceId), "creating a workspace opens it");
  await adminPage.waitForFunction(() => document.body.innerText.includes("This workspace is empty"));
  check(true, "an empty workspace shows the empty explorer state");

  // Security boundaries.
  const traversal = await api(adminPage, `/api/ide/workspaces/${workspaceId}/files?file=${encodeURIComponent("../../harbor.db")}`);
  check(traversal.status === 400, `path traversal is refused (${traversal.status})`);
  const cookie = (await adminPage.cookies()).map((item) => `${item.name}=${item.value}`).join("; ");
  const crossSite = await fetch(`${base}/api/ide/workspaces/${workspaceId}/files`, {
    method: "POST",
    headers: { cookie, origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify({ path: "evil.txt", kind: "file" }),
  });
  check(crossSite.status === 403, `cross-site writes with the admin's cookie are refused (${crossSite.status})`);
  const crossSiteTerminal = await fetch(`${base}/api/ide/terminals`, {
    method: "POST",
    headers: { cookie, origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify({ workspace: workspaceId }),
  });
  check(crossSiteTerminal.status === 403, "cross-site requests cannot open a terminal");
  const gitWrite = await api(adminPage, `/api/ide/workspaces/${workspaceId}/files`, {
    method: "PUT",
    body: JSON.stringify({ path: ".git/config", content: "x" }),
  });
  check(gitWrite.status === 403, "writes inside .git are refused");

  // Create a file through the explorer and edit it in Monaco.
  await adminPage.click('button[aria-label="New file"]');
  await popup(adminPage, "New file", { input: "src/greeting.ts" });
  await adminPage.waitForSelector(".monaco-editor .view-lines");
  check(true, "a new file opens in the editor");
  await adminPage.click(".monaco-editor .view-lines");
  await adminPage.keyboard.type("export const greeting = 'hello from xai';\n");
  await adminPage.waitForSelector('[aria-label="Close greeting.ts (unsaved)"]');
  check(true, "typing marks the tab as unsaved");
  await adminPage.keyboard.down(mod);
  await adminPage.keyboard.press("s");
  await adminPage.keyboard.up(mod);
  await adminPage.waitForSelector('[aria-label="Close greeting.ts"]');
  const saved = await api(adminPage, `/api/ide/workspaces/${workspaceId}/files?file=src/greeting.ts`);
  check(saved.body?.content?.includes("hello from xai"), "save writes the file to disk");
  await adminPage.screenshot({ path: `${shots}/ide_editor.png` });

  // Syntax errors appear in Problems.
  await adminPage.keyboard.type("const = ;");
  await adminPage.waitForFunction(() => /problems\s*[1-9]/i.test(document.body.innerText), { timeout: 20_000 });
  check(true, "syntax errors show in the Problems panel");
  await adminPage.keyboard.down(mod);
  await adminPage.keyboard.press("z");
  await adminPage.keyboard.up(mod);

  // Conflict: change the file on disk, then save from the editor.
  await api(adminPage, `/api/ide/workspaces/${workspaceId}/files`, {
    method: "PUT",
    body: JSON.stringify({ path: "src/greeting.ts", content: "changed elsewhere\n" }),
  });
  await adminPage.click(".monaco-editor .view-lines");
  await adminPage.keyboard.type("// local edit\n");
  await adminPage.keyboard.down(mod);
  await adminPage.keyboard.press("s");
  await adminPage.keyboard.up(mod);
  await popup(adminPage, "changed on disk", { button: "Cancel" });
  const untouched = await api(adminPage, `/api/ide/workspaces/${workspaceId}/files?file=src/greeting.ts`);
  check(untouched.body?.content === "changed elsewhere\n", "a conflicting save asks first and never overwrites silently");

  // Global search opens the match.
  await api(adminPage, `/api/ide/workspaces/${workspaceId}/files`, { method: "POST", body: JSON.stringify({ path: "notes.md", kind: "file" }) });
  await api(adminPage, `/api/ide/workspaces/${workspaceId}/files`, {
    method: "PUT",
    body: JSON.stringify({ path: "notes.md", content: "line one\nthe needle is here\n" }),
  });
  await adminPage.click('nav[aria-label="Views"] button[aria-label="Search"]');
  await adminPage.type('input[aria-label="Search in files"]', "needle");
  const hit = await adminPage.waitForSelector('button[title="notes.md:2"]');
  check(true, "global search finds text in files");
  await hit.click();
  await adminPage.waitForSelector('[role=tab][title="notes.md"][aria-selected=true]');
  check(true, "clicking a search result opens the file");

  // Quick open.
  await adminPage.keyboard.down(mod);
  await adminPage.keyboard.press("p");
  await adminPage.keyboard.up(mod);
  await adminPage.waitForSelector('input[aria-label="File name"]');
  await adminPage.keyboard.type("greet");
  await adminPage.waitForFunction(() => document.querySelector("[role=option][aria-selected=true]")?.textContent?.includes("greeting.ts"));
  await adminPage.keyboard.press("Enter");
  await adminPage.waitForSelector('[role=tab][title="src/greeting.ts"][aria-selected=true]');
  check(true, "quick open (⌘P) finds and opens files");

  // Terminal.
  await adminPage.click('nav[aria-label="Views"] button[aria-label="Explorer"]');
  await adminPage.waitForSelector("::-p-text(Open a terminal in this workspace)");
  await adminPage.click("::-p-text(Open a terminal in this workspace)");
  await adminPage.waitForSelector("[data-terminal] .xterm-rows");
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await adminPage.click("[data-terminal]");
  await adminPage.keyboard.type('echo xai-$((40+2)) && pwd && echo "secret=<${AUTH_SECRET:-none}>"\n');
  await adminPage.waitForFunction(
    () => [...document.querySelectorAll("[data-terminal] .xterm-rows > div")].some((row) => row.textContent.includes("xai-42")),
    { timeout: 15_000 },
  );
  const termOut = await terminalText(adminPage);
  check(true, "the terminal runs real shell commands");
  check(/workspaces\/e2e-/.test(termOut), "the terminal starts in the workspace folder");
  check(termOut.includes("secret=<none>"), "app secrets are not visible to the shell");
  await adminPage.screenshot({ path: `${shots}/ide_terminal.png` });

  // A symlink that escapes the workspace cannot be read through the API.
  await adminPage.keyboard.type("ln -s /etc escape && echo linked\n");
  await adminPage.waitForFunction(
    () => [...document.querySelectorAll("[data-terminal] .xterm-rows > div")].some((row) => row.textContent.trim() === "linked"),
  );
  const escape = await api(adminPage, `/api/ide/workspaces/${workspaceId}/files?file=escape/hosts`);
  check(escape.status === 403, `symlinks out of the workspace are refused (${escape.status})`);

  // Rename and delete from the explorer's context menu.
  await adminPage.click('button[aria-label="Refresh explorer"]');
  await adminPage.waitForSelector('button[data-path="notes.md"]');
  await adminPage.click('button[data-path="notes.md"]', { button: "right" });
  await (await adminPage.waitForSelector("[role=menuitem] ::-p-text(Rename…)")).click();
  await popup(adminPage, "Rename notes.md", { input: "docs/notes.md" });
  await adminPage.waitForSelector('[role=tab][title="docs/notes.md"]');
  check((await api(adminPage, `/api/ide/workspaces/${workspaceId}/files?file=docs/notes.md`)).status === 200, "rename moves the file and updates its tab");
  await adminPage.waitForSelector('button[data-path="docs"]');
  await adminPage.click('button[data-path="docs"]');
  await adminPage.waitForSelector('button[data-path="docs/notes.md"]');
  await adminPage.click('button[data-path="docs/notes.md"]', { button: "right" });
  await (await adminPage.waitForSelector("[role=menuitem] ::-p-text(Delete)")).click();
  await popup(adminPage, "Delete notes.md?", { button: "Delete" });
  await adminPage.waitForFunction(() => !document.querySelector('[role=tab][title="docs/notes.md"]'));
  check((await api(adminPage, `/api/ide/workspaces/${workspaceId}/files?file=docs/notes.md`)).status === 404, "delete removes the file and closes its tab");

  // Theme toggle.
  await adminPage.click('button[aria-label="Switch to dark theme"]');
  await adminPage.waitForFunction(() => document.querySelector("[data-ide]")?.classList.contains("dark"));
  const darkEditor = await adminPage.evaluate(() => Boolean(document.querySelector(".monaco-editor.vs-dark")));
  check(darkEditor, "the IDE switches to its dark theme, editor included");
  await adminPage.screenshot({ path: `${shots}/ide_dark.png` });
  await adminPage.click('button[aria-label="Switch to light theme"]');

  // Leaving with unsaved edits warns first; the rest of the app stays light.
  await adminPage.goto(`${base}/chat`, { waitUntil: "networkidle0" });
  check(unloadWarnings > 0, "leaving the IDE with unsaved edits warns first");
  check(!(await adminPage.evaluate(() => Boolean(document.querySelector(".dark")))), "the IDE theme does not change the chat app's theme");
} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error);
  const pages = await browser.pages().catch(() => []);
  for (const [index, page] of pages.entries()) await page.screenshot({ path: `${shots}/ide-failure-${index}.png` }).catch(() => {});
} finally {
  if (originalPlans) sql(`UPDATE settings SET value='${originalPlans.replaceAll("'", "''")}' WHERE key='plans.config'`);
  const customerFolder = customerWorkspace ? sql(`SELECT folder FROM workspaces WHERE id='${customerWorkspace}'`) : "";
  if (adminPage && workspaceId) {
    try {
      await adminPage.goto(`${base}/ide`, { waitUntil: "networkidle0" });
      await adminPage.click(`button[aria-label="Delete e2e ${stamp}"]`);
      await popup(adminPage, `Delete e2e ${stamp}?`, { button: "Delete workspace" });
      await adminPage.waitForFunction((name) => !document.body.innerText.includes(name), {}, `e2e ${stamp}`);
      check((await api(adminPage, `/api/ide/workspaces/${workspaceId}/files?dir=`)).status === 404, "cleanup: workspace deleted from the UI");
    } catch {
      check(false, "cleanup: could not delete the workspace");
    }
  }
  for (const account of [user, admin]) {
    try {
      const page = await session(account);
      const removed = await api(page, "/api/account", { method: "DELETE", body: JSON.stringify({ password: account.password }) });
      check(removed.status === 204, `cleanup: ${account.email} deleted`);
    } catch {
      check(false, `cleanup: could not delete ${account.email}`);
    }
  }
  if (customerWorkspace) {
    check(
      sql(`SELECT COUNT(*) FROM workspaces WHERE id='${customerWorkspace}'`) === "0" && !fs.existsSync(`data/workspaces/${customerFolder}`),
      "deleting a customer account erases their workspaces",
    );
  }
  await browser.close();
}

console.log(failures === 0 ? `\nIDE e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
