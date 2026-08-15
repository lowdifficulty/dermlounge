import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import { resolveMetaAppId } from "@/lib/meta/config";
import {
  META_OAUTH_STATE_COOKIE,
  buildFacebookAuthUrl,
  createOAuthState,
  metaOAuthRedirectUri,
  oauthCookieOptions,
} from "@/lib/meta/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = await resolveMetaAppId();
  if (!appId) {
    return NextResponse.json({ error: "META_APP_ID is not configured" }, { status: 500 });
  }

  const redirectUri = metaOAuthRedirectUri(request);
  const { nonce, cookieValue } = createOAuthState(redirectUri);
  const facebookUrl = buildFacebookAuthUrl({ appId, redirectUri, state: nonce });

  const res = NextResponse.redirect(facebookUrl);
  res.cookies.set(META_OAUTH_STATE_COOKIE, cookieValue, oauthCookieOptions(request));
  return res;
}
