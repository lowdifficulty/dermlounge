/**
 * Keep the project local URL running after builds and dev work.
 *
 * Usage:
 *   node scripts/ensure-local.mjs          # health check; restart if down
 *   node scripts/ensure-local.mjs --restart # kill configured port and start fresh
 *   npm run ensure-local
 *
 * Hooked from package.json postbuild (skips CI) so localhost serves the latest build.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { getLocalPort, killPort, startNextServerDetached } from "./local-server.mjs";

const PORT = getLocalPort();
const BASE = `http://localhost:${PORT}`;
const CHECK_ROUTES = ["/", "/about"];

const args = process.argv.slice(2);
const forceRestart = args.includes("--restart");
const skipIfCi = args.includes("--skip-if-ci");

function isCi() {
  return (
    process.env.CI === "true" ||
    process.env.CI === "1" ||
    process.env.GITHUB_ACTIONS === "true"
  );
}

async function ping(route) {
  try {
    const res = await fetch(`${BASE}${route}`, { redirect: "follow" });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function isHealthy() {
  if (!existsSync(join(process.cwd(), ".next"))) return false;
  for (const route of CHECK_ROUTES) {
    if (!(await ping(route))) return false;
  }
  return true;
}

async function waitForHealthy(maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await isHealthy()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  if (skipIfCi && isCi()) {
    process.exit(0);
  }

  if (!forceRestart && (await isHealthy())) {
    console.log(`Localhost OK — ${BASE}`);
    process.exit(0);
  }

  if (!existsSync(join(process.cwd(), ".next"))) {
    console.error("No .next build found. Run: npm run build");
    process.exit(1);
  }

  console.log(`Ensuring localhost on port ${PORT}...`);
  killPort(PORT);
  await new Promise((r) => setTimeout(r, 800));

  const pid = startNextServerDetached(PORT);
  console.log(`Started Next.js (pid ${pid ?? "unknown"}). Log: .local-server.log`);

  const ready = await waitForHealthy();
  if (!ready) {
    console.error(`Localhost did not become ready at ${BASE}`);
    console.error("Check .local-server.log or run: npm run 67");
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 2000));
  if (!(await isHealthy())) {
    console.error("Server started but stopped immediately. Check .local-server.log");
    process.exit(1);
  }

  console.log(`Localhost ready — ${BASE}`);
  for (const route of CHECK_ROUTES) {
    console.log(`  OK ${route}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
