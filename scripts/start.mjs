import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

for (const file of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

process.env.NODE_ENV = "production";
process.env.DATA_DIR ??= path.join(root, "data");
process.env.PORT ??= "3000";
process.env.HOSTNAME ??= "0.0.0.0";

const server = path.join(root, ".next", "standalone", "server.js");
if (!fs.existsSync(server)) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

await import(pathToFileURL(server).href);
