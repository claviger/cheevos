// Sets (or rotates) the parent/admin password and ensures a persistent session
// secret. Writes both into config/config.json, creating it from the example file
// on first run.
//
// Usage:
//   npm run set-password -- "myStrongPassword"     (password as an argument)
//   ADMIN_PASSWORD="myStrongPassword" npm run set-password
//   npm run set-password                           (interactive prompt)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../src/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const configPath = path.join(root, "config", "config.json");
const examplePath = path.join(root, "config", "config.example.json");

function loadConfig() {
  for (const p of [configPath, examplePath]) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      /* try next */
    }
  }
  return { port: 3000, host: "127.0.0.1", basePath: "/cheevos" };
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Mute echo so the password isn't shown as it's typed.
    const onData = () => rl.output.write("\x1B[2K\r" + question);
    process.stdin.on("data", onData);
    rl.question(question, (answer) => {
      process.stdin.off("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const argPassword = process.argv[2] || process.env.ADMIN_PASSWORD;
  const password = argPassword || (await promptHidden("New parent/admin password: "));

  if (!password || password.trim().length < 4) {
    console.error("Password must be at least 4 characters.");
    process.exit(1);
  }

  const config = loadConfig();
  config.adminPasswordHash = hashPassword(password.trim());

  if (!config.sessionSecret || String(config.sessionSecret).includes("CHANGE_ME")) {
    config.sessionSecret = crypto.randomBytes(32).toString("hex");
    console.log("Generated a new session secret.");
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`Saved admin password hash to ${path.relative(root, configPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
