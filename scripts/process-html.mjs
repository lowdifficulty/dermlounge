#!/usr/bin/env node
/**
 * Post-process mirrored HTML for local serving: asset paths, CWV tweaks, contact form patch.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { protectEmails } from "./email-protection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIRROR_DIR = path.join(ROOT, "mirror", "html");

const SITE_HOSTS = ["www.mydermlounge.com", "mydermlounge.com"];

/** WordPress nav uses short wound-care paths that 301 to nested routes on live. */
const WOUND_CARE_LINK_REWRITES = [
  ["/infected-and-inflammatory-wound-care/", "/advanced-wound-care-services/infected-and-inflammatory-wound-care/"],
  ["/non-healing-wound-care/", "/advanced-wound-care-services/non-healing-wound-care/"],
  ["/moisture-related-skin-breakdown/", "/advanced-wound-care-services/moisture-related-skin-breakdown/"],
  ["/traumatic-wound-care/", "/advanced-wound-care-services/traumatic-wound-care/"],
  ["/surgical-and-post-procedure-wound-care/", "/advanced-wound-care-services/surgical-and-post-procedure-wound-care/"],
  ["/circulation-related-ulcer-care/", "/advanced-wound-care-services/circulation-related-ulcer-care/"],
  ["/pressure-related-wounds/", "/advanced-wound-care-services/pressure-related-wounds/"],
];

