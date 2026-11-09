// Accounts, IDs and admin roles. Registration makes regular users only, with a
// generated XAIU user ID and username; sign-in works with the username; the
// server CLI bootstraps a Super Administrator who must change the password;
// only a Super Administrator can change roles or act on admin accounts, and
// that is enforced on the server, not just hidden in the menu. Deletes the
// test accounts at the end.
//
//   npm run e2e:auth        (server must be running; uses Chrome)
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const base = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = process.env.E2E_SHOTS ?? "/tmp/harbor-e2e";
const db = process.env.E2E_DB ?? "data/harbor.db";
fs.mkdirSync(shots, { recursive: true });

const stamp = Date.now();
const year = new Date().getFullYear();
const superAdmin = {
  email: `e2e-super-${stamp}@harbor.local`,
  username: `e2e-super-${stamp}`,
  password: `super-${stamp}-initial`,
};
const plain = { name: "Plain Admin", email: `e2e-plain-${stamp}@harbor.local`, password: `plain-${stamp}-pw` };
const member = { name: "Member", email: `e2e-member-${stamp}@harbor.local`, password: `member-${stamp}-pw` };

let failures = 0;
function check(condition, label) {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) failures += 1;
}

const sql = (query) => execFileSync("sqlite3", [db, query], { encoding: "utf8" }).trim();
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const row = (email) => {
  const [id, publicId, username, role, firstLogin] = sql(
    `SELECT id, public_id, username, role, first_login FROM users WHERE email=${quote(email)}`,
  ).split("|");
  return { id, publicId, username, role, firstLogin: firstLogin === "1" };
};

function bootstrap(email, username, password) {
  return spawnSync("npm", ["run", "--silent", "admin:bootstrap", "--", "--email", email, "--username", username], {
    input: password,
    encoding: "utf8",
  });
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });

async function newPage() {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport({ width: 1280, height: 860 });
  page.setDefaultTimeout(20_000);
  page.on("dialog", (dialog) => {
    check(false, `native ${dialog.type()} dialog appeared: ${dialog.message()}`);
    void dialog.dismiss();
  });
  return page;
}

