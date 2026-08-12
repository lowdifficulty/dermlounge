/** @param {string} email @param {number} [key] */
export function encodeEmail(email, key = 0xa7) {
  let hex = key.toString(16).padStart(2, "0");
  for (let i = 0; i < email.length; i++) {
    hex += (email.charCodeAt(i) ^ key).toString(16).padStart(2, "0");
  }
  return hex;
}

export const CONTACT_EMAIL = "info@mydermlounge.com";
export const CONTACT_EMAIL_ENCODED = encodeEmail(CONTACT_EMAIL);

export const EMAIL_PROTECTION_SCRIPT = `<script id="dermlounge-email-protection">
(function () {
  function decode(hex) {
    var key = parseInt(hex.slice(0, 2), 16);
    var out = "";
    for (var i = 2; i < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    }
    return out;
  }
  function protect(el) {
    var hex = el.getAttribute("data-cfemail");
    if (!hex) return;
    var email = decode(hex);
    if (el.tagName === "A") {
      el.href = "mailto:" + email;
    }
    if (el.classList.contains("__cf_email__") && !el.classList.contains("dermlounge-email-human")) {
      el.textContent = email;
    }
  }
  document.querySelectorAll("[data-cfemail]").forEach(protect);
})();
</script>`;

const EMAIL_RE = /info@mydermlounge\.com/gi;
const MAILTO_RE = /href=(["'])mailto:info@mydermlounge\.com\1/gi;
const PROTECTED_SPAN = `<span class="__cf_email__" data-cfemail="${CONTACT_EMAIL_ENCODED}">[email&#160;protected]</span>`;
/** Renders as info@mydermlounge.com in browsers; not a literal string for scrapers. */
const HUMAN_VISIBLE_EMAIL_SPAN = `<span class="__cf_email__ dermlounge-email-human" data-cfemail="${CONTACT_EMAIL_ENCODED}">info&#64;mydermlounge&#46;com</span>`;

/** @param {string} html @param {{ humanVisible?: boolean }} [options] */
export function protectEmails(html, options = {}) {
  const { humanVisible = false } = options;
  const protectedSpan = humanVisible ? HUMAN_VISIBLE_EMAIL_SPAN : PROTECTED_SPAN;
  let out = html;

  out = out.replace(
    /(<meta[^>]+content=(["'])[^"']*?)info@mydermlounge\.com([^"']*\2)/gi,
    "$1info&#64;mydermlounge&#46;com$3"
  );

  out = out.replace(MAILTO_RE, `href="#" data-cfemail="${CONTACT_EMAIL_ENCODED}"`);

  out = out.replace(/data-cfemail=(["'])[^"']*\1/gi, `data-cfemail="${CONTACT_EMAIL_ENCODED}"`);

  out = out.replace(EMAIL_RE, protectedSpan);

  if (humanVisible) {
    out = out.replace(
      /<span class="__cf_email__"(?![^>]*dermlounge-email-human)([^>]*)>\[email&#160;protected\]<\/span>/gi,
      HUMAN_VISIBLE_EMAIL_SPAN
    );
  }

  if (/<script id="dermlounge-email-protection">[\s\S]*?<\/script>/i.test(out)) {
    out = out.replace(
      /<script id="dermlounge-email-protection">[\s\S]*?<\/script>\s*/i,
      `${EMAIL_PROTECTION_SCRIPT}\n`
    );
  } else if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${EMAIL_PROTECTION_SCRIPT}\n</body>`);
  } else {
    out += EMAIL_PROTECTION_SCRIPT;
  }

  return out;
}
