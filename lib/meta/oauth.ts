import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { companyLegal } from "@/lib/company-legal";
import {
  META_GRAPH_VERSION,
  META_OAUTH_CALLBACK_PATH,
  META_OAUTH_START_PATH,
  resolveMetaAppId,
  resolveMetaAppSecret,
} from "./config";
import { graphGetPublic } from "./graph";

export const META_OAUTH_STATE_COOKIE = "dl_meta_oauth_state";

export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_messaging",
  "leads_retrieval",
  "ads_read",
  "business_management",
] as const;

export const PRODUCTION_OAUTH_REDIRECT_URI = `${companyLegal.siteUrl}${META_OAUTH_CALLBACK_PATH}`;
export const LOCAL_OAUTH_REDIRECT_URI = `http://localhost:3001${META_OAUTH_CALLBACK_PATH}`;

type SignedOAuthState = {
  nonce: string;
  redirectUri: string;
  exp: number;
};

function oauthSigningSecret(): string {
  return (
    process.env.STAFF_SESSION_SECRET?.trim() ||
    "dermlounge-staff-dev-secret-change-in-production"
  );
}

function signPayload(payload: string): string {
  return createHmac("sha256", oauthSigningSecret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isLocalMetaHost(host: string): boolean {
  const hostname = host.split(":")[0] || host;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Apex and www both serve production; OAuth cookies must stay on the same host. */
export function isProductionMetaHost(host: string): boolean {
  const hostname = (host.split(":")[0] || host).toLowerCase();
  return hostname === "mydermlounge.com" || hostname === "www.mydermlounge.com";
}

export const WWW_OAUTH_REDIRECT_URI = `https://www.mydermlounge.com${META_OAUTH_CALLBACK_PATH}`;

export function metaOAuthRedirectUri(request?: Request): string {
  if (request) {
    const url = new URL(request.url);
    const host = url.host;
    if (isLocalMetaHost(host)) {
      return `http://${host}${META_OAUTH_CALLBACK_PATH}`;
    }
    if (isProductionMetaHost(host)) {
      return `${url.origin}${META_OAUTH_CALLBACK_PATH}`;
    }
  }
  const env = process.env.META_OAUTH_REDIRECT_URI?.trim();
  if (env) return env.replace(/\/$/, "");
  return PRODUCTION_OAUTH_REDIRECT_URI;
}

export function metaOAuthRedirectUriOptions(): string[] {
  const env = process.env.META_OAUTH_REDIRECT_URI?.trim()?.replace(/\/$/, "");
  const uris = [
    env || PRODUCTION_OAUTH_REDIRECT_URI,
    PRODUCTION_OAUTH_REDIRECT_URI,
    WWW_OAUTH_REDIRECT_URI,
    LOCAL_OAUTH_REDIRECT_URI,
  ];
  return Array.from(new Set(uris.filter(Boolean)));
}

export function metaOAuthStartPath(): string {
  return META_OAUTH_START_PATH;
}

export function createOAuthState(redirectUri: string): { nonce: string; cookieValue: string } {
  const nonce = randomBytes(16).toString("hex");
  const state: SignedOAuthState = {
    nonce,
    redirectUri,
    exp: Date.now() + 10 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return { nonce, cookieValue: `${payload}.${signPayload(payload)}` };
}

export function readOAuthStateCookie(cookieValue?: string | null): SignedOAuthState | null {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!safeEqual(signPayload(payload), sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedOAuthState;
    if (!parsed.nonce || !parsed.redirectUri || !parsed.exp) return null;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildFacebookAuthUrl(opts: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", opts.appId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("response_type", "code");
  const configId = process.env.META_FB_LOGIN_CONFIG_ID?.trim();
  if (configId) {
    url.searchParams.set("config_id", configId);
    url.searchParams.set("override_default_response_type", "true");
  } else {
    url.searchParams.set("scope", META_OAUTH_SCOPES.join(","));
    url.searchParams.set("auth_type", "rerequest");
  }
  return url.toString();
}

export async function exchangeOAuthCode(
  code: string,
  redirectUri: string
): Promise<{ userToken: string; expiresIn?: number }> {
  const appId = await resolveMetaAppId();
  const appSecret = await resolveMetaAppSecret();
  if (!appId || !appSecret) {
    throw new Error("Meta App ID and app secret must be set on the server");
  }
  const shortLived = await graphGetPublic<{ access_token?: string; expires_in?: number }>(
    "oauth/access_token",
    {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    }
  );
  if (!shortLived.access_token) {
    throw new Error("Facebook did not return an access token");
  }
  try {
    const longLived = await graphGetPublic<{ access_token?: string; expires_in?: number }>(
      "oauth/access_token",
      {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLived.access_token,
      }
    );
    if (longLived.access_token) {
      return { userToken: longLived.access_token, expiresIn: longLived.expires_in };
    }
  } catch {
    // Keep the short-lived user token and still try to resolve a Page token.
  }
  return { userToken: shortLived.access_token, expiresIn: shortLived.expires_in };
}

export function adminAppOrigin(request: Request): string {
  const url = new URL(request.url);
  if (isLocalMetaHost(url.host) || isProductionMetaHost(url.host)) {
    return url.origin;
  }
  return companyLegal.siteUrl;
}

export function oauthCookieOptions(request: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 600,
  };
}