async function signIn(page, login, password) {
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", login);
  await page.type("#password", password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
}

async function clickText(page, text, scope = "") {
  const handle = await page.waitForSelector(`${scope} ::-p-text(${text})`, { visible: true });
  await handle.click();
}

async function popup(page, title) {
  const find = (value) =>
    [...document.querySelectorAll("[role=alertdialog]")].find((node) => node.innerText.includes(value)) ?? null;
  await page.waitForFunction(find, {}, title);
  const dialog = await page.evaluateHandle(find, title);
  await dialog.evaluate((node) => node.querySelector("button[type=submit]")?.click());
  await page.waitForFunction(
    (value) => ![...document.querySelectorAll("[role=alertdialog]")].some((node) => node.innerText.includes(value)),
    {},
    title,
  );
}

async function openRowMenu(page, email) {
  await page.goto(`${base}/admin/users?q=${encodeURIComponent(email)}`, { waitUntil: "networkidle0" });
  await page.click(`button[aria-label="Actions for ${email}"]`);
  await page.waitForSelector("[role=menu]");
  return page.$eval("[role=menu]", (node) => node.innerText);
}

/** Remembers the server action ID behind the next admin action, so it can be replayed as someone else. */
function captureAction(page) {
  return new Promise((resolve) => {
    const listener = (request) => {
      const id = request.headers()["next-action"];
      if (!id) return;
      page.off("request", listener);
      resolve(id);
    };
    page.on("request", listener);
  });
}

/** Calls a server action directly, the way a hand-crafted request would. */
const callAction = (page, actionId, args) =>
  page.evaluate(
    async (id, body) => {
      const response = await fetch("/admin/users", {
        method: "POST",
        headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
        body: JSON.stringify(body),
      });
      return response.text();
    },
    actionId,
    args,
  );

const register = (page, account, extra = {}) =>
  page.evaluate(
    async (body) => {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return response.status;
    },
    { name: account.name, email: account.email, password: account.password, ...extra },
  );

try {
  // ---------- registration ----------
  const anon = await newPage();
  await anon.goto(`${base}/register`, { waitUntil: "networkidle0" });
  check(
    !(await anon.$("input[name=username], #username")),
    "the registration form has no username field",
  );
  check((await register(anon, plain, { role: "superadmin", username: "chosen" })) === 201, "registration succeeds");
  check((await register(anon, member)) === 201, "a second registration succeeds");
  check((await register(anon, member)) === 409, "a duplicate email is refused");
  const plainRow = row(plain.email);
  check(plainRow.role === "user", `registration never creates admins, even when asked (${plainRow.role})`);
  check(
    new RegExp(`^XAIU${year}[A-HJ-NP-Z2-9]{8}$`).test(plainRow.publicId),
    `user ID has the XAIU<year><8 characters> format (${plainRow.publicId})`,
  );
  check(/^user[a-hj-np-z2-9]{8}$/.test(plainRow.username) && plainRow.username !== "chosen", `username is generated (${plainRow.username})`);
  const memberRow = row(member.email);
  check(memberRow.publicId !== plainRow.publicId && memberRow.username !== plainRow.username, "IDs and usernames are unique");
  const missing = Number(sql("SELECT COUNT(*) FROM users WHERE public_id IS NULL OR username IS NULL"));
  check(missing === 0, `every account has a user ID and username (${missing} missing)`);

  // ---------- sign-in by username, account details ----------
  const plainPage = await newPage();
  await signIn(plainPage, plainRow.username, plain.password);
  check(new URL(plainPage.url()).pathname === "/chat", "sign-in works with the generated username");
  await plainPage.goto(`${base}/chat#settings/account`, { waitUntil: "networkidle0" });
  await plainPage.waitForSelector("[data-public-id]");
  const shown = await plainPage.evaluate(() => ({
    publicId: document.querySelector("[data-public-id]")?.textContent?.trim(),
    username: document.querySelector("[data-username]")?.textContent?.trim(),
    editable: Boolean(document.querySelector("[data-public-id] input, [data-username] input")),
  }));
  check(shown.publicId === plainRow.publicId && shown.username === plainRow.username, "Settings shows the user ID and username");
  check(!shown.editable, "the user ID and username cannot be edited");
  await plainPage.screenshot({ path: `${shots}/auth_account.png` });
  const wrongName = await newPage();
  await wrongName.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await wrongName.type("#email", `nosuchuser${stamp}`.slice(0, 30));
  await wrongName.type("#password", plain.password);
  await wrongName.click("button[type=submit]");
  await wrongName.waitForFunction(() => document.body.innerText.includes("Sign-in failed"));
  check(new URL(wrongName.url()).pathname === "/login", "an unknown username does not sign in");

  // ---------- Super Administrator bootstrap ----------
  const created = bootstrap(superAdmin.email, superAdmin.username, superAdmin.password);
  check(created.status === 0, `the CLI creates a Super Administrator${created.status ? `: ${created.stderr}` : ""}`);
  check(!`${created.stdout}${created.stderr}`.includes(superAdmin.password), "the CLI never prints the password");
  const superRow = row(superAdmin.email);
  check(superRow.role === "superadmin" && superRow.firstLogin, "it is a Super Administrator that must change its password");
  const hash = sql(`SELECT password_hash FROM users WHERE email=${quote(superAdmin.email)}`);
  check(hash.startsWith("$2") && !hash.includes(superAdmin.password), "only a bcrypt hash is stored");
  const taken = bootstrap(member.email, superAdmin.username, "another-password-1");
  check(taken.status !== 0 && row(member.email).role === "user", "the CLI refuses a username that belongs to someone else");
  const logged = sql(
    `SELECT COUNT(*) FROM admin_audit_log WHERE action='admin.bootstrap' AND target_id=${quote(superRow.id)}`,
  );
  check(logged === "1", "the bootstrap is in the audit log");

  const superPage = await newPage();
  await signIn(superPage, superAdmin.username, superAdmin.password);
  check(superPage.url().includes("/account/password"), "first sign-in forces a password change");
  await superPage.goto(`${base}/admin`, { waitUntil: "networkidle0" });
  check(superPage.url().includes("/account/password"), "the admin panel stays closed until the password is changed");
  await superPage.type("#current", superAdmin.password);
  superAdmin.password = `super-${stamp}-changed`;
  await superPage.type("#new", superAdmin.password);
  await superPage.type("#confirm", superAdmin.password);
  await Promise.all([
    superPage.waitForFunction(() => !location.pathname.startsWith("/account/password"), { timeout: 20_000 }),
    superPage.click("button[type=submit]"),
  ]);
  check(!row(superAdmin.email).firstLogin, "the new password clears the forced change");
  await superPage.goto(`${base}/admin/users`, { waitUntil: "networkidle0" });
  check(new URL(superPage.url()).pathname === "/admin/users", "the Super Administrator reaches the admin panel");

  // ---------- roles ----------
  const menu = await openRowMenu(superPage, plain.email);
  check(menu.includes("Change role to Administrator") && menu.includes("Change role to Super Administrator"), "a Super Administrator can change roles");
  const roleAction = captureAction(superPage);
  await clickText(superPage, "Change role to Administrator", "[role=menu]");
  await popup(superPage, "an Administrator?");
  const setRoleId = await roleAction;
  await superPage.waitForFunction(
    (email) => [...document.querySelectorAll("tr")].find((tr) => tr.innerText.includes(email))?.innerText.includes("Administrator"),
    {},
    plain.email,
  );
  check(row(plain.email).role === "admin", "the user is now an Administrator");
  await openRowMenu(superPage, member.email);
  const resetAction = captureAction(superPage);
  await clickText(superPage, "Reset password", "[role=menu]");
  await popup(superPage, "Reset password?");
  const resetId = await resetAction;
  await superPage.keyboard.press("Escape");

  await plainPage.goto(`${base}/admin/users`, { waitUntil: "networkidle0" });
  check(new URL(plainPage.url()).pathname === "/admin/users", "the Administrator can open the admin panel");
  const plainMenu = await openRowMenu(plainPage, superAdmin.email);
  check(
    plainMenu.includes("Only a Super Administrator can change this account") && !plainMenu.includes("Change role"),
    "an Administrator sees admin accounts as locked",
  );
  await plainPage.screenshot({ path: `${shots}/auth_locked.png` });
  await plainPage.keyboard.press("Escape");
  const demote = await callAction(plainPage, setRoleId, [superRow.id, "user"]);
  check(demote.includes("Only a Super Administrator can change roles"), "the server refuses a role change from an Administrator");
  const reset = await callAction(plainPage, resetId, [superRow.id]);
  check(reset.includes("Only a Super Administrator can change administrator accounts"), "the server refuses a password reset on an admin");
  const after = row(superAdmin.email);
  check(after.role === "superadmin" && !after.firstLogin, "the Super Administrator account is unchanged");
  const memberReset = await callAction(plainPage, resetId, [memberRow.id]);
  check(memberReset.includes('"ok":true'), "an Administrator can still reset a regular user's password");
} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error);
} finally {
  const emails = [superAdmin.email, plain.email, member.email].map(quote).join(",");
  sql(`PRAGMA foreign_keys=ON; DELETE FROM users WHERE email IN (${emails});`);
  check(sql(`SELECT COUNT(*) FROM users WHERE email IN (${emails})`) === "0", "cleanup: test accounts deleted");
  await browser.close();
}

console.log(failures === 0 ? `\nAuth e2e passed. Screenshots in ${shots}` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
