// Browser test for chat attachments. Builds real PDF, Word, Excel, CSV, code
// and PNG files, checks server-side validation, then uses the composer in
// headless Chrome: picker and drag-and-drop, progress, remove and replace,
// questions about a document, a long document answered from retrieved
// sections, the image gate for text-only models, an image to a vision model,
// and that files survive a reload. Deletes the account at the end.
//
//   npm run e2e:attachments        (server must be running; uses Chrome)
//   E2E_MODEL=qwen2.5:1.5b E2E_VISION_MODEL=gemma3:4b npm run e2e:attachments
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
const model = process.env.E2E_MODEL ?? "qwen2.5:1.5b";
const visionModel = process.env.E2E_VISION_MODEL ?? "gemma3:4b";
fs.mkdirSync(shots, { recursive: true });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harbor-files-"));

// ---------- fixtures ----------

function pdf(lines) {
  const stream = `BT /F1 14 Tf 72 720 Td 18 TL ${lines.map((line) => `(${line.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

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

async function docx(paragraphs) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
      .map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`)
      .join("")}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function xlsx() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Budget");
  sheet.addRow(["Item", "Cost"]);
  sheet.addRow(["Rent", 1200]);
  sheet.addRow(["Food", 450]);
  sheet.addRow(["Total", { formula: "B2+B3", result: 1650 }]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

const filler = (n) =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i + 1}. The committee discussed routine budget items, scheduling and minutes.`).join("\n\n");
const longText = `${filler(300)}\n\nImportant: the warehouse access code is ZEBRA-7781 and it changes every quarter.\n\n${filler(300)}`;

const files = {
  "report.pdf": pdf(["Quarterly report", "The secret code word is PELICAN-42.", "Revenue grew by 12 percent."]),
  "letter.docx": await docx(["Dear team,", "The offsite will be held in Lisbon on 14 March.", "Regards, Ana"]),
  "budget.xlsx": await xlsx(),
  "notes.csv": Buffer.from("name,score\nalice,91\nbob,78\n"),
  "util.py": Buffer.from("def add(a, b):\n    return a + b\n"),
  "red.png": png(64, 64, [220, 20, 20]),
  "minutes.txt": Buffer.from(longText),
  "fake.png": Buffer.from("this is not really an image"),
  "tool.exe": Buffer.from("MZ binary"),
};
for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), bytes);
const file = (name) => path.join(dir, name);

// ---------- run ----------

