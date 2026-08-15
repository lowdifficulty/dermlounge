import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import {
  maskSecret,
  metaWebhookUrl,
  readMetaRuntimeConfig,
  resolveMetaPageAccessToken,
  resolveMetaPageId,
  resolveMetaVerifyToken,
  writeMetaRuntimeConfig,
  type MetaRuntimeConfig,
} from "@/lib/meta/config";
import { syncExistingMetaLeads } from "@/lib/meta/leads";
import { readLeadgenSubscription, subscribePageToLeadgen } from "@/lib/meta/subscribe";
import { ensureLongLivedPageToken, inspectMetaAccessToken } from "@/lib/meta/token";

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
      pageAccessTokenMasked: maskSecret(token),
      hasPageAccessToken: Boolean(token),
      hasAppSecret: Boolean(
        process.env.META_APP_SECRET?.trim() || config.appSecret?.trim()
      ),
      lastSyncAt: config.lastSyncAt,
      lastSyncCount: config.lastSyncCount,
      lastWebhookAt: config.lastWebhookAt,
      lastWebhookCount: config.lastWebhookCount,
      lastError: config.lastError || tokenStatus.error || null,
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
      pageId: body.pageId,
      verifyToken: body.verifyToken,
      appSecret: body.appSecret,
      autoSmsEnabled: false,
    };

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
      patch.tokenExpiresAt = upgraded.status.expiresAt;
      patch.lastError = null;
    }

    await writeMetaRuntimeConfig(patch);

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