/** ShortPixel CDN wrapper → direct wp-content path */
const SHORTPIXEL_RE =
  /https?:\/\/spcdn\.shortpixel\.ai\/spio\/[^/]+\/(?:www\.)?mydermlounge\.com(\/wp-content\/[^"'\\s)]+)/gi;

/** Absolute mydermlounge wp-content URLs → /assets/wp-content/… */
const WP_CONTENT_RE = new RegExp(
  `https?:\\/\\/(?:${SITE_HOSTS.join("|")})(\\/wp-content\\/[^\\s"'>)]+)`,
  "gi"
);

const CONTACT_FORM_PATCH = `<script id="dermlounge-contact-patch">
(function () {
  var API = "/api/contact";
  function field(form, name) {
    var el = form.querySelector('[name="fields[' + name + ']"]');
    return el ? String(el.value || "").trim() : "";
  }
  function showMessage(form, text, ok) {
    var existing = form.querySelector(".dermlounge-form-message");
    if (existing) existing.remove();
    var msg = document.createElement("div");
    msg.className = "dermlounge-form-message breakdance-form-message " + (ok ? "breakdance-form-message--success" : "breakdance-form-message--error");
    msg.textContent = text;
    msg.style.marginTop = "1rem";
    form.appendChild(msg);
  }
  document.addEventListener("submit", function (e) {
    var form = e.target && e.target.closest ? e.target.closest(".breakdance-form") : null;
    if (!form || !form.id || form.id.indexOf("113") === -1) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    var body = {
      fname: field(form, "fname"),
      email: field(form, "email"),
      pnumber: field(form, "pnumber"),
      services: field(form, "services"),
      message: field(form, "message"),
      hpname: field(form, "hpname")
    };
    var btn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (btn) btn.disabled = true;
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (btn) btn.disabled = false;
        if (res.data && res.data.success) {
          showMessage(form, res.data.message || "Your message has been received!", true);
          form.reset();
        } else {
          showMessage(form, (res.data && res.data.message) || "Something went wrong. Please try again.", false);
        }
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        showMessage(form, "Network error. Please try again.", false);
      });
  }, true);
})();
</script>`;

/** @param {string} html */
function rewriteWoundCareLinks(html) {
  let out = html;
  for (const [from, to] of WOUND_CARE_LINK_REWRITES) {
    const fromPath = from.replace(/^\//, "").replace(/\/$/, "");
    const hostPattern = `(?:${SITE_HOSTS.join("|")})`;
    const absRe = new RegExp(
      `https?:\\/\\/${hostPattern}${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}?`,
      "gi"
    );
    out = out.replace(absRe, to);
    const absNoSlashRe = new RegExp(
      `https?:\\/\\/${hostPattern}\\/${fromPath}(?!/)`,
      "gi"
    );
    out = out.replace(absNoSlashRe, to.replace(/\/$/, ""));
  }
  return out;
}

/** @param {string} html */
function stripShortpixel(html) {
  return html.replace(SHORTPIXEL_RE, "/assets$1");
}

/** @param {string} html */
function rewriteWpContent(html) {
  return html.replace(WP_CONTENT_RE, "/assets$1");
}

/** @param {string} html */
function removeBreezePrefetch(html) {
  return html
    .replace(/<script[^>]*id="breeze-prefetch-js-extra"[^>]*>[\s\S]*?<\/script>\s*/gi, "")
    .replace(/<script[^>]*id="breeze-prefetch-js"[^>]*>[\s\S]*?<\/script>\s*/gi, "")
    .replace(/<script[^>]*breeze-prefetch[^>]*>[\s\S]*?<\/script>\s*/gi, "");
}

/** @param {string} html */
function deferTrustindex(html) {
  return html.replace(
    /<script([^>]*(?:trustindex|cdn\.trustindex\.io)[^>]*)><\/script>/gi,
    (match, attrs) => {
      let next = attrs;
      if (!/\bdefer\b/i.test(next)) next += " defer";
      if (!/\basync\b/i.test(next)) next += " async";
      return `<script${next}></script>`;
    }
  );
}

/** @param {string} html */
function removeHeroVideoPreload(html) {
  return html.replace(
    /<link[^>]*rel=["']preload["'][^>]*as=["']video["'][^>]*>\s*/gi,
    ""
  );
}

/** @param {string} html */
function optimizeHeroVideo(html) {
  if (!html.includes("section-background-video")) return html;

  const style =
    '<style id="dermlounge-hero-cwv">' +
    ".bde-section-45-100{min-height:70vh;contain:layout}" +
    ".section-background-video video{width:100%;height:100%;object-fit:cover}" +
    "</style>\n";
  let out = html;
  if (!html.includes("dermlounge-hero-cwv")) {
    out = out.replace(/<head[^>]*>/i, (m) => m + "\n" + style);
  }

  out = out.replace(
    /<video(\s[^>]*)>\s*<source\s+src=["'](\/assets\/wp-content\/[^"']+\.mp4)["']/gi,
    (match, attrs, src) => {
      if (/poster=/i.test(attrs)) return match;
      const poster =
        "/assets/wp-content/uploads/2025/01/istockphoto-1820029096-1024x1024-1-768x432.jpg";
      const preloadTag = `<link rel="preload" as="image" href="${poster}" fetchpriority="high" />\n`;
      if (!out.includes(`href="${poster}"`)) {
        out = out.replace(/<head[^>]*>/i, (m) => m + "\n" + preloadTag);
      }
      const cleanAttrs = attrs.replace(/\bpreload=["'][^"']*["']/gi, "").trim();
      return `<video ${cleanAttrs} poster="${poster}" preload="none" playsinline><source src="${src}"`;
    }
  );

  return out;
}

/** @param {string} html */
function demoteLogoPreloadOnVideoPages(html) {
  if (!html.includes("section-background-video")) return html;
  return html
    .replace(/<link[^>]*rel=["']preload["'][^>]*DL-Logo[^>]*>\s*/gi, "")
    .replace(
      /(<img\b[^>]*DL-Logo[^>]*)\s*fetchpriority=["']high["']/gi,
      "$1"
    );
}

/** @param {string} html */
function preloadGoogleFonts(html) {
  const fontMatch = html.match(
    /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'](https:\/\/fonts\.googleapis\.com\/[^"']+)["'][^>]*>/i
  );
  if (!fontMatch) return html;
  const href = fontMatch[1];
  if (html.includes(`rel="preload" as="style" href="${href}"`)) return html;
  const preload = `<link rel="preload" as="style" href="${href}" fetchpriority="high" />\n`;
  return html.replace(/<head[^>]*>/i, (m) => m + "\n" + preload);
}

/** @param {string} html */
function removeShortpixelDnsPrefetch(html) {
  return html.replace(
    /<link[^>]*dns-prefetch[^>]*spcdn\.shortpixel\.ai[^>]*>\s*/gi,
    ""
  );
}

/** @param {string} html */
function addFontPreconnect(html) {
  if (html.includes('rel="preconnect" href="https://fonts.gstatic.com"')) return html;
  const snippet =
    '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n';
  return html.replace(/<head[^>]*>/i, (m) => m + "\n" + snippet);
}

/** @param {string} html */
function preloadLcpImage(html) {
  // Hero video pages use poster preload from optimizeHeroVideo; logo must not compete.
  if (html.includes("section-background-video")) return html;

  const imgMatch = html.match(
    /<img\b[^>]*fetchpriority\s*=\s*["']high["'][^>]*>/i
  );
  if (!imgMatch) return html;

  const srcMatch = imgMatch[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (!srcMatch) return html;

  const href = srcMatch[1];
  if (html.includes(`rel="preload" as="image" href="${href}"`)) return html;

  const preload = `<link rel="preload" as="image" href="${href}" fetchpriority="high" />\n`;
  return html.replace(/<head[^>]*>/i, (m) => m + "\n" + preload);
}

/** @param {string} html */
function addHeroFetchPriority(html) {
  if (html.includes("section-background-video")) return html;
  const headerEnd = html.search(/<\/header>/i);
  const searchFrom = headerEnd >= 0 ? headerEnd : 0;
  const slice = html.slice(searchFrom);
  const imgMatch = slice.match(/<img\b[^>]*>/i);
  if (!imgMatch) return html;

  const absoluteIndex = searchFrom + slice.indexOf(imgMatch[0]);
  const original = imgMatch[0];
  if (/\bfetchpriority\s*=/i.test(original)) return html;

  let updated = original;
  if (/\bloading\s*=\s*["']lazy["']/i.test(updated)) {
    updated = updated.replace(/\bloading\s*=\s*["']lazy["']/i, 'loading="eager"');
  }
  updated = updated.replace(/<img\b/i, '<img fetchpriority="high"');

  return html.slice(0, absoluteIndex) + updated + html.slice(absoluteIndex + original.length);
}

/** @param {string} html */
function removeCloudflareArtifacts(html) {
  return html
    .replace(/<script[^>]*\/cdn-cgi\/[^>]*>[\s\S]*?<\/script>\s*/gi, "")
    .replace(/<script[^>]*src=["'][^"']*\/cdn-cgi\/[^"']*["'][^>]*>\s*<\/script>\s*/gi, "")
    .replace(/<script[^>]*cloudflareinsights\.com[^>]*>[\s\S]*?<\/script>\s*/gi, "")
    .replace(/href=["']\/cdn-cgi\/l\/email-protection[^"']*["']/gi, 'href="#"');
}

/** @param {string} html */
function addClsGuards(html) {
  const style =
    '<style id="dermlounge-cls">' +
    ".bde-section-45-100{min-height:70vh;contain:layout}" +
    ".bde-section-45-100 .section-container{min-height:28rem;contain:layout}" +
    ".bde-section-42-100 .section-container{min-height:18rem}" +
    "img.bde-image2{height:auto;max-width:100%}" +
    "body{font-family:'Nunito Sans',system-ui,sans-serif}" +
    "h1,h2,h3{font-family:Rufina,Georgia,serif}" +
    "</style>\n";
  if (html.includes("dermlounge-cls")) {
    return html.replace(/<style id="dermlounge-cls">[\s\S]*?<\/style>\s*/i, style);
  }
  return html.replace(/<head[^>]*>/i, (m) => m + "\n" + style);
}

/** @param {string} html */
function injectContactPatch(html) {
  if (!html.includes("contact-form113") && !html.includes("bde-form-builder-330-113")) {
    return html;
  }
  if (html.includes("dermlounge-contact-patch")) return html;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${CONTACT_FORM_PATCH}\n</body>`);
  }
  return html + CONTACT_FORM_PATCH;
}

/** @param {string} html */
/** @param {string} html @param {{ humanVisibleEmail?: boolean }} [options] */
function processHtml(html, options = {}) {
  let out = html;
  out = rewriteWoundCareLinks(out);
  out = stripShortpixel(out);
  out = rewriteWpContent(out);
  out = removeBreezePrefetch(out);
  out = removeShortpixelDnsPrefetch(out);
  out = removeHeroVideoPreload(out);
  out = addFontPreconnect(out);
  out = preloadGoogleFonts(out);
  out = optimizeHeroVideo(out);
  out = deferTrustindex(out);
  out = addHeroFetchPriority(out);
  out = preloadLcpImage(out);
  out = demoteLogoPreloadOnVideoPages(out);
  out = removeCloudflareArtifacts(out);
  out = protectEmails(out, { humanVisible: options.humanVisibleEmail === true });
  out = addClsGuards(out);
  out = injectContactPatch(out);
  return out;
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

async function main() {
  try {
    await fs.access(MIRROR_DIR);
  } catch {
    console.error("mirror/html not found. Run: npm run mirror");
    process.exit(1);
  }

  const files = await walkHtmlFiles(MIRROR_DIR);
  console.log(`Processing ${files.length} HTML files…`);

  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const isHomePage = path.basename(file) === "index.html" && path.dirname(file) === MIRROR_DIR;
    const processed = processHtml(raw, { humanVisibleEmail: isHomePage });
    if (processed !== raw) {
      await fs.writeFile(file, processed, "utf8");
    }
    console.log(`  ${path.relative(ROOT, file)}`);
  }

  console.log("HTML processing complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
