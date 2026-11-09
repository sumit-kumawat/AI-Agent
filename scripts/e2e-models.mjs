// Browser and API test for model selection. Checks the picker (Auto modes,
// search, groups, capabilities, current selection), then sends real turns to
// Ollama: each Auto mode routes to a model that fits the task, an image goes
// to a vision model, a chat can switch models without losing its history, the
// chat remembers its Auto mode, and unknown models are refused. Every
// automatic choice must be recorded. Deletes the account at the end.
//
//   npm run e2e:models        (server must be running; uses Chrome and Ollama)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import zlib from "node:zlib";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
const db = process.env.E2E_DB ?? "data/harbor.db";
fs.mkdirSync(shots, { recursive: true });

function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).map((_, i) => [r, g, b][i % 3])]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const stamp = Date.now();
const user = { email: `e2e-models-${stamp}@harbor.local`, password: `models-${stamp}-pw` };
execFileSync(
  process.execPath,
  ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/seed.mjs"],
  { env: { ...process.env, SEED_USER_EMAIL: user.email, SEED_USER_PASSWORD: user.password, SEED_USER_PLAN: "advance" }, stdio: "ignore" },
);

let failures = 0;
function check(condition, label) {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) failures += 1;
}

const sql = (query) => execFileSync("sqlite3", [db, query], { encoding: "utf8" }).trim();

const installed = await fetch(`${base}/api/health`).then((response) => response.json());
const wanted = [
  "qwen2.5:1.5b",
  "deepseek-r1:1.5b",
  "gemma3:1b",
  "gemma3:4b",
  "llama3.2:1b",
  "llama3.2:3b",
  "qwen2.5-coder:1.5b",
  "qwen2.5-coder:14b",
];

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await (await browser.createBrowserContext()).newPage();
page.setDefaultTimeout(30_000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.setViewport({ width: 1366, height: 860 });
const shot = (name) => page.screenshot({ path: `${shots}/models_${name}.png` });

/** One chat turn through the API; returns the reply text and its metadata. */
const turn = (conversationId, messages, extra) =>
  page.evaluate(
    async (body) => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) return { status: response.status, error: (await response.json().catch(() => ({}))).error };
      const raw = await response.text();
      let text = "";
      let meta = {};
      let id = null;
      for (const line of raw.split("\n")) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        const chunk = JSON.parse(line.slice(6));
        if (chunk.type === "start" && chunk.messageId) id = chunk.messageId;
        if (chunk.messageMetadata) meta = { ...meta, ...chunk.messageMetadata };
        if (chunk.type === "text-delta") text += chunk.delta;
      }
      return { status: response.status, text, meta, id };
    },
    { conversationId, messages, ...extra },
  );

const newChat = (body) =>
  page.evaluate(async (payload) => {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await response.json()).id;
  }, body);

const userMessage = (text, metadata) => ({
  id: crypto.randomUUID(),
  role: "user",
  parts: [{ type: "text", text }],
  ...(metadata ? { metadata } : {}),
});

async function autoTurn(mode, text) {
  const id = await newChat({ mode });
  const result = await turn(id, [userMessage(text)], { mode });
  return { ...result, conversationId: id };
}