const stamp = Date.now();
const user = { email: `e2e-files-${stamp}@harbor.local`, password: `files-${stamp}-pw` };
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
const page = await (await browser.createBrowserContext()).newPage();
page.setDefaultTimeout(30_000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.setViewport({ width: 1366, height: 860 });
const shot = (name) => page.screenshot({ path: `${shots}/files_${name}.png` });
const text = () => page.evaluate(() => document.body.innerText);
const lastReply = () =>
  page.evaluate(() => [...document.querySelectorAll('[data-role="assistant"]')].at(-1)?.innerText ?? "");
const waitIdle = () =>
  page.waitForFunction(
    () => {
      const last = [...document.querySelectorAll('[data-role="assistant"]')].at(-1);
      return !document.querySelector('button[aria-label="Stop generating"]') && last?.querySelector('button[aria-label="Copy"]');
    },
    { timeout: 240_000 },
  );
const waitReady = (count) =>
  page.waitForFunction(
    (n) => document.querySelectorAll('[data-attachment="ready"]').length === n && !document.querySelector('[data-attachment="uploading"]'),
    { timeout: 60_000 },
    count,
  );

/** Uploads through the API from the signed-in page, as the composer would. */
const apiUpload = (name) =>
  page.evaluate(
    async (fileName, bytes) => {
      const form = new FormData();
      form.append("file", new File([new Uint8Array(bytes)], fileName));
      const response = await fetch("/api/attachments", { method: "POST", body: form });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    name,
    [...files[name]],
  );

async function openChatWith(name) {
  await page.evaluate((value) => localStorage.setItem("harbor-model", value), name);
  await page.goto(`${base}/chat`, { waitUntil: "networkidle0" });
}

async function ask(question) {
  await page.click('textarea[aria-label="Message"]');
  await page.keyboard.type(question);
  await page.keyboard.press("Enter");
}

try {
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", user.email);
  await page.type("#password", user.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);

  // Server-side validation and extraction.
  const results = {};
  for (const name of ["report.pdf", "letter.docx", "budget.xlsx", "notes.csv", "util.py", "red.png"]) {
    results[name] = await apiUpload(name);
  }
  check(
    Object.values(results).every((result) => result.status === 201),
    `PDF, Word, Excel, CSV, code and PNG uploads are accepted (${Object.entries(results).map(([n, r]) => `${n}:${r.status}`).join(", ")})`,
  );
  check(results["report.pdf"].body?.attachment?.pages === 1 && results["report.pdf"].body.attachment.chars > 20, "PDF text and page count are extracted");
  check(results["letter.docx"].body?.attachment?.chars > 20, "Word text is extracted");
  check(results["budget.xlsx"].body?.attachment?.chars > 10, "spreadsheet cells are extracted");
  check(results["red.png"].body?.attachment?.kind === "image" && results["red.png"].body.attachment.mime === "image/png", "PNG is recognised by its bytes");
  const fake = await apiUpload("fake.png");
  check(fake.status === 422 && /damaged or is not/i.test(fake.body?.error ?? ""), `a text file named .png is refused (${fake.status}: ${fake.body?.error})`);
  const exe = await apiUpload("tool.exe");
  check(exe.status === 422 && /not supported/i.test(exe.body?.error ?? ""), `unsupported types are refused (${exe.body?.error})`);
  const pdfId = results["report.pdf"].body.attachment.id;
  const download = await page.evaluate(async (id) => {
    const response = await fetch(`/api/attachments/${id}`);
    return { status: response.status, type: response.headers.get("content-type"), disposition: response.headers.get("content-disposition"), nosniff: response.headers.get("x-content-type-options") };
  }, pdfId);
  check(
    download.status === 200 && download.type === "application/octet-stream" && download.disposition?.startsWith("attachment") && download.nosniff === "nosniff",
    "non-image files download instead of opening inline",
  );
  const missing = await page.evaluate(async () => (await fetch(`/api/attachments/${crypto.randomUUID()}`)).status);
  check(missing === 404, "unknown attachment ids return 404");
  const anonymous = await (await fetch(`${base}/api/attachments/${pdfId}`)).status;
  check(anonymous === 401, "attachments are not readable without signing in");
  const deletes = await page.evaluate(async (ids) => {
    const statuses = [];
    for (const id of ids) statuses.push((await fetch(`/api/attachments/${id}`, { method: "DELETE" })).status);
    return statuses;
  }, Object.values(results).map((result) => result.body.attachment.id));
  check(deletes.every((status) => status === 204), "unsent files can be deleted");

  // Composer: picker, remove, replace and drag-and-drop.
  await openChatWith(model);
  const picker = await page.$("input[data-file-input]");
  await picker.uploadFile(file("report.pdf"), file("notes.csv"), file("fake.png"));
  await page.waitForFunction(() => document.querySelectorAll("[data-attachment]").length === 3);
  await page.waitForFunction(() => document.querySelector('[data-attachment="error"]') && document.querySelectorAll('[data-attachment="ready"]').length === 2, { timeout: 60_000 });
  check(
    (await page.$eval('[data-attachment="error"]', (node) => node.innerText)).includes("damaged or is not"),
    "a file that fails validation shows why in the tray",
  );
  const sendDisabled = await page.$eval('button[aria-label="Send message"]', (node) => node.disabled);
  check(sendDisabled, "send waits until failed files are removed or replaced");
  await shot("tray_error");
  await page.click('button[aria-label="Replace fake.png"]');
  const replaceInput = await page.$("[data-attachment-tray] input[type=file]");
  await replaceInput.uploadFile(file("letter.docx"));
  await waitReady(3);
  check((await text()).includes("letter.docx") && !(await text()).includes("fake.png"), "a failed file can be replaced");
  await page.click('button[aria-label="Remove notes.csv"]');
  await page.click('button[aria-label="Remove letter.docx"]');
  await waitReady(1);
  check(!(await text()).includes("notes.csv"), "files can be removed before sending");
  await page.evaluate(async (bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "util.py", { type: "text/x-python" }));
    const form = document.querySelector("form textarea[aria-label=Message]").closest("form");
    for (const type of ["dragenter", "dragover", "drop"]) {
      form.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }
  }, [...files["util.py"]]);
  await waitReady(2);
  check((await text()).includes("util.py"), "files can be dropped onto the composer");
  await page.click('button[aria-label="Remove util.py"]');
  await waitReady(1);
  await shot("tray_ready");

  // Ask about the document.
  await ask("What is the secret code word in the attached report? Reply with just the code word.");
  await page.waitForFunction(() => location.pathname.startsWith("/chat/") && location.pathname !== "/chat/");
  await waitIdle();
  check((await lastReply()).toUpperCase().includes("PELICAN"), `the reply uses the PDF's text (${(await lastReply()).slice(0, 80)})`);
  check(Boolean(await page.$("[data-message-attachments]")), "the sent message shows its file");
  check(!(await page.$("[data-attachment-tray]")), "the tray clears after sending");
  await shot("answered");

  // Follow-up without re-attaching still sees the file.
  await ask("By what percent did revenue grow according to the report? Answer with the number.");
  await waitIdle();
  check((await lastReply()).includes("12"), `follow-up questions still see the file (${(await lastReply()).slice(0, 80)})`);

  // Reload keeps the file on its message.
  await page.reload({ waitUntil: "networkidle0" });
  check((await page.$$("[data-message-attachments] a")).length === 1 && (await text()).includes("report.pdf"), "files stay on their message after a reload");

  // Long document: retrieval finds the one relevant section.
  await openChatWith(model);
  await (await page.$("input[data-file-input]")).uploadFile(file("minutes.txt"));
  await waitReady(1);
  await ask("What is the warehouse access code? Reply with just the code.");
  await page.waitForFunction(() => location.pathname !== "/chat");
  await waitIdle();
  const longReply = await lastReply();
  check(longReply.toUpperCase().includes("ZEBRA-7781"), `a long file is answered from its relevant section (${longReply.slice(0, 80)})`);
  check(/answered from \d+ of \d+ sections/.test(longReply), "the reply says it read only part of a long file");

  // Images: refused for text-only models, read by a vision model.
  await openChatWith(model);
  await (await page.$("input[data-file-input]")).uploadFile(file("red.png"));
  await waitReady(1);
  await page.click('textarea[aria-label="Message"]');
  await page.keyboard.type("What colour is this image?");
  const gated = await page.$eval('button[aria-label="Send message"]', (node) => node.disabled);
  check(gated && (await text()).includes("cannot read images"), "text-only models cannot be sent an image");
  await shot("vision_gate");
  const hasVision = await page.evaluate(async (name) => {
    const data = await (await fetch("/api/models")).json();
    return JSON.stringify(data).includes(name);
  }, visionModel);
  if (hasVision) {
    await page.click('button[aria-label="Choose model"]');
    await page.evaluate((name) => {
      const item = [...document.querySelectorAll("[role=menuitemradio]")].find((node) => node.textContent.includes(name));
      item?.click();
    }, visionModel);
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Send message"]').disabled);
    await page.click('button[aria-label="Send message"]');
    await page.waitForFunction(() => location.pathname !== "/chat");
    await waitIdle();
    check(/red/i.test(await lastReply()), `${visionModel} reads the image (${(await lastReply()).slice(0, 80)})`);
  } else {
    console.log(`skip ${visionModel} is not installed, so the image answer was not checked`);
  }

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
    check(removed === 204, "cleanup: test user and their files deleted");
  } catch {
    check(false, `cleanup: could not delete ${user.email}`);
  }
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? `\nAttachments e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
