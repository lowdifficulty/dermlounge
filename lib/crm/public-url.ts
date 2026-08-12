import { companyLegal } from "@/lib/company-legal";

/** Absolute site origin for Twilio webhooks (production or tunnel). */
export async function crmPublicBaseUrl(request?: Request): Promise<string> {
  try {
    const { resolveTwilioWebhookBase } = await import(
      "@/lib/notifications/twilio-runtime-config"
    );
    const fromConfig = await resolveTwilioWebhookBase();
    if (fromConfig) return fromConfig;
  } catch {
    /* fall through */
  }

  const env =
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim() ||
    process.env.QSTASH_CALLBACK_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");

  if (request) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (host && !host.includes("localhost")) {
      return `${proto}://${host}`;
    }
  }

  return companyLegal.siteUrl.replace(/\/$/, "");
}
