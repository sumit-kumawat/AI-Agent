// Context window and web links end to end: the composer's context meter and
// its breakdown (categories add up, window never above the model's maximum,
// draft counted live), the model's own token count after a reply, summarising
// a long conversation (summary stored, its usage recorded as feature
// "summary"), and link reading: a public page is read and cited, a private
// address is refused with a reason, and with link reading off the reply
// carries the fixed "cannot visit websites" message. The long conversation is
// built from this repository's own docs. Deletes the account at the end and
// restores the link reading setting.
//
//   npm run e2e:context      (server must be running; uses Chrome, Ollama and the internet)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
const db = process.env.E2E_DB ?? "data/harbor.db";
const ollama = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const MODEL = process.env.E2E_CONTEXT_MODEL ?? "qwen2.5:1.5b";
const NO_BROWSING =
  "I'm a large language model and cannot directly visit websites in this configuration. However, I can help review website content if you provide the URL, page content, or relevant documents.";
fs.mkdirSync(shots, { recursive: true });

const stamp = Date.now();
const user = { email: `e2e-context-${stamp}@harbor.local`, password: `context-${stamp}-pw` };
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
const quote = (text) => `'${String(text).replace(/'/g, "''")}'`;
const savedResearch = sql("SELECT value FROM settings WHERE key='research.config'");
function setLinkReading(enabled) {
  const current = savedResearch ? JSON.parse(sql("SELECT value FROM settings WHERE key='research.config'")) : {};
  const value = JSON.stringify({ ...current, linkReading: enabled });
  sql(
    `INSERT INTO settings (key, value, updated_at) VALUES ('research.config', ${quote(value)}, ${Date.now()})
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
  );
}
const lastMeta = (conversationId) =>
  JSON.parse(sql(`SELECT meta FROM messages WHERE conversation_id='${conversationId}' AND role='assistant' ORDER BY created_at DESC LIMIT 1`) || "{}");

const modelMax = await fetch(`${ollama}/api/show`, { method: "POST", body: JSON.stringify({ model: MODEL }) })
  .then((response) => response.json())
  .then((info) => Object.entries(info.model_info ?? {}).find(([key]) => key.endsWith(".context_length"))?.[1] ?? null);

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await (await browser.createBrowserContext()).newPage();
page.setDefaultTimeout(30_000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.setViewport({ width: 1366, height: 860 });
const shot = (name) => page.screenshot({ path: `${shots}/context_${name}.png` });

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

const textMessage = (role, text) => ({ id: crypto.randomUUID(), role, parts: [{ type: "text", text }] });

async function chat(conversationId, messages) {
  const response = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({ conversationId, model: MODEL, providerId: "ollama", messages }),
  });
  let meta = lastMeta(conversationId);
  for (let tries = 0; tries < 20 && !meta.context; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    meta = lastMeta(conversationId);
  }
  return { ...response, meta };
}
const newConversation = async () => (await api("/api/conversations", { method: "POST", body: JSON.stringify({}) })).body.id;
const modelKey = `ollama\u001f${MODEL}`;
const sumOf = (categories) => Object.values(categories).reduce((sum, value) => sum + value, 0);

try {
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", user.email);
  await page.type("#password", user.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
  setLinkReading(true);

  // ---------- The meter on a new chat ----------
  const fresh = await api(`/api/context?model=${encodeURIComponent(modelKey)}`);
  const snap = fresh.body.context;
  check(fresh.status === 200 && snap.categories.system > 0, `a new chat counts the system prompt (~${snap.categories.system} tokens)`);
  check(sumOf(snap.categories) === snap.estimatedTotal, "categories add up to the total, nothing counted twice");
  check(
    snap.window.tokens > 0 && (modelMax === null || snap.window.tokens <= modelMax),
    `the window (${snap.window.tokens}, ${snap.window.source}) is not above the model's maximum (${modelMax})`,
  );

  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });
  await page.waitForSelector("[data-context-meter]");
  await page.hover("[data-context-meter]");
  await page.waitForSelector("[data-context-breakdown]");
  const breakdown = await page.$eval("[data-context-breakdown]", (node) => node.textContent);
  check(/Context: ~[\d,]+ of [\d,]+ tokens/.test(breakdown) && /estimates/.test(breakdown), "hovering the meter shows the breakdown, marked as estimates");
  check(/Not used in this app: Tools, Skills, MCP servers, Sub-agents/.test(breakdown), "the breakdown says which categories are not used");
  await shot("breakdown");
  await page.mouse.move(10, 10);
  const before = Number(await page.$eval("[data-context-meter]", (node) => node.dataset.contextPercent));
  await page.type("textarea", "draft ".repeat(1_200), { delay: 0 });
  await page.hover("[data-context-meter]");
  await page.waitForSelector('[data-context-category="draft"]');
  const after = Number(await page.$eval("[data-context-meter]", (node) => node.dataset.contextPercent));
  check(after > before, `the draft is counted before sending (${before}% to ${after}%)`);
  await page.mouse.move(10, 10);

  // ---------- Exact count after a reply ----------
  const short = await newConversation();
  const reply = await chat(short, [textMessage("user", "Reply with one word: hello")]);
  const reported = reply.meta.context?.reported;
  check(reply.status === 200 && reported?.input > 0 && reported?.output > 0, `the model's own count is stored with the reply (${reported?.input} in, ${reported?.output} out)`);
  const usageRow = sql(`SELECT input_tokens, output_tokens, estimated FROM usage_events WHERE conversation_id='${short}' AND feature='chat'`);
  check(usageRow === `${reported?.input}|${reported?.output}|0`, `usage records the same exact numbers (${usageRow})`);
  await page.goto(`${base}/chat/${short}`, { waitUntil: "networkidle0" });
  await page.waitForSelector("[data-context-meter]");
  await page.hover("[data-context-meter]");
  await page.waitForSelector("[data-context-reported]");
  check(true, "the breakdown shows the exact count for the last reply");

  // ---------- Summarising a long conversation ----------
  const docs = ["README.md", "docs/PLATFORM.md", "docs/IDE.md"].map((file) => fs.readFileSync(file, "utf8")).join("\n\n");
  const chunks = [];
  for (let at = 0; chunks.length < 28; at = (at + 4_500) % Math.max(1, docs.length - 4_500)) chunks.push(docs.slice(at, at + 4_500));
  const long = [];
  chunks.forEach((chunk, index) => {
    long.push(textMessage("user", `Part ${index + 1} of our project notes. Keep it in mind.`));
    long.push(textMessage("assistant", chunk));
  });
  long.push(textMessage("user", "In one sentence: what is this project?"));
  const longId = await newConversation();
  const planned = await api(`/api/context?model=${encodeURIComponent(modelKey)}&conversationId=${longId}`);
  check(planned.status === 200, "context for an empty saved chat loads");
  const summarised = await chat(longId, long);
  const stored = sql(`SELECT length(summary), summary_count FROM conversations WHERE id='${longId}'`).split("|").map(Number);
  check(summarised.status === 200 && stored[0] > 50 && stored[1] > 0, `older messages were summarised and the summary stored (${stored[1]} messages, ${stored[0]} chars)`);
  const summaryUsage = sql(`SELECT count(*), sum(input_tokens) FROM usage_events WHERE conversation_id='${longId}' AND feature='summary'`).split("|").map(Number);
  check(summaryUsage[0] === 1 && summaryUsage[1] > 0, `the summarising call is recorded as usage (${summaryUsage[1]} input tokens)`);
  const longSnap = summarised.meta.context;
  check(longSnap?.summarized === stored[1] && longSnap.categories.summary > 0, "the reply's context shows the summary instead of the old messages");
  check(
    longSnap.reported && longSnap.reported.input <= longSnap.window.tokens,
    `the prompt fit the window (${longSnap.reported?.input} of ${longSnap.window.tokens} tokens)`,
  );
  const reopened = (await api(`/api/context?model=${encodeURIComponent(modelKey)}&conversationId=${longId}`)).body.context;
  check(reopened.summarized === stored[1] && reopened.pendingSummary === 0, "reopening the chat reuses the stored summary");

  // ---------- Links ----------
  const linked = await newConversation();
  const web = await chat(linked, [textMessage("user", "What is the title of https://example.com and what does http://127.0.0.1:3000/api/health say?")]);
  const sources = web.meta.web ?? [];
  const pub = sources.find((source) => source.url.startsWith("https://example.com"));
  const priv = sources.find((source) => source.url.includes("127.0.0.1"));
  check(web.status === 200 && pub?.ok && /example domain/i.test(pub.title), `a public link is read (${pub?.title ?? pub?.error})`);
  check(priv && !priv.ok && /private/i.test(priv.error), `a private address is refused with a reason (${priv?.error})`);
  check(web.meta.context?.categories.web > 0, "the page text is counted under Web pages");
  await page.goto(`${base}/chat/${linked}`, { waitUntil: "networkidle0" });
  await page.waitForSelector("[data-web-sources]");
  const shown = await page.$$eval("[data-web-source]", (nodes) => nodes.map((node) => node.dataset.webSource).sort().join(","));
  check(shown === "failed,ok", "the reply lists the pages read and the one that failed");
  await shot("links");

  setLinkReading(false);
  const off = await newConversation();
  const refused = await chat(off, [textMessage("user", "Open https://example.com and summarise it.")]);
  check(refused.meta.webNotice === NO_BROWSING && !refused.meta.web, "with link reading off nothing is fetched and the fixed message is attached");
  await page.goto(`${base}/chat/${off}`, { waitUntil: "networkidle0" });
  const visible = await page.$eval("[data-role=assistant]", (node) => node.textContent);
  check(visible.includes(NO_BROWSING), "the fixed message is shown with the reply");
  const limitations = async () => {
    await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });
    await page.click('button[aria-label="Choose model"]');
    await page.waitForSelector(`[data-model-option="${MODEL}"]`);
    const text = await page.$eval(`[data-model-option="${MODEL}"]`, (node) => node.dataset.limitations);
    await page.keyboard.press("Escape");
    return text;
  };
  check(/Cannot visit websites/.test(await limitations()), "model descriptions say websites cannot be visited");
  setLinkReading(true);
  check(/links you paste/.test(await limitations()), "with link reading on they say pasted links are read");

  check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(" | ")}` : ""}`);
} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error);
  await shot("failure").catch(() => {});
} finally {
  if (savedResearch) sql(`UPDATE settings SET value=${quote(savedResearch)} WHERE key='research.config'`);
  else sql("DELETE FROM settings WHERE key='research.config'");
  try {
    const removed = await api("/api/account", { method: "DELETE", body: JSON.stringify({ password: user.password }) });
    check(removed.status === 204, "cleanup: test user deleted");
  } catch {
    check(false, `cleanup: could not delete ${user.email}`);
  }
  await browser.close();
}

console.log(failures === 0 ? `\nContext e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
