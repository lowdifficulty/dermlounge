#!/usr/bin/env node
/**
 * Mirror mydermlounge.com HTML into mirror/html/ from wp-pages.json, wp-posts.json,
 * and sitemap discovery for any missing URLs.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIRROR_DIR = path.join(ROOT, "mirror", "html");
const MANIFEST_PATH = path.join(ROOT, "mirror", "manifest.json");

const SITE_ORIGIN = "https://www.mydermlounge.com";
const USER_AGENT =
  "DermLoungeMirror/1.0 (+https://github.com/dermlounge; static mirror)";
const RATE_LIMIT_MS = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {string} url */
function urlToRoute(url) {
  const parsed = new URL(url);
  if (parsed.origin !== SITE_ORIGIN) return null;
  let pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return pathname;
}

/** @param {string} route */
function routeToFilePath(route) {
  if (route === "/") {
    return path.join(MIRROR_DIR, "index.html");
  }
  const segments = route.replace(/^\//, "").split("/");
  return path.join(MIRROR_DIR, ...segments, "index.html");
}

/** @param {string} url */
async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

/** @param {Set<string>} urls */
async function loadWpJsonUrls() {
  const urls = new Set([`${SITE_ORIGIN}/`]);

  for (const filename of ["wp-pages.json", "wp-posts.json"]) {
    const filePath = path.join(ROOT, filename);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const items = JSON.parse(raw);
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item?.link) urls.add(item.link);
      }
      console.log(`Loaded ${items.length} entries from ${filename}`);
    } catch (err) {
      if (err.code === "ENOENT") {
        console.warn(`Warning: ${filename} not found, skipping`);
      } else {
        throw err;
      }
    }
  }

  return urls;
}

/** @param {Set<string>} urls */
async function loadSitemapUrls(urls) {
  const sitemapIndexUrl = `${SITE_ORIGIN}/sitemap_index.xml`;
  try {
    const indexXml = await fetchHtml(sitemapIndexUrl);
    await sleep(RATE_LIMIT_MS);

    const childSitemaps = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(
      (m) => m[1].trim()
    );

    for (const sitemapUrl of childSitemaps) {
      if (!sitemapUrl.endsWith(".xml")) continue;
      try {
        const xml = await fetchHtml(sitemapUrl);
        await sleep(RATE_LIMIT_MS);
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) =>
          m[1].trim()
        );
        for (const loc of locs) {
          if (loc.startsWith(SITE_ORIGIN)) urls.add(loc);
        }
        console.log(`Sitemap ${sitemapUrl}: ${locs.length} URLs`);
      } catch (err) {
        console.warn(`Failed child sitemap ${sitemapUrl}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`Sitemap discovery failed: ${err.message}`);
  }
}

/** @param {string} html @param {string} filePath */
async function writeHtml(html, filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, html, "utf8");
}

async function main() {
  console.log("DermLounge mirror — starting");
  await fs.mkdir(MIRROR_DIR, { recursive: true });

  const urls = await loadWpJsonUrls();
  const beforeSitemap = urls.size;
  await loadSitemapUrls(urls);
  console.log(
    `Total URLs: ${urls.size} (${urls.size - beforeSitemap} from sitemaps)`
  );

  /** @type {{ route: string, url: string, file: string }[]} */
  const manifest = [];
  let ok = 0;
  let failed = 0;

  const sortedUrls = [...urls].sort();
  for (const url of sortedUrls) {
    const route = urlToRoute(url);
    if (!route) continue;

    const fetchUrl = route === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${route}/`;
    const filePath = routeToFilePath(route);
    const relFile = path.relative(ROOT, filePath).split(path.sep).join("/");

    try {
      process.stdout.write(`Fetching ${fetchUrl} … `);
      const html = await fetchHtml(fetchUrl);
      await writeHtml(html, filePath);
      manifest.push({ route, url: fetchUrl, file: relFile });
      ok++;
      console.log("OK");
    } catch (err) {
      failed++;
      console.log(`FAIL (${err.message})`);
    }

    await sleep(RATE_LIMIT_MS);
  }

  manifest.sort((a, b) => a.route.localeCompare(b.route));
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fs.writeFile(
    MANIFEST_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        site: SITE_ORIGIN,
        total: manifest.length,
        routes: manifest,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\nDone: ${ok} saved, ${failed} failed`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
