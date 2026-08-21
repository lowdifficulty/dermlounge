import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/scheduling/auth";
import { resolveMetaPageId } from "@/lib/meta/config";
import { finalizeMetaConnection } from "@/lib/meta/connect";
import {
  META_OAUTH_STATE_COOKIE,
  adminAppOrigin,
  exchangeOAuthCode,
  metaOAuthRedirectUriOptions,
  readOAuthStateCookie,
} from "@/lib/meta/oauth";
import { resolvePageTokenFromUserToken } from "@/lib/meta/token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function redirectToAdmin(request: Request, query: Record<string, string>) {
  const url = new URL("/admin/dashboard/", adminAppOrigin(request));
  url.searchParams.set("tab", "phoneSms");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const res = NextResponse.redirect(url);
  res.cookies.set(META_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

function connectFailedMessage(raw?: string | null): string {
  const text = (raw || "").trim();
  if (!text) {
    return "Connect Meta did not finish. Try again from https://mydermlounge.com/admin/ and allow all Page permissions.";
  }
  const lower = text.toLowerCase();
  if (lower.includes("redirect_uri") || lower.includes("redirect uri")) {
    const uris = metaOAuthRedirectUriOptions().join("  AND  ");
    return `Facebook rejected the OAuth redirect URI. Add both production URIs in Meta → Facebook Login → Settings → Valid OAuth Redirect URIs: ${uris}`;
  }
  if (lower.includes("access_denied") || lower.includes("user denied") || lower.includes("cancelled")) {
    return "Facebook login was cancelled. Click Connect Meta and allow Page and ads permissions.";
  }
  if (lower.includes("domain") && lower.includes("app")) {
    return "Facebook blocked the callback domain. In Meta → Settings → Basic set App Domains to mydermlounge.com and add the Website platform with Site URL https://mydermlounge.com/";
  }
  return text;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const fbError =
    url.searchParams.get("error_description") || url.searchParams.get("error_reason") || url.searchParams.get("error");

  try {
    await requireAdmin();
  } catch {
    const login = new URL("/admin/login", adminAppOrigin(request));
    return NextResponse.redirect(login);
  }

  const cookieStore = await cookies();
  const cookie = readOAuthStateCookie(cookieStore.get(META_OAUTH_STATE_COOKIE)?.value);

  if (fbError) {
    return redirectToAdmin(request, { meta: "error", meta_error: connectFailedMessage(fbError) });
  }

  if (!code || !state || !cookie || cookie.nonce !== state) {
    return redirectToAdmin(request, {
      meta: "error",
      meta_error:
        "Connect Meta expired (often www vs non-www). Open https://mydermlounge.com/admin/, log in, and click Connect Meta again.",
    });
  }

  try {
    const pageId = await resolveMetaPageId();
    if (!pageId) {
      return redirectToAdmin(request, {
        meta: "error",
        meta_error: "Facebook Page ID is not configured.",
      });
    }

    const { userToken } = await exchangeOAuthCode(code, cookie.redirectUri);
    const resolved = await resolvePageTokenFromUserToken(userToken, pageId);
    if (!resolved) {
      return redirectToAdmin(request, {
        meta: "error",
        meta_error:
          "Facebook did not grant Page access. Click Connect Meta again and allow the Page and ads permissions.",
      });
    }

    const result = await finalizeMetaConnection({
      pageId,
      pageToken: resolved.pageToken,
      userToken: resolved.userToken,
      pageName: resolved.pageName,
    });

    if (!result.health.valid) {
      return redirectToAdmin(request, {
        meta: "error",
        meta_error: result.health.error || "Page health check failed after Connect Meta.",
      });
    }

    return redirectToAdmin(request, { meta: "connected" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connect Meta failed";
    return redirectToAdmin(request, { meta: "error", meta_error: connectFailedMessage(message) });
  }
}
