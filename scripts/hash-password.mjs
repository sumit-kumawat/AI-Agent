// Prints an ADMIN_PASSWORD_HASH line for .env.local. The password is read
// without echoing it and is never written anywhere.
//
//   npm run hash-password
//   printf '%s' "$PASSWORD" | npm run hash-password --silent
import readline from "node:readline";
import bcrypt from "bcryptjs";

async function readPassword() {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    return input.replace(/\r?\n$/, "");
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const ask = (prompt) =>
    new Promise((resolve) => {
      process.stdout.write(prompt);
      rl._writeToOutput = () => {};
      rl.question("", (answer) => {
        rl._writeToOutput = (text) => process.stdout.write(text);
        process.stdout.write("\n");
        resolve(answer);
      });
    });
  const first = await ask("Password: ");
  const second = await ask("Again:    ");
  rl.close();
  if (first !== second) {
    console.error("Passwords do not match.");
    process.exit(1);
  }
  return first;
}

const password = await readPassword();
const bytes = new TextEncoder().encode(password).length;
if (bytes < 8 || bytes > 72) {
  console.error("Use 8 to 72 bytes.");
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
// Escaped so `next dev` does not expand the $ segments; the app strips the backslashes.
console.log(`ADMIN_PASSWORD_HASH=${hash.replaceAll("$", "\\$")}`);
