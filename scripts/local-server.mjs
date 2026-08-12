/**
 * Start Next.js production server in a detached process that survives on Windows.
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const isWin = process.platform === "win32";

const DEFAULT_LOCAL_PORT = 3001;

export function getLocalPort() {
  const raw = process.env.LOCAL_PORT;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number.parseInt(String(raw), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_LOCAL_PORT;
}

export function localProcessEnv(port) {
  const resolved = port ?? getLocalPort();
  const env = { ...process.env, PORT: String(resolved), LOCAL_PORT: String(resolved) };
  for (const key of Object.keys(env)) {
    if (key === "VERCEL" || key.startsWith("VERCEL_")) {
      delete env[key];
    }
  }
  return env;
}

export function getNextBin() {
  return join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
}

export function killPort(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: "utf8",
        shell: true,
      });
      const pids = new Set();
      for (const line of out.split("\n")) {
        if (!line.includes("LISTENING")) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number.parseInt(parts[parts.length - 1], 10);
        if (pid > 0) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore", shell: true });
        } catch {
          // already exited
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
        shell: true,
        stdio: "ignore",
      });
    }
  } catch {
    // port was free
  }
}

export function startNextServerDetached(port) {
  const resolved = port ?? getLocalPort();
  const nextBin = getNextBin();
  if (!existsSync(nextBin)) {
    throw new Error("Next.js not found. Run: npm install");
  }

  const logPath = join(process.cwd(), ".local-server.log");
  const pidPath = join(process.cwd(), ".local-server.pid");
  const portPath = join(process.cwd(), ".local-server.port");
  const logFd = openSync(logPath, "a");

  const stamp = new Date().toISOString();
  writeFileSync(logPath, `\n--- ${stamp} starting next on port ${resolved} ---\n`, { flag: "a" });

  const child = spawn(process.execPath, [nextBin, "start", "-p", String(resolved)], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: localProcessEnv(resolved),
    cwd: process.cwd(),
    windowsHide: true,
  });

  child.unref();
  if (child.pid) {
    writeFileSync(pidPath, String(child.pid), "utf8");
  }

  return child.pid;
}