try {
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", user.email);
  await page.type("#password", user.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });

  // ---------- picker ----------
  const trigger = 'button[aria-label="Choose model"]';
  check(
    (await page.$eval(trigger, (node) => node.dataset.modelSelection)) === "auto:balance",
    "Auto · Balance is the default selection",
  );
  check((await page.$eval(trigger, (node) => node.textContent)).includes("Auto · Balance"), "trigger shows Auto · Balance");
  await page.click(trigger);
  await page.waitForSelector('[role=listbox][aria-label="Models"]');
  const options = await page.$$eval("[data-model-option]", (nodes) => nodes.map((node) => node.dataset.modelOption));
  check(
    ["auto:intelligence", "auto:balance", "auto:cost"].every((key) => options.includes(key)),
    "Auto offers Intelligence, Balance and Cost",
  );
  const missing = wanted.filter((name) => !options.includes(name));
  check(missing.length === 0, `all 8 local models are listed${missing.length ? ` (missing ${missing.join(", ")})` : ""}`);
  const notInstalled = options.filter((name) => !name.startsWith("auto:") && !installed.models.includes(name));
  check(notInstalled.length === 0, "only installed models are listed as selectable");
  check(
    (await page.$eval('[data-model-option="auto:balance"]', (node) => node.getAttribute("aria-selected"))) === "true",
    "the current selection is marked",
  );
  const groupOf = (name) =>
    page.$eval(`[data-model-option="${name}"]`, (node) => node.closest("[role=group]")?.getAttribute("aria-label"));
  check((await groupOf("qwen2.5-coder:14b")) === "Coding", "coder models are grouped under Coding");
  check((await groupOf("deepseek-r1:1.5b")) === "Reasoning", "deepseek-r1 is grouped under Reasoning");
  check((await groupOf("llama3.2:3b")) === "General", "llama3.2 is grouped under General");
  check(
    (await page.$('[data-model-option="gemma3:4b"] [data-capability="images"]')) !== null,
    "gemma3:4b shows the image input capability",
  );
  check(
    (await page.$('[data-model-option="qwen2.5:1.5b"] [data-capability="images"]')) === null &&
      (await page.$('[data-model-option="deepseek-r1:1.5b"] [data-capability="reasoning"]')) !== null &&
      (await page.$('[data-model-option="qwen2.5-coder:14b"] [data-capability="coding"]')) !== null,
    "capabilities follow what Ollama reports (no images on qwen2.5, reasoning on deepseek-r1, coding on the coder)",
  );
  const windows = await page.$$eval("[data-context-window]", (nodes) =>
    nodes.map((node) => ({ model: node.closest("[data-model-option]")?.dataset.modelOption, tokens: Number(node.dataset.contextWindow) })),
  );
  const ps = await fetch("http://127.0.0.1:11434/api/ps").then((response) => response.json()).catch(() => ({ models: [] }));
  const runningOk = (ps.models ?? []).every((running) => {
    const shown = windows.find((entry) => entry.model === running.name);
    return !shown || shown.tokens === running.context_length;
  });
  check(runningOk && windows.length > 0, "loaded models show the context window Ollama reports for them");
  const maxima = await Promise.all(
    windows.map(async (entry) => {
      const show = await fetch("http://127.0.0.1:11434/api/show", { method: "POST", body: JSON.stringify({ model: entry.model }) }).then((r) => r.json());
      const key = Object.keys(show.model_info ?? {}).find((field) => field.endsWith(".context_length"));
      return { ...entry, max: key ? show.model_info[key] : null };
    }),
  );
  check(
    maxima.every((entry) => !entry.tokens || entry.max === null || entry.tokens <= entry.max),
    "no model is shown with a window larger than it supports",
  );
  await shot("picker");
  await page.type('input[aria-label="Search models"]', "coder");
  const searched = await page.$$eval("[data-model-option]", (nodes) => nodes.map((node) => node.dataset.modelOption));
  check(
    searched.length === 2 && searched.every((name) => name.includes("coder")),
    `search filters the list (${searched.join(", ")})`,
  );
  await page.$eval('input[aria-label="Search models"]', (node) => node.select());
  await page.type('input[aria-label="Search models"]', "zzqq");
  await page.waitForFunction(() => document.querySelector('[role=listbox][aria-label="Models"]')?.textContent?.includes("No models match"));
  check(true, "search shows an empty state");
  await page.$eval('input[aria-label="Search models"]', (node) => node.select());
  await page.keyboard.press("Backspace");
  await page.keyboard.press("ArrowDown");
  check(
    (await page.evaluate(() => document.activeElement?.dataset.modelOption)) === "auto:intelligence",
    "arrow keys move from search into the list",
  );
  await page.click('[data-model-option="llama3.2:1b"]');
  await page.waitForFunction(() => document.querySelector('button[aria-label="Choose model"]')?.textContent?.includes("llama3.2:1b"));
  check(true, "manual selection updates the trigger");
  await page.click(trigger);
  await page.click('[data-model-option="auto:cost"]');
  await page.waitForFunction(() => document.querySelector('button[aria-label="Choose model"]')?.textContent?.includes("Auto · Cost"));
  check(true, "switching back to Auto works");

  // ---------- routing ----------
  const quick = "Say hello in one word.";
  const code = "In Python, which keyword defines a function? Answer with the keyword only.";
  const cost = await autoTurn("cost", quick);
  const intelligence = await autoTurn("intelligence", code);
  const costCode = await autoTurn("cost", code);
  const balance = await autoTurn("balance", quick);
  for (const [label, result] of Object.entries({ cost, intelligence, costCode, balance })) {
    check(result.status === 200 && result.meta.auto?.reason, `${label}: Auto answered with ${result.meta.model} (${result.meta.auto?.reason ?? result.error})`);
  }
  check(
    ["gemma3:1b", "llama3.2:1b", "qwen2.5:1.5b", "qwen2.5-coder:1.5b", "deepseek-r1:1.5b"].includes(cost.meta.model),
    `Cost mode picks a small model for a quick question (${cost.meta.model})`,
  );
  check(intelligence.meta.model === "qwen2.5-coder:14b", `Intelligence mode picks the strongest coding model (${intelligence.meta.model})`);
  check(/coder/.test(costCode.meta.model ?? ""), `Cost mode still picks a coding model for code (${costCode.meta.model})`);
  check(new Set([cost.meta.model, intelligence.meta.model]).size === 2, "modes change which model answers");
  check(/def/i.test(intelligence.text), `the coding reply is real (${intelligence.text.slice(0, 40)})`);

  // An image goes to a model that can read it.
  const upload = await page.evaluate(async (bytes) => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(bytes)], "red.png", { type: "image/png" }));
    const response = await fetch("/api/attachments", { method: "POST", body: form });
    return (await response.json()).attachment;
  }, [...png(64, 64, [220, 20, 20])]);
  const imageChat = await newChat({ mode: "balance" });
  const image = await turn(imageChat, [userMessage("What color is this image? One word.", { attachments: [{ id: upload.id }] })], {
    mode: "balance",
  });
  check(
    image.status === 200 && image.meta.model === "gemma3:4b",
    `Auto sends an image to a vision model (${image.meta?.model ?? `${image.status} ${image.error}`})`,
  );
  check(/red/i.test(image.text), `the vision reply reads the image (${image.text.slice(0, 40)})`);

  // Switching models mid-chat keeps the history.
  const thread = await newChat({ model: "llama3.2:1b" });
  const first = userMessage("My secret codename is ZORBLAX. Reply only with: noted.");
  const one = await turn(thread, [first], { model: "llama3.2:1b", providerId: "ollama" });
  const assistant = { id: one.id ?? crypto.randomUUID(), role: "assistant", parts: [{ type: "text", text: one.text }] };
  const two = await turn(thread, [first, assistant, userMessage("What is my secret codename? Reply with the codename only.")], {
    model: "gemma3:4b",
    providerId: "ollama",
  });
  check(one.meta.model === "llama3.2:1b" && two.meta.model === "gemma3:4b", "the same chat answered with two models");
  check(/zorblax/i.test(two.text), `the second model saw the earlier turn (${two.text.slice(0, 40)})`);
  const stored = Number(sql(`SELECT COUNT(*) FROM messages WHERE conversation_id='${thread}'`));
  check(stored === 4, `the full history is stored (${stored} messages)`);

  // The chat remembers its Auto mode.
  await page.goto(`${base}/chat/${intelligence.conversationId}`, { waitUntil: "networkidle0" });
  check(
    (await page.$eval(trigger, (node) => node.textContent)).includes("Auto · Intelligence"),
    "a chat reopens in the Auto mode it used",
  );
  check(
    (await page.$eval('[data-role="assistant"] [data-auto-reason]', (node) => node.dataset.autoReason)).startsWith("Auto picked"),
    "the reply says why Auto chose its model",
  );
  await shot("reply");

  // Refusals and the selection log.
  const unknown = await turn(thread, [userMessage("hi")], { model: "not-a-model:1b", providerId: "ollama" });
  check(unknown.status === 400, `an unknown model is refused (${unknown.status})`);
  const userId = sql(`SELECT id FROM users WHERE email='${user.email}'`);
  const logged = Number(sql(`SELECT COUNT(*) FROM model_selections WHERE user_id='${userId}'`));
  check(logged === 5, `every automatic choice is recorded (${logged})`);

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

console.log(failures === 0 ? `\nModels e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
