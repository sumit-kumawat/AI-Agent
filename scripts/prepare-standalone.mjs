import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("Standalone output is missing. Run `next build` first.");
  process.exit(1);
}

fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});

const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standalone, "public"), { recursive: true });
}

console.log("Standalone bundle is ready in .next/standalone");
