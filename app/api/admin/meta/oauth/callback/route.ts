import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/scheduling/auth";
import { resolveMetaPageId } from "@/lib/meta/config";
import { finalizeMetaConnection } from "@/lib/meta/connect";
import {
  LOCAL_OAUTH_REDIRECT_URI,
  META_OAUTH_STATE_COOKIE,
  PRODUCTION_OAUTH_REDIRECT_URI,
  adminAppOrigin,
  exchangeOAuthCode,
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
  const text = (raw || "").toLowerCase();
  if (text.includes("redirect_uri") || text.includes("redirect uri")) {
    return `Add this exact URI in Facebook Login → Settings → Valid OAuth Redirect URIs: ${PRODUCTION_OAUTH_REDIRECT_URI}`;
  }
  if (text.includes("access_denied") || text.includes("user denied") || text.includes("cancelled")) {
    return "Facebook login was cancelled. Click Connect Meta and allow Page and ads permissions.";
  }
  return "Could not connect Meta. Add the redirect URI in Facebook Login settings, then click Connect Meta again.";
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
      meta_error: "Connect Meta expired. Click Connect Meta again.",
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
    const hint =
      /redirect/i.test(message)
        ? `Add this exact URI in Facebook Login → Settings → Valid OAuth Redirect URIs: ${PRODUCTION_OAUTH_REDIRECT_URI} (local: ${LOCAL_OAUTH_REDIRECT_URI})`
        : message;
    return redirectToAdmin(request, { meta: "error", meta_error: hint });
  }
}
