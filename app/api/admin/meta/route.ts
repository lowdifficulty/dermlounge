import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import {
  DEFAULT_META_PAGE_ID,
  maskSecret,
  metaDmWebhookUrl,
  metaWebhookUrl,
  readMetaRuntimeConfig,
  resolveMetaAdAccountId,
  resolveMetaPageAccessToken,
  resolveMetaAppId,
  resolveMetaPageId,
  resolveMetaVerifyToken,
  writeMetaRuntimeConfig,
  type MetaRuntimeConfig,
} from "@/lib/meta/config";
import { disconnectMetaConnection, finalizeMetaConnection, probeAdsRead } from "@/lib/meta/connect";
import { syncExistingMetaLeads } from "@/lib/meta/leads";
import { readLeadgenSubscription, subscribePageToLeadgen, readMessagingSubscription, subscribePageToMessaging } from "@/lib/meta/subscribe";
import { inspectMetaAccessToken, resolvePermanentPageToken } from "@/lib/meta/token";
import { clearMetaInsightsCache } from "@/lib/meta/insights";
import { testMetaConnection } from "@/lib/meta/client";
import { backfillMetaConversations } from "@/lib/meta/backfill";
import {
  LOCAL_OAUTH_REDIRECT_URI,
  PRODUCTION_OAUTH_REDIRECT_URI,
  WWW_OAUTH_REDIRECT_URI,
  metaOAuthRedirectUri,
  metaOAuthRedirectUriOptions,
  metaOAuthStartPath,
} from "@/lib/meta/oauth";

async function metaStatusPayload(request?: Request) {
  const config = await readMetaRuntimeConfig();
  const pageId = (await resolveMetaPageId()) || DEFAULT_META_PAGE_ID;
  const token = await resolveMetaPageAccessToken();
  const verifyToken = await resolveMetaVerifyToken();
  const tokenStatus = await inspectMetaAccessToken(token);
  const connected = tokenStatus.valid && tokenStatus.kind === "page";
  const subscription = connected
    ? await readLeadgenSubscription()
    : { subscribed: false, fields: [] as string[], error: tokenStatus.error };
  const messagingSubscription = connected
    ? await readMessagingSubscription()
    : { subscribed: false, fields: [] as string[], error: tokenStatus.error };
  const adsInsights = connected ? await probeAdsRead() : { ok: false };

  return {
    connected,
    instant: true,
    webhookUrl: metaWebhookUrl(),
    dmWebhookUrl: metaDmWebhookUrl(),
    verifyToken,
    autoSmsEnabled: false,
    token: tokenStatus,
    subscription,
    messagingSubscription,
    adsInsights,
    oauth: {
      startUrl: metaOAuthStartPath(),
      redirectUri: request ? metaOAuthRedirectUri(request) : PRODUCTION_OAUTH_REDIRECT_URI,
      productionRedirectUri: PRODUCTION_OAUTH_REDIRECT_URI,
      wwwRedirectUri: WWW_OAUTH_REDIRECT_URI,
      localhostRedirectUri: LOCAL_OAUTH_REDIRECT_URI,
      redirectUriOptions: metaOAuthRedirectUriOptions(),
    },
    appId: (await resolveMetaAppId()) || null,
    config: {
      pageId,
      pageName: tokenStatus.pageName || config.pageName || "",
      adAccountId: await resolveMetaAdAccountId(),
      pageAccessTokenMasked: maskSecret(token),
      hasPageAccessToken: Boolean(token),
      hasUserAccessToken: Boolean(config.userAccessToken?.trim()),
      hasAppSecret: Boolean(process.env.META_APP_SECRET?.trim() || config.appSecret?.trim()),
      lastSyncAt: config.lastSyncAt,
      lastSyncCount: config.lastSyncCount,
      lastWebhookAt: config.lastWebhookAt,
      lastWebhookCount: config.lastWebhookCount,
      lastError: tokenStatus.error || config.lastError || null,
      tokenExpiresAt: tokenStatus.expiresAt,
      backfilledAt: config.backfilledAt,
      updatedAt: config.updatedAt,
    },
  };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await metaStatusPayload(request));
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<MetaRuntimeConfig> & {
      pageAccessToken?: string;
    };
    const patch: Partial<MetaRuntimeConfig> = {
      autoSmsEnabled: false,
    };
    if (typeof body.pageId === "string") patch.pageId = body.pageId;
    if (typeof body.adAccountId === "string") patch.adAccountId = body.adAccountId;
    if (typeof body.verifyToken === "string") patch.verifyToken = body.verifyToken;
    if (typeof body.appId === "string" && body.appId.trim()) patch.appId = body.appId.trim();
    if (typeof body.appSecret === "string" && body.appSecret.trim()) {
      patch.appSecret = body.appSecret.trim();
    }

    const incomingToken =
      typeof body.pageAccessToken === "string" ? body.pageAccessToken.trim() : "";
    const pageId = (body.pageId || (await resolveMetaPageId()) || DEFAULT_META_PAGE_ID).trim();

    if (Object.keys(patch).length > 1 || !incomingToken) {
      await writeMetaRuntimeConfig(patch);
    }

    if (incomingToken) {
      const resolved = await resolvePermanentPageToken(pageId, incomingToken);
      await finalizeMetaConnection({
        pageId,
        pageToken: resolved.pageToken,
        userToken: resolved.userToken,
        pageName: resolved.pageName,
      });
    } else {
      if (patch.adAccountId || patch.appSecret) {
        await clearMetaInsightsCache();
      }
      try {
        await subscribePageToLeadgen();
      } catch {
        // Status payload reports subscription.
      }
    }

    return NextResponse.json({
      ok: true,
      ...(await metaStatusPayload(request)),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "disconnect") {
    await disconnectMetaConnection();
    return NextResponse.json({ ok: true, ...(await metaStatusPayload(request)) });
  }
  if (body.action === "subscribe") {
    try {
      const subscription = await subscribePageToLeadgen();
      return NextResponse.json({ ok: true, subscription });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Subscribe failed" },
        { status: 400 }
      );
    }
  }
  if (body.action === "subscribe-messaging") {
    try {
      const messagingSubscription = await subscribePageToMessaging();
      return NextResponse.json({ ok: true, messagingSubscription });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Subscribe failed" },
        { status: 400 }
      );
    }
  }
  if (body.action === "test-dm") {
    const result = await testMetaConnection();
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      pageId: result.pageId,
      pageName: result.pageName,
    });
  }
  if (body.action === "backfill-dm") {
    const days =
      typeof (body as { days?: number }).days === "number"
        ? (body as { days?: number }).days
        : 7;
    const result = await backfillMetaConversations({ days: days ?? 7 });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    const { ok: _ok, ...stats } = result;
    return NextResponse.json({ ok: true, ...stats });
  }
  if (body.action !== "sync") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    const result = await syncExistingMetaLeads();
    return NextResponse.json({ ok: true, ...result, autoSmsEnabled: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 400 }
    );
  }
}
