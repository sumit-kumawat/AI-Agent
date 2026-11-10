// Browser test for Deep Research. Runs a real research request against
// Wikipedia and checks live progress, numbered citations that link to the
// retrieved pages, the Sources list, Markdown export, follow-up questions and
// reload. Then, as an admin, points research at a fake SearXNG whose only
// result is a private address: the page must not be fetched and the report
// must say it used the snippet only. Finally turns every source off and checks
// the composer disables Deep Research. The original source settings are
// restored at the end.
//
//   npm run e2e:research           (server must be running; uses Chrome)
//   E2E_MODEL=qwen2.5:1.5b npm run e2e:research
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
const model = process.env.E2E_MODEL ?? "qwen2.5:1.5b";
const database = path.join(process.env.DATA_DIR ?? "data", "harbor.db");
fs.mkdirSync(shots, { recursive: true });
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "harbor-research-"));

const sql = (statement) => execFileSync("sqlite3", [database, statement], { encoding: "utf8" }).trim();
const savedConfig = sql("SELECT value FROM settings WHERE key = 'research.config'");

// A stand-in SearXNG whose only result points at a private address.
const hits = [];
const fake = http.createServer((request, response) => {
  hits.push(request.url);
  const port = fake.address().port;
  if (request.url.startsWith("/search")) {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        results: [
          {
            url: `http://127.0.0.1:${port}/secret`,
            title: "Internal wiki: Lighthouse keepers",
            content: "Lighthouse keepers maintained the lamps, trimmed wicks and recorded weather in a logbook.",
          },
        ],
      }),
    );
    return;
  }
  response.end("internal secret page");
});
await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
const fakeUrl = `http://127.0.0.1:${fake.address().port}`;

const stamp = Date.now();
const user = { email: `e2e-research-${stamp}@harbor.local`, password: `research-${stamp}-pw` };
execFileSync(
  process.execPath,
  ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/seed.mjs"],
  { env: { ...process.env, SEED_USER_EMAIL: user.email, SEED_USER_PASSWORD: user.password, SEED_USER_PLAN: "advance" }, stdio: "ignore" },
);
sql(`UPDATE users SET role = 'admin' WHERE email = '${user.email}'`);

let failures = 0;
function check(condition, label) {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) failures += 1;
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await (await browser.createBrowserContext()).newPage();
page.setDefaultTimeout(30_000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.setViewport({ width: 1366, height: 900 });
const cdp = await browser.target().createCDPSession();
await cdp.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: downloads,
  browserContextId: page.browserContext().id,
});
const shot = (name) => page.screenshot({ path: `${shots}/research_${name}.png` });
const lastReply = () =>
  page.evaluate(() => [...document.querySelectorAll('[data-role="assistant"]')].at(-1)?.innerText ?? "");
const waitIdle = (timeout = 420_000) =>
  page.waitForFunction(
    () => {
      const last = [...document.querySelectorAll('[data-role="assistant"]')].at(-1);
      return !document.querySelector('button[aria-label="Stop generating"]') && last?.querySelector('button[aria-label="Copy"]');
    },
    { timeout },
  );

async function research(question) {
  await page.waitForFunction(() => !document.querySelector("[data-research-toggle]")?.disabled, { timeout: 30_000 });
  await page.click("[data-research-toggle]");
  await page.click('textarea[aria-label="Message"]');
  await page.keyboard.type(question);
  await page.click('button[aria-label="Send message"]');
}

async function saveSources({ wikipedia, searxng }) {
  await page.goto(`${base}/admin/research`, { waitUntil: "networkidle0" });
  const setSwitch = async (title, on) => {
    const current = await page.$eval(`[data-source="${title}"] [role=switch]`, (node) => node.getAttribute("aria-checked") === "true");
    if (current !== on) await page.click(`[data-source="${title}"] [role=switch]`);
  };
  await setSwitch("Wikipedia", wikipedia);
  await setSwitch("SearXNG", Boolean(searxng));
  if (searxng) {
    await page.$eval("#searxng-url", (node) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(node, "");
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.type("#searxng-url", searxng);
  }
  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.body.innerText.includes("Research sources saved"));
}

