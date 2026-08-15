import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import {
  maskSecret,
  metaWebhookUrl,
  readMetaRuntimeConfig,
  resolveMetaAdAccountId,
  resolveMetaPageAccessToken,
  resolveMetaPageId,
  resolveMetaVerifyToken,
  writeMetaRuntimeConfig,
  type MetaRuntimeConfig,
} from "@/lib/meta/config";
import { syncExistingMetaLeads } from "@/lib/meta/leads";
import { readLeadgenSubscription, subscribePageToLeadgen } from "@/lib/meta/subscribe";
import { ensureLongLivedPageToken, inspectMetaAccessToken } from "@/lib/meta/token";
import { clearMetaInsightsCache } from "@/lib/meta/insights";

async function metaStatusPayload() {
  const config = await readMetaRuntimeConfig();
  const pageId = await resolveMetaPageId();
  const token = await resolveMetaPageAccessToken();
  const verifyToken = await resolveMetaVerifyToken();
  const tokenStatus = await inspectMetaAccessToken(token);
  const subscription = tokenStatus.valid
    ? await readLeadgenSubscription()
    : { subscribed: false, fields: [] as string[], error: tokenStatus.error };

  return {
    connected: Boolean(pageId && token),
    instant: true,
    webhookUrl: metaWebhookUrl(),
    verifyToken,
    autoSmsEnabled: false,
    token: tokenStatus,
    subscription,
    config: {
      pageId: pageId || "",
      adAccountId: await resolveMetaAdAccountId(),
      pageAccessTokenMasked: maskSecret(token),
      hasPageAccessToken: Boolean(token),
      hasUserAccessToken: Boolean(config.userAccessToken?.trim()),
      hasAppSecret: Boolean(
        process.env.META_APP_SECRET?.trim() || config.appSecret?.trim()
      ),
      lastSyncAt: config.lastSyncAt,
      lastSyncCount: config.lastSyncCount,
      lastWebhookAt: config.lastWebhookAt,
      lastWebhookCount: config.lastWebhookCount,
      lastError: tokenStatus.error || config.lastError || null,
      tokenExpiresAt: tokenStatus.expiresAt,
      updatedAt: config.updatedAt,
    },
  };
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await metaStatusPayload());
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
    const pageId = (body.pageId || (await resolveMetaPageId()) || "").trim();
    if (incomingToken) {
      if (!pageId) {
        return NextResponse.json(
          { error: "Facebook Page ID is required before saving a token" },
          { status: 400 }
        );
      }
      const upgraded = await ensureLongLivedPageToken(pageId, incomingToken);
      patch.pageAccessToken = upgraded.token;
      if (upgraded.userToken) patch.userAccessToken = upgraded.userToken;
      patch.tokenExpiresAt = upgraded.status.expiresAt;
      patch.lastError = null;
    }

    await writeMetaRuntimeConfig(patch);
    if (incomingToken || patch.appSecret || patch.adAccountId) {
      await clearMetaInsightsCache();
    }

    let subscription = null;
    let sync = null;
    try {
      subscription = await subscribePageToLeadgen();
    } catch (err) {
      subscription = {
        subscribed: false,
        fields: [],
        error: err instanceof Error ? err.message : "Subscribe failed",
      };
    }

    if (incomingToken) {
      try {
        sync = await syncExistingMetaLeads();
      } catch (err) {
        sync = {
          error: err instanceof Error ? err.message : "Sync failed",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      ...(await metaStatusPayload()),
      subscription,
      sync,
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
