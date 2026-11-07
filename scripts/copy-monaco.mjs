// Copies Monaco's prebuilt AMD bundle into public/monaco so the IDE editor is
// served from this app (no CDN, and the CSP can stay 'self').
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const target = path.join(root, "public", "monaco", "vs");
const stamp = path.join(root, "public", "monaco", "version.txt");
const version = JSON.parse(fs.readFileSync(path.join(root, "node_modules", "monaco-editor", "package.json"), "utf8")).version;

if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === version) process.exit(0);
fs.rmSync(path.dirname(target), { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
fs.writeFileSync(stamp, version);
console.log(`Copied Monaco ${version} to public/monaco`);