try {
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", user.email);
  await page.type("#password", user.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
  await page.evaluate((name) => localStorage.setItem("harbor-model", name), model);

  // Start from Wikipedia only.
  await saveSources({ wikipedia: true, searxng: null });
  const status = await page.evaluate(async () => (await fetch("/api/research/status")).json());
  check(status.available && status.sources.some((source) => source.name === "Wikipedia" && source.ok), "Wikipedia is configured and reachable");

  // 1. A real research run.
  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });
  await research("How does a lighthouse lens (Fresnel lens) work, and who invented it?");
  await page.waitForSelector('[data-research="running"]', { timeout: 60_000 });
  check(true, "a progress panel appears while research runs");
  await page.waitForSelector('[data-research="running"] [data-step]', { timeout: 120_000 });
  const live = await page.$$eval('[data-research="running"] [data-step]', (nodes) => nodes.map((node) => node.innerText));
  check(live.some((label) => /Planning|Searching/.test(label)), `steps stream in real time (${live.length} so far)`);
  await shot("running");
  await waitIdle();
  await shot("done");
  const report = await lastReply();
  check(await page.$('[data-research="done"]'), `research finishes (${(await page.$eval("[data-research]", (node) => node.innerText)).split("\n")[0]})`);
  check(/##?\s*Summary|Summary/.test(report) && /Findings/.test(report), "the report has Summary and Findings sections");
  check(/Sources/.test(report), "the report ends with a Sources list");
  const links = await page.evaluate(() => {
    const reply = [...document.querySelectorAll('[data-role="assistant"]')].at(-1);
    return [...reply.querySelectorAll("a[href]")].map((node) => ({ text: node.innerText.trim(), href: node.href }));
  });
  const sourceLinks = links.filter((link) => /wikipedia\.org/.test(link.href));
  check(sourceLinks.length > 0, `sources link to the retrieved Wikipedia pages (${sourceLinks.length} links)`);
  check(links.every((link) => /wikipedia\.org/.test(link.href)), "no link points anywhere that was not retrieved");
  const citations = links.filter((link) => /^\d+$/.test(link.text));
  const uncited = /did not cite any source/.test(report);
  check(
    citations.length > 0 || uncited,
    citations.length > 0
      ? `numbered citations in the text link to their sources (${citations.length})`
      : "the model gave no citations and the report says nothing is verified",
  );

  await page.click('[data-research="done"] button[aria-expanded]');
  await page.waitForSelector("[data-research-sources] [data-source]");
  const listed = await page.$$eval("[data-research-sources] [data-source]", (nodes) =>
    nodes.map((node) => ({ cited: node.dataset.cited, text: node.innerText })),
  );
  check(
    listed.length > 0 && listed.every((source) => /Read in full|Snippet only/.test(source.text)),
    `the panel lists each source with how it was used (${listed.length}, ${listed.filter((source) => source.cited === "yes").length} cited)`,
  );
  await page.click('[data-research="done"] button[aria-expanded]');
  const followUps = await page.$$eval("[data-follow-up]", (nodes) => nodes.map((node) => node.innerText.trim()));
  check(followUps.length >= 3, `follow-up actions are offered under the report (${followUps.join(", ")})`);

  // 2. Export.
  await page.click('button[aria-label="Export report as Markdown"]');
  await page.waitForFunction(() => true);
  let exported = null;
  for (let tries = 0; tries < 20 && !exported; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    exported = fs.readdirSync(downloads).find((name) => name.endsWith(".md")) ?? null;
  }
  const markdown = exported ? fs.readFileSync(path.join(downloads, exported), "utf8") : "";
  check(Boolean(exported) && markdown.startsWith("# How does a lighthouse") && markdown.includes("wikipedia.org"), `the report exports as Markdown (${exported})`);

  // 3. Follow-up in normal chat mode.
  check(!(await page.$eval("[data-research-toggle]", (node) => node.getAttribute("aria-pressed") === "true")), "Deep Research turns off after each run");
  await page.click('[data-follow-up="chat"]');
  await waitIdle(180_000);
  check((await page.$$('[data-role="assistant"]')).length === 2 && (await lastReply()).length > 20, "a follow-up action is answered in the same chat");
  check(!(await page.$("[data-follow-up]")), "follow-up actions only show under the latest report");

  // 4. Reload keeps the report, its progress record and sources.
  await page.reload({ waitUntil: "networkidle0" });
  check(Boolean(await page.$('[data-research="done"]')), "the research record survives a reload");
  const reloadedCitations = await page.evaluate(
    () => [...document.querySelectorAll('[data-role="assistant"]')][0].querySelectorAll('a[href*="wikipedia.org"]').length,
  );
  check(reloadedCitations > 0, "citations still link after a reload");

  // 5. SearXNG with a private result: the page is not fetched.
  await saveSources({ wikipedia: false, searxng: fakeUrl });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((node) => node.innerText.trim() === "Test sources")?.click());
  await page.waitForSelector('[data-source="SearXNG"] [data-status]', { timeout: 30_000 });
  check(
    (await page.$eval('[data-source="SearXNG"] [data-status]', (node) => node.dataset.status)) === "ok",
    "the admin test reports SearXNG working",
  );
  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });
  await research("What did lighthouse keepers do?");
  await waitIdle();
  const privateReport = await lastReply();
  await page.click('[data-research] button[aria-expanded]');
  const steps = await page.$eval("[data-research-steps]", (node) => node.innerText);
  await shot("private");
  check(hits.some((url) => url.startsWith("/search")), "research queried the configured SearXNG");
  check(!hits.includes("/secret"), "the private result address was never fetched");
  check(/Private addresses are not fetched/.test(steps), "the progress shows why the page was skipped");
  check(/search snippet only/.test(privateReport), "the Sources list marks it as snippet only");

  // 6. Every source off: Deep Research is disabled with a reason.
  await saveSources({ wikipedia: false, searxng: null });
  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector("[data-research-toggle]")?.title.includes("No search source"));
  check(await page.$eval("[data-research-toggle]", (node) => node.disabled), "Deep Research is disabled when no source is configured");
  const refused = await page.evaluate(async () => {
    const id = crypto.randomUUID();
    const created = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).then((response) => response.json());
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: created.id, research: true, messages: [{ id, role: "user", parts: [{ type: "text", text: "test" }] }] }),
    });
    return response.text();
  });
  check(/needs a search source/.test(refused) && !/\[1\]/.test(refused), "a forced request gets an explanation, not an invented report");

  check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(" | ")}` : ""}`);
} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error);
  await shot("failure").catch(() => {});
} finally {
  if (savedConfig) sql(`UPDATE settings SET value = '${savedConfig.replaceAll("'", "''")}' WHERE key = 'research.config'`);
  else sql("DELETE FROM settings WHERE key = 'research.config'");
  try {
    sql(`UPDATE users SET role = 'user' WHERE email = '${user.email}'`);
    const removed = await page.evaluate(async (password) => {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      return response.status;
    }, user.password);
    check(removed === 204, "cleanup: test user deleted and source settings restored");
  } catch {
    check(false, `cleanup: could not delete ${user.email}`);
  }
  await browser.close();
  fake.close();
  fs.rmSync(downloads, { recursive: true, force: true });
}

console.log(failures === 0 ? `\nResearch e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
