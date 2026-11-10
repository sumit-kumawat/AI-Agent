// Browser test for the chat UI. Seeds a throwaway user, chats in headless
// Chrome on desktop and phone sizes, checks streaming, markdown, copy, stop,
// regenerate, rename, auto-scroll, the default theme and the delete popup, then
// deletes the account.
//
//   npm run e2e:chat               (server must be running; uses Chrome)
//   E2E_MODEL=llama3.2:1b CHROME_PATH=... E2E_URL=... npm run e2e:chat
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
const user = { email: `e2e-chat-${stamp}@harbor.local`, password: `chat-${stamp}-pw` };
execFileSync(
  process.execPath,
  ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/seed.mjs"],
  {
    env: {
      ...process.env,
      SEED_USER_EMAIL: user.email,
      SEED_USER_PASSWORD: user.password,
      SEED_USER_PLAN: "advance",
    },
    stdio: "ignore",
  },
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

const shot = (name) => page.screenshot({ path: `${shots}/chat_${name}.png` });
const text = () => page.evaluate(() => document.body.innerText);
const assistantCount = () => page.$$eval('[data-role="assistant"]', (nodes) => nodes.length);
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

/** Presses `button` in the in-app popup titled `title` and waits for it to close. */
async function popup(title, button) {
  const find = (value) =>
    [...document.querySelectorAll("[role=alertdialog]")].find((node) => node.innerText.includes(value)) ?? null;
  await page.waitForFunction(find, {}, title);
  const clicked = await (await page.evaluateHandle(find, title)).evaluate((node, label) => {
    const target = [...node.querySelectorAll("button")].find((item) => item.innerText.trim() === label);
    target?.click();
    return Boolean(target);
  }, button);
  if (!clicked) throw new Error(`popup "${title}" has no "${button}" button`);
  await page.waitForFunction(
    (value) => ![...document.querySelectorAll("[role=alertdialog]")].some((node) => node.innerText.includes(value)),
    {},
    title,
  );
}

async function send(message) {
  await page.click('textarea[aria-label="Message"]');
  await page.keyboard.type(message);
  await page.keyboard.press("Enter");
}

try {
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", user.email);
  await page.type("#password", user.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
  await page.evaluate((name) => localStorage.setItem("harbor-model", name), model);
  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });
  check((await text()).includes("What can I help with"), "blank new chat shows the greeting");
  check(
    (await page.$eval('button[aria-label="Choose assistant"]', (node) => node.dataset.modelSelection)).endsWith(model),
    `model selector in the composer has ${model} selected`,
  );
  await shot("desktop_empty");

  // Shift+Enter adds a line; Enter sends.
  await page.click('textarea[aria-label="Message"]');
  await page.keyboard.type("line one");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.keyboard.type("line two");
  const draft = await page.$eval('textarea[aria-label="Message"]', (node) => ({ value: node.value, height: node.clientHeight }));
  check(draft.value === "line one\nline two" && draft.height > 50, "Shift+Enter adds a line and the composer grows");
  await page.$eval('textarea[aria-label="Message"]', (node) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(node, "");
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });

  // First message: code block and table.
  await send("Show a short JavaScript hello world in a code block, then a 2x2 markdown table of fruits and colors.");
  await page.waitForFunction(() => location.pathname.startsWith("/chat/") && location.pathname !== "/chat/");
  await page.waitForSelector('button[aria-label="Stop generating"]');
  check(true, "Enter sends and Stop appears while streaming");
  await page.waitForSelector(".xai-streaming, .xai-caret");
  check(true, "blinking caret shows while streaming");
  await shot("desktop_streaming");
  await waitIdle();
  const layout = await page.evaluate(() => {
    const bubble = document.querySelector(".rounded-3xl.bg-muted");
    const column = bubble?.closest(".max-w-3xl");
    const assistant = document.querySelector('[data-role="assistant"]');
    const bubbleBox = bubble?.getBoundingClientRect();
    const columnBox = column?.getBoundingClientRect();
    return {
      userRight: bubbleBox && columnBox ? Math.abs(columnBox.right - 16 - bubbleBox.right) < 2 : false,
      columnWidth: columnBox?.width ?? 0,
      assistantBubble: assistant ? getComputedStyle(assistant).backgroundColor : "",
      highlighted: document.querySelectorAll('[data-role="assistant"] pre span[style]').length,
      codeCopy: Boolean(document.querySelector('[data-role="assistant"] [data-streamdown="code-block"] button, [data-role="assistant"] pre')),
      table: Boolean(document.querySelector('[data-role="assistant"] table')),
      rawTable: /\|\s*:?-{3,}/.test(assistant?.innerText ?? ""),
      rawSample: (assistant?.innerText ?? "").match(/.*\|\s*:?-{3,}.*/)?.[0] ?? "",
    };
  });
  check(layout.userRight, "user message is a right-aligned bubble");
  check(Math.round(layout.columnWidth) === 768, `messages column is 48rem (${Math.round(layout.columnWidth)}px)`);
  check(layout.assistantBubble === "rgba(0, 0, 0, 0)", "assistant reply has no bubble");
  check(layout.highlighted > 0, `code block is syntax highlighted (${layout.highlighted} tokens)`);
  if (layout.table || layout.rawTable) check(layout.table && !layout.rawTable, `markdown table renders${layout.rawTable ? ` (raw: ${layout.rawSample.slice(0, 80)})` : ""}`);
  else console.log(`skip ${model} answered without a table, so table rendering was not checked`);
  await shot("desktop_reply");

  // Title was generated from the first message.
  await page.waitForFunction(() => !document.querySelector("h1")?.textContent?.includes("New chat"), { timeout: 10_000 }).catch(() => {});
  const title = await page.$eval("h1", (node) => node.textContent);
  check(title.startsWith("Show a short JavaScript"), `title generated from first message ("${title.slice(0, 40)}…")`);

  // Copy button on the reply.
  await page.evaluate(() => {
    window.__copied = null;
    document.addEventListener("copy", () => (window.__copied = "event"));
  });
  const copyButtons = await page.$$('button[aria-label="Copy"]');
  check(copyButtons.length >= 2, "copy buttons on user and assistant messages");

  // Regenerate replaces the last reply.
  const before = await assistantCount();
  await page.click('button[aria-label="Regenerate"]');
  await page.waitForSelector('button[aria-label="Stop generating"]');
  await waitIdle();
  check((await assistantCount()) === before, "regenerate replaces the last reply");

  // Stop mid-stream keeps the partial reply.
  await send("Write a 1000 word story about a lighthouse keeper, in many short paragraphs.");
  await page.waitForFunction(() => {
    const node = document.querySelector("[data-chat-scroller]");
    return node && node.scrollHeight > node.clientHeight + 300;
  }, { timeout: 120_000 });
  const following = await page.$eval("[data-chat-scroller]", (node) => node.scrollHeight - node.scrollTop - node.clientHeight);
  check(following < 60, "view follows the streaming reply");

  // Auto-scroll: scrolling up pauses it while the reply keeps streaming.
  const grownFrom = await page.$eval("[data-chat-scroller]", (node) => {
    node.dispatchEvent(new WheelEvent("wheel", { deltaY: -400, bubbles: true }));
    node.scrollTop = 0;
    return node.scrollHeight;
  });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const held = await page.$eval("[data-chat-scroller]", (node) => ({ top: node.scrollTop, height: node.scrollHeight }));
  check(held.top < 50 && held.height > grownFrom, "auto-scroll pauses after scrolling up while the reply grows");
  check(Boolean(await page.$('button[aria-label="Scroll to latest message"]')), "jump-to-latest button appears");
  await shot("desktop_scrolled_up");
  await page.click('button[aria-label="Scroll to latest message"]');

  await page.click('button[aria-label="Stop generating"]');
  await waitIdle();
  const partial = await page.evaluate(() => [...document.querySelectorAll('[data-role="assistant"]')].at(-1)?.textContent?.length ?? 0);
  check(partial > 80, "stop keeps the partial reply");

  // Rename from the top bar.
  await page.click('button[title="Rename conversation"]');
  await page.keyboard.down("Meta");
  await page.keyboard.press("a");
  await page.keyboard.up("Meta");
  await page.keyboard.type("Renamed by e2e");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Renamed by e2e");
  await page.waitForFunction(() => document.querySelector('nav[aria-label="Conversations"]')?.textContent?.includes("Renamed by e2e"));
  check(true, "title is editable and the sidebar updates");

  // Default theme follows the system (headless Chrome reports light).
  const theme = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    pref: document.documentElement.dataset.theme,
  }));
  check(!theme.dark && theme.pref === "system", "default theme follows the system setting");

  // Collapse the desktop sidebar to an icon rail.
  const rail = () =>
    page.$eval("aside", (node) => ({ collapsed: node.dataset.collapsed === "true", width: node.getBoundingClientRect().width }));
  await page.click('button[aria-label="Close sidebar"]');
  await page.waitForFunction(() => document.querySelector("aside")?.getBoundingClientRect().width < 80);
  const collapsed = await rail();
  check(collapsed.collapsed && collapsed.width < 80, `collapsed sidebar stays as an icon rail (${Math.round(collapsed.width)}px)`);
  await page.hover('aside a[aria-label="New chat"]');
  const tipped = await page
    .waitForFunction(() => [...document.querySelectorAll("[role=tooltip]")].some((node) => node.textContent.includes("New chat")), {
      timeout: 5000,
    })
    .then(() => true)
    .catch(() => false);
  check(tipped, "rail icons show tooltips");
  await page.reload({ waitUntil: "networkidle0" });
  check((await rail()).collapsed, "the collapsed state survives a reload");
  await page.click('button[aria-label="Open sidebar"]');
  await page.waitForFunction(() => document.querySelector("aside")?.getBoundingClientRect().width > 200);
  check(!(await rail()).collapsed, "the sidebar expands again with labels");
  await page.keyboard.down("Meta");
  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyS");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Meta");
  await page.waitForFunction(() => document.querySelector("aside")?.dataset.collapsed === "true");
  await page.click('button[aria-label="Open sidebar"]');
  await page.waitForFunction(() => document.querySelector("aside")?.dataset.collapsed === "false");
  check(true, "⌘⇧S toggles the sidebar");

  // Delete from the sidebar asks in a popup; cancelling keeps the chat.
  const openDelete = async () => {
    // Let the previous popup finish returning focus before opening the menu again.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await page.click('aside button[aria-label="Options for Renamed by e2e"]');
    const item = await page.waitForSelector("[role=menu] [role=menuitem] ::-p-text(Delete)", { visible: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await item.evaluate((node) => node.closest("[role=menuitem]").click());
  };
  await openDelete();
  await page.waitForSelector("[role=alertdialog]");
  await shot("delete_confirm_popup");
  await popup("Delete chat?", "Cancel");
  check(new URL(page.url()).pathname.startsWith("/chat/"), "cancelling the delete popup keeps the chat");
  await openDelete();
  await popup("Delete chat?", "Delete");
  await page.waitForFunction(() => location.pathname === "/chat");
  await page.waitForFunction(
    () => !document.querySelector('nav[aria-label="Conversations"]')?.textContent?.includes("Renamed by e2e"),
  );
  check(true, "confirming the popup deletes the chat");

  // Phone layout: sidebar is a sheet.
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "networkidle0" });
  check(!(await page.$("aside")) || !(await page.$eval("aside", (node) => node.offsetParent !== null)), "sidebar hidden on phones");
  await shot("mobile_chat");
  await page.click('button[aria-label="Open conversations"]');
  await page.waitForSelector('[role=dialog] nav[aria-label="Conversations"]');
  check(true, "sidebar opens as a sheet on phones");
  await shot("mobile_sidebar");
  await page.keyboard.press("Escape");

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!horizontalOverflow, "no horizontal overflow on phones");
  check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(" | ")}` : ""}`);
} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error);
  await shot("failure").catch(() => {});
} finally {
  try {
    const removed = await page.evaluate(async (password) => {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      return response.status;
    }, user.password);
    check(removed === 204, "cleanup: test user deleted");
  } catch {
    check(false, `cleanup: could not delete ${user.email}`);
  }
  await browser.close();
}

console.log(failures === 0 ? `\nChat e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
