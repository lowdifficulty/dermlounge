#!/usr/bin/env node
/**
 * Download wp-content assets referenced in processed mirror HTML to public/assets/.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIRROR_DIR = path.join(ROOT, "mirror", "html");
const PUBLIC_ASSETS = path.join(ROOT, "public", "assets");

const SITE_ORIGIN = "https://www.mydermlounge.com";
const USER_AGENT = "DermLoungeAssets/1.0";
const RATE_LIMIT_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {string} html */
function extractAssetPaths(html) {
  /** @type {Set<string>} */
  const paths = new Set();

  const patterns = [
    /\/assets\/wp-content\/[^\s"'>)]+/gi,
    /https?:\/\/(?:www\.)?mydermlounge\.com\/wp-content\/[^\s"'>)]+/gi,
    /<source\s+src=["'](\/assets\/wp-content\/[^"']+)["']/gi,
  ];

  for (const re of patterns) {
    for (const match of html.matchAll(re)) {
      let value = match[1] ?? match[0];
      value = value.replace(/^https?:\/\/(?:www\.)?mydermlounge\.com/i, "");
      if (value.startsWith("/assets/wp-content/")) {
        value = value.replace(/^\/assets/, "");
      }
      if (value.startsWith("/wp-content/")) {
        paths.add(value.split("?")[0].split("#")[0]);
      }
    }
  }

  return paths;
}

/** @param {string} dir */
async function walkHtmlFiles(dir) {
  /** @type {string[]} */
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkHtmlFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(full);
    }
  }
  return files;
}

/** @param {string} wpPath e.g. /wp-content/uploads/foo.jpg */
async function downloadAsset(wpPath) {
  const dest = path.join(PUBLIC_ASSETS, wpPath.replace(/^\//, ""));
  try {
    await fs.access(dest);
    return { wpPath, status: "skipped" };
  } catch {
    // continue
  }

  const url = `${SITE_ORIGIN}${wpPath}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    return { wpPath, status: "failed", error: `HTTP ${res.status}` };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);

  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 12);
  return { wpPath, status: "saved", bytes: buf.length, hash };
}

async function main() {
  try {
    await fs.access(MIRROR_DIR);
  } catch {
    console.error("mirror/html not found. Run: npm run mirror && npm run postmirror");
    process.exit(1);
  }

  const htmlFiles = await walkHtmlFiles(MIRROR_DIR);
  /** @type {Set<string>} */
  const allPaths = new Set();

  for (const file of htmlFiles) {
    const html = await fs.readFile(file, "utf8");
    for (const p of extractAssetPaths(html)) allPaths.add(p);
  }

  console.log(`Found ${allPaths.size} unique wp-content assets`);
  await fs.mkdir(PUBLIC_ASSETS, { recursive: true });

  let saved = 0;
  let skipped = 0;
  let failed = 0;

  for (const wpPath of [...allPaths].sort()) {
    const result = await downloadAsset(wpPath);
    if (result.status === "saved") {
      saved++;
      console.log(`  + ${wpPath} (${result.bytes} bytes)`);
    } else if (result.status === "skipped") {
      skipped++;
    } else {
      failed++;
      console.warn(`  ! ${wpPath}: ${result.error}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`\nDone: ${saved} downloaded, ${skipped} cached, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
