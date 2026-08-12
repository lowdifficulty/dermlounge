import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mdsRoot = path.resolve(root, "../Mobile Dog Salon");
const pullPath = path.join(mdsRoot, ".env.production.pull");

execSync("vercel env pull .env.production.pull --environment=production --yes", {
  stdio: "inherit",
  cwd: mdsRoot,
});

const raw = readFileSync(pullPath, "utf8");
const match = raw.match(/^RESEND_API_KEY=(.*)$/m);
if (!match) {
  console.error("RESEND_API_KEY not found in pulled MDS env");
  process.exit(1);
}

const key = match[1].trim().replace(/^["']|["']$/g, "");
if (!key) {
  console.error("RESEND_API_KEY is empty");
  process.exit(1);
}

function addEnv(name, value) {
  try {
    execSync(`vercel env rm ${name} production --yes`, {
      stdio: "ignore",
      cwd: root,
      shell: true,
    });
  } catch {
    /* not set yet */
  }
  execSync(
    `vercel env add ${name} production --value "${value.replace(/"/g, '\\"')}" --yes`,
    { stdio: "inherit", cwd: root, shell: true }
  );
}

addEnv("RESEND_API_KEY", key);
addEnv("CONTACT_TO", "info@mydermlounge.com");
addEnv("CONTACT_FROM", "DermLounge <info@mydermlounge.com>");
console.log("Vercel email env updated (RESEND_API_KEY len:", key.length, ")");
