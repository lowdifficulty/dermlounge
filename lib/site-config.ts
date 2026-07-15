/** Canonical production site URL (source mirror). */
export const SITE_URL = "https://www.mydermlounge.com";

/** Google Tag Manager container ID. */
export const GTM_ID = "GTM-W8M568D9";

/** Trustindex loader CDN base (reviews widget). */
export const TRUSTINDEX_LOADER = "https://cdn.trustindex.io/loader.js";

/** Online booking widget iframe URL (CloudFront). */
export const BOOKING_IFRAME_URL =
  "https://d2oe0ra32qx05a.cloudfront.net/?practiceKey=k_1_105850";

/** Breakdance contact form builder element ID on /contact-us/. */
export const CONTACT_FORM_ID = 113;

/** Tracking-related constants for documentation and future injection. */
export const TRACKING = {
  gtmId: GTM_ID,
  trustindexLoader: TRUSTINDEX_LOADER,
  /** Meta Pixel is not embedded in mirrored HTML; verify via GTM if needed. */
  metaPixelInHtml: false,
} as const;
