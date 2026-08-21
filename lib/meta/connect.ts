import "server-only";
import {
  metaAdAccountPath,
  resolveMetaAdAccountId,
  resolveMetaAdsAccessToken,
  writeMetaRuntimeConfig,
} from "./config";
import { graphGet } from "./graph";
import { clearMetaInsightsCache } from "./insights";
import { syncRecentMetaLeads } from "./leads";
import { readLeadgenSubscription, subscribePageToLeadgen, subscribePageToMessaging } from "./subscribe";
import { probePageToken, USER_TOKEN_PASTE_MESSAGE, type MetaTokenStatus } from "./token";

export type MetaAdsProbe = { ok: boolean; error?: string };

export async function probeAdsRead(token?: string | null): Promise<MetaAdsProbe> {
  const access = token || (await resolveMetaAdsAccessToken());
  if (!access) return { ok: false, error: "No token" };
  const adAccountId = await resolveMetaAdAccountId();
  try {
    await graphGet(`${metaAdAccountPath(adAccountId)}/insights`, access, {
      fields: "spend",
      date_preset: "yesterday",
      limit: "1",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "ads_read is not granted" };
  }
}

export async function finalizeMetaConnection(opts: {
  pageId: string;
  pageToken: string;
  userToken?: string;
  pageName?: string;
}): Promise<{
  health: MetaTokenStatus;
  subscription: Awaited<ReturnType<typeof readLeadgenSubscription>>;
  sync:
    | Awaited<ReturnType<typeof syncRecentMetaLeads>>
    | { fetched?: number; created?: number; updated?: number; skipped?: number; error: string };
  adsInsights: MetaAdsProbe;
}> {
  const health = await probePageToken(opts.pageToken, opts.pageId);
  if (!health.valid) {
    throw new Error(
      health.missingPagePerms ? USER_TOKEN_PASTE_MESSAGE : health.error || "Page token failed"
    );
  }

  await writeMetaRuntimeConfig({
    pageId: opts.pageId,
    pageName: opts.pageName || health.pageName || "",
    pageAccessToken: opts.pageToken,
    userAccessToken: opts.userToken || "",
    tokenExpiresAt: null,
    lastError: null,
    disconnected: false,
  });
  await clearMetaInsightsCache();

  let subscription;
  try {
    subscription = await subscribePageToLeadgen();
  } catch (err) {
    subscription = {
      subscribed: false,
      fields: [] as string[],
      error: err instanceof Error ? err.message : "Subscribe failed",
    };
  }

  try {
    await subscribePageToMessaging();
  } catch (err) {
    console.error("Meta messages subscribe failed:", err);
  }

  let sync;
  try {
    sync = await syncRecentMetaLeads(72);
  } catch (err) {
    sync = {
      error: err instanceof Error ? err.message : "Sync failed",
    };
  }

  const adsInsights = await probeAdsRead(opts.userToken || opts.pageToken);
  return { health, subscription, sync, adsInsights };
}

export async function disconnectMetaConnection(): Promise<void> {
  await writeMetaRuntimeConfig({
    pageAccessToken: "",
    userAccessToken: "",
    pageName: "",
    tokenExpiresAt: null,
    lastError: null,
    disconnected: true,
  });
  await clearMetaInsightsCache();
}
