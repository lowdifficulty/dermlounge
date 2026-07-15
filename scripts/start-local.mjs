/**
 * Clean local production server on http://localhost:3000
 * Usage: npm run local | npm run 67
 */

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { killPort, localProcessEnv } from "./local-server.mjs";

const PORT = "3000";
const isWin = process.platform === "win32";
const localUrl = `http://localhost:${PORT}`;

function openBrowser(url) {
  if (isWin) {
    spawn("cmd", ["/c", "start", "", url], { shell: false, stdio: "ignore" });
  } else {
    spawn("open", [url], { shell: true, stdio: "ignore" });
  }
}

async function waitForServer(port, maxAttempts = 120) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://localhost:${port}`);
      if (res.ok || res.status < 500) return true;
    } catch {
      // server still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: isWin,
      env: { ...process.env, ...env },
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  console.log(`Stopping anything on port ${PORT}...`);
  killPort(Number(PORT));

  if (existsSync(".next") && !process.argv.includes("--clean")) {
    console.log("Using existing .next build (pass --clean to wipe cache).");
  } else if (existsSync(".next")) {
    console.log("Removing stale .next cache...");
    rmSync(".next", { recursive: true, force: true });
  }

  const npm = isWin ? "npm.cmd" : "npm";
  console.log("Building... (about 1-2 minutes, then browser opens automatically)");
  await run(npm, ["run", "build"]);

  const alreadyRunning = await waitForServer(PORT, 3);
  if (alreadyRunning) {
    console.log(`${localUrl} is already running (started during build).`);
    openBrowser(localUrl);
    return;
  }

  console.log(`Starting ${localUrl} ...`);
  const child = spawn(npm, ["start"], {
    stdio: "inherit",
    shell: isWin,
    env: localProcessEnv(Number(PORT)),
  });

  void (async () => {
    const ready = await waitForServer(PORT);
    if (ready) {
      console.log(`Opening ${localUrl} in your browser...`);
      openBrowser(localUrl);
    } else {
      console.log(`Server did not respond. Open ${localUrl} manually if it is running.`);
    }
  })();

  child.on("close", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
