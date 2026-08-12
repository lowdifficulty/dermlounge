#!/usr/bin/env node
/**
 * Bundle per-page local stylesheets into one file to cut render-blocking round trips.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIRROR_DIR = path.join(ROOT, "mirror", "html");
const PUBLIC_DIR = path.join(ROOT, "public");
const BUNDLE_DIR = path.join(PUBLIC_DIR, "assets", "bundles");

const LOCAL_CSS_RE =
  /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'](\/assets\/wp-content\/[^"']+)["'][^>]*>/gi;

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

/** @param {string} html */
function extractLocalStylesheets(html) {
  /** @type {string[]} */
  const hrefs = [];
  for (const match of html.matchAll(LOCAL_CSS_RE)) {
    const href = match[1].split("?")[0];
    if (!hrefs.includes(href)) hrefs.push(href);
  }
  return hrefs;
}

/** @param {string[]} hrefs */
async function buildBundle(hrefs) {
  const parts = [];
  for (const href of hrefs) {
    const diskPath = path.join(PUBLIC_DIR, href.replace(/^\//, ""));
    try {
      const css = await fs.readFile(diskPath, "utf8");
      parts.push(`/* ${href} */\n${css}`);
    } catch {
      parts.push(`/* missing: ${href} */\n`);
    }
  }
  const combined = parts.join("\n").replace(
    /https?:\/\/(?:www\.)?mydermlounge\.com(\/wp-content\/[^)"']+)/gi,
    "/assets$1"
  );
  const hash = createHash("sha256").update(combined).digest("hex").slice(0, 12);
  const bundleName = `${hash}.css`;
  const bundlePath = path.join(BUNDLE_DIR, bundleName);
  const bundleHref = `/assets/bundles/${bundleName}`;

  try {
    await fs.access(bundlePath);
    const existing = await fs.readFile(bundlePath, "utf8");
    if (existing === combined) return bundleHref;
  } catch {
    // write new bundle below
  }

  await fs.mkdir(BUNDLE_DIR, { recursive: true });
  await fs.writeFile(bundlePath, combined, "utf8");

  return bundleHref;
}

/** Rewrite external wp-content URLs inside already-built bundle files. */
async function fixExistingBundles() {
  let entries;
  try {
    entries = await fs.readdir(BUNDLE_DIR);
  } catch {
    return 0;
  }

  let fixed = 0;
  for (const name of entries) {
    if (!name.endsWith(".css")) continue;
    const filePath = path.join(BUNDLE_DIR, name);
    const css = await fs.readFile(filePath, "utf8");
    const next = css.replace(
      /https?:\/\/(?:www\.)?mydermlounge\.com(\/wp-content\/[^)"']+)/gi,
      "/assets$1"
    );
    if (next !== css) {
      await fs.writeFile(filePath, next, "utf8");
      fixed++;
      console.log(`  fixed URLs in bundles/${name}`);
    }
  }
  return fixed;
}

/** @param {string} html @param {string} bundleHref @param {string[]} hrefs */
function replaceStylesheets(html, bundleHref, hrefs) {
  let out = html;
  for (const href of hrefs) {
    const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `<link\\b[^>]*rel=["']stylesheet["'][^>]*href=["']${escaped}[^"']*["'][^>]*>\\s*`,
      "gi"
    );
    out = out.replace(re, "");
  }

  const bundleTag =
    `<link rel="preload" as="style" href="${bundleHref}" fetchpriority="high" />\n` +
    `<link rel="stylesheet" href="${bundleHref}" />\n`;
  if (out.includes(bundleHref)) return out;

  const marker = "<!-- [HEADER ASSETS] -->";
  if (out.includes(marker)) {
    return out.replace(marker, `${marker}\n${bundleTag}`);
  }
  return out.replace(/<head[^>]*>/i, (m) => `${m}\n${bundleTag}`);
}

/** Inject preload hints for existing bundle stylesheets. */
function injectBundlePreloads(html) {
  return html.replace(
    /<link rel="stylesheet" href="(\/assets\/bundles\/[^"]+)" \/>/g,
    (match, href) => {
      if (html.includes(`rel="preload" as="style" href="${href}"`)) return match;
      return (
        `<link rel="preload" as="style" href="${href}" fetchpriority="high" />\n` +
        `<link rel="stylesheet" href="${href}" />`
      );
    }
  );
}

async function main() {
  const fixedBundles = await fixExistingBundles();
  if (fixedBundles) {
    console.log(`Patched ${fixedBundles} bundle file(s) with local asset URLs.`);
  }

  const files = await walkHtmlFiles(MIRROR_DIR);
  console.log(`Bundling CSS for ${files.length} pages…`);

  let preloaded = 0;
  for (const file of files) {
    let html = await fs.readFile(file, "utf8");
    const hrefs = extractLocalStylesheets(html);

    if (hrefs.length >= 2) {
      const bundleHref = await buildBundle(hrefs);
      const next = replaceStylesheets(html, bundleHref, hrefs);
      if (next !== html) {
        html = next;
        await fs.writeFile(file, html, "utf8");
        console.log(`  ${path.relative(ROOT, file)} → ${bundleHref} (${hrefs.length} files)`);
        continue;
      }
    }

    const withPreload = injectBundlePreloads(html);
    if (withPreload !== html) {
      await fs.writeFile(file, withPreload, "utf8");
      preloaded++;
    }
  }

  console.log(`CSS bundling complete.${preloaded ? ` Added ${preloaded} bundle preloads.` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
