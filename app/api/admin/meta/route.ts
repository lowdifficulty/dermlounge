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

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await readMetaRuntimeConfig();
  const pageId = await resolveMetaPageId();
  const token = await resolveMetaPageAccessToken();
  const verifyToken = await resolveMetaVerifyToken();

  return NextResponse.json({
    connected: Boolean(pageId && token),
    webhookUrl: metaWebhookUrl(),
    verifyToken,
    autoSmsEnabled: false,
    config: {
      pageId: pageId || "",
      pageAccessTokenMasked: maskSecret(token),
      hasPageAccessToken: Boolean(token),
      hasAppSecret: Boolean(
        process.env.META_APP_SECRET?.trim() || config.appSecret?.trim()
      ),
      lastSyncAt: config.lastSyncAt,
      lastSyncCount: config.lastSyncCount,
      updatedAt: config.updatedAt,
    },
  });
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
    if (typeof body.pageAccessToken === "string" && body.pageAccessToken.trim()) {
      patch.pageAccessToken = body.pageAccessToken;
    }
    const config = await writeMetaRuntimeConfig(patch);
    return NextResponse.json({
      ok: true,
      connected: Boolean(
        (await resolveMetaPageId()) && (await resolveMetaPageAccessToken())
      ),
      webhookUrl: metaWebhookUrl(),
      verifyToken: await resolveMetaVerifyToken(),
      config: {
        pageId: config.pageId || "",
        pageAccessTokenMasked: maskSecret(
          process.env.META_PAGE_ACCESS_TOKEN || config.pageAccessToken
        ),
        hasPageAccessToken: Boolean(
          process.env.META_PAGE_ACCESS_TOKEN?.trim() || config.pageAccessToken
        ),
        lastSyncAt: config.lastSyncAt,
        lastSyncCount: config.lastSyncCount,
      },
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
