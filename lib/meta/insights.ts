import "server-only";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import {
  META_INSIGHTS_CACHE_TTL_SEC,
  metaAdAccountPath,
  resolveMetaAdAccountId,
  resolveMetaAdsAccessToken,
  resolveMetaAppSecret,
  resolveMetaPageAccessToken,
} from "./config";
import { graphGet, MetaGraphError } from "./graph";
import type {
  MetaAdsTotals,
  MetaInsightsGraphError,
  MetaInsightsPayload,
  MetaInsightsRangeDays,
  MetaTopAd,
} from "./insights-types";

export type {
  MetaAdsTotals,
  MetaInsightsGraphError,
  MetaInsightsPayload,
  MetaInsightsRangeDays,
  MetaTopAd,
} from "./insights-types";
export { META_INSIGHTS_RANGES } from "./insights-types";

const ACCOUNT_TZ = "America/Los_Angeles";
const ERROR_CACHE_TTL_SEC = 3 * 60;
const INSIGHTS_FIELDS =
  "spend,clicks,impressions,cpc,ctr,actions,cost_per_action_type,date_start,date_stop";
const AD_INSIGHTS_FIELDS = `ad_id,ad_name,${INSIGHTS_FIELDS}`;
const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "omni_lead",
] as const;

const OWNER_CONNECT_MESSAGE = "Connect Meta in Admin to load ads";

type ActionValue = { action_type?: string; value?: string };

type InsightRow = {
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  clicks?: string;
  impressions?: string;
  cpc?: string;
  ctr?: string;
  actions?: ActionValue[];
  cost_per_action_type?: ActionValue[];
  date_start?: string;
  date_stop?: string;
};

type GraphList<T> = { data?: T[]; paging?: { next?: string } };

type CreativeBody = {
  id?: string;
  name?: string;
  thumbnail_url?: string;
  image_url?: string;
  image_hash?: string;
  video_id?: string;
  object_story_spec?: {
    link_data?: { picture?: string; image_hash?: string };
    video_data?: { image_url?: string; video_id?: string };
    photo_data?: { url?: string; image_hash?: string };
  };
  asset_feed_spec?: {
    images?: { url?: string; hash?: string }[];
    videos?: { thumbnail_url?: string; url?: string }[];
  };
};

const CREATIVE_IMAGE_FIELDS =
  "id,name,image_url,image_hash,thumbnail_url,video_id,object_story_spec,asset_feed_spec";
const CREATIVE_THUMB_PX = "1080";
const CREATIVE_CACHE_PREFIX = "dl:meta-creative:v2:";

type CachedCreative = {
  adId: string;
  url: string;
  kind: "image" | "video" | "unknown";
};

const memoryInsights = new Map<string, { expiresAt: number; value: MetaInsightsPayload }>();
const memoryCreative = new Map<string, { expiresAt: number; value: CachedCreative | null }>();

function num(value?: string | null): number {
  const n = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function todayYmd(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return dt.toISOString().slice(0, 10);
}

export function parseInsightsRange(raw?: string | null): MetaInsightsRangeDays {
  return raw === "30" ? 30 : 7;
}

function rangeWindow(days: MetaInsightsRangeDays): { since: string; until: string } {
  const until = todayYmd(ACCOUNT_TZ);
  const since = addDaysYmd(until, -(days - 1));
  return { since, until };
}

function formatRangeLabel(
  days: MetaInsightsRangeDays,
  dateStart?: string | null,
  dateStop?: string | null
): string {
  const period = days === 30 ? "Last 30 days" : "Last 7 days";
  if (!dateStart || !dateStop) return period;
  const start = new Date(`${dateStart}T12:00:00`);
  const stop = new Date(`${dateStop}T12:00:00`);
  const sameYear = start.getFullYear() === stop.getFullYear();
  const startFmt = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  const stopFmt = stop.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${period} · ${startFmt} – ${stopFmt}`;
}

function actionValue(actions: ActionValue[] | undefined, types: readonly string[]): number {
  if (!actions?.length) return 0;
  for (const type of types) {
    const match = actions.find((item) => item.action_type === type);
    if (match) return num(match.value);
  }
  return 0;
}

function deriveTotals(row?: InsightRow | null): MetaAdsTotals {
  const spend = num(row?.spend);
  const clicks = num(row?.clicks);
  const impressions = num(row?.impressions);
  const leads = actionValue(row?.actions, LEAD_ACTION_TYPES);
  const metaCpc = row?.cpc != null && row.cpc !== "" ? num(row.cpc) : null;
  const metaCtr = row?.ctr != null && row.ctr !== "" ? num(row.ctr) : null;
  return {
    spend,
    clicks,
    impressions,
    leads,
    cpc: clicks > 0 ? (metaCpc != null && metaCpc > 0 ? metaCpc : spend / clicks) : null,
    cpl: leads > 0 ? spend / leads : null,
    ctr: impressions > 0 ? (metaCtr != null ? metaCtr : (clicks / impressions) * 100) : null,
  };
}

function ownerMessageForGraphError(err: MetaGraphError): string {
  if (err.code === 4 || err.code === 17 || err.code === 80004) {
    return "Meta is busy right now. Try again in a few minutes.";
  }
  return OWNER_CONNECT_MESSAGE;
}

function graphErrorPayload(err: unknown): MetaInsightsGraphError {
  if (err instanceof MetaGraphError) {
    return {
      message: err.message,
      code: err.code,
      errorSubcode: err.errorSubcode,
    };
  }
  return { message: err instanceof Error ? err.message : "Meta insights request failed" };
}

function emptyPayload(
  days: MetaInsightsRangeDays,
  adAccountId: string,
  patch: Partial<MetaInsightsPayload>
): MetaInsightsPayload {
  const window = rangeWindow(days);
  return {
    ok: false,
    ownerMessage: OWNER_CONNECT_MESSAGE,
    range: {
      days,
      dateStart: window.since,
      dateStop: window.until,
      label: formatRangeLabel(days, window.since, window.until),
    },
    account: null,
    topAd: null,
    adAccountId,
    cached: false,
    fetchedAt: new Date().toISOString(),
    error: null,
    ...patch,
  };
}

function cacheKey(adAccountId: string, days: MetaInsightsRangeDays): string {
  return `dl:meta-insights:v1:${adAccountId}:${days}`;
}

async function readCache(key: string): Promise<MetaInsightsPayload | null> {
  const mem = memoryInsights.get(key);
  if (mem && mem.expiresAt > Date.now()) return { ...mem.value, cached: true };
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const data = await redis.get<MetaInsightsPayload>(key);
    if (!data) return null;
    return { ...data, cached: true };
  } catch {
    return null;
  }
}

async function writeCache(
  key: string,
  value: MetaInsightsPayload,
  ttlSec: number
): Promise<void> {
  const stored = { ...value, cached: false };
  memoryInsights.set(key, { expiresAt: Date.now() + ttlSec * 1000, value: stored });
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(key, stored, { ex: ttlSec });
  } catch {
    /* keep memory cache */
  }
}

export async function clearMetaInsightsCache(): Promise<void> {
  memoryInsights.clear();
  memoryCreative.clear();
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const adAccountId = await resolveMetaAdAccountId();
    await Promise.all([
      redis.del(cacheKey(adAccountId, 7)),
      redis.del(cacheKey(adAccountId, 30)),
    ]);
  } catch {
    /* ignore */
  }
}

function rankTopAd(ads: InsightRow[]): InsightRow | null {
  if (!ads.length) return null;
  return [...ads].sort((a, b) => {
    const totalsA = deriveTotals(a);
    const totalsB = deriveTotals(b);
    if (totalsB.leads !== totalsA.leads) return totalsB.leads - totalsA.leads;
    const ctrA = totalsA.ctr ?? -1;
    const ctrB = totalsB.ctr ?? -1;
    if (ctrB !== ctrA) return ctrB - ctrA;
    return totalsB.spend - totalsA.spend;
  })[0];
}

function firstHttpUrl(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && /^https?:\/\//i.test(trimmed)) return trimmed.split("#")[0];
  }
  return null;
}

function stripTokenFromUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.searchParams.delete("access_token");
    url.searchParams.delete("appsecret_proof");
    return url.toString();
  } catch {
    return raw;
  }
}

export function isAllowedCreativeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fbcdn.net" ||
    host.endsWith(".fbcdn.net") ||
    host === "instagram.com" ||
    host.endsWith(".instagram.com") ||
    host === "cdninstagram.com" ||
    host.endsWith(".cdninstagram.com") ||
    host === "fbsbx.com" ||
    host.endsWith(".fbsbx.com") ||
    host === "graph.facebook.com" ||
    host.endsWith(".graph.facebook.com")
  );
}

function creativeKindFrom(creative: CreativeBody, url: string | null): "image" | "video" | "unknown" {
  if (creative.video_id || creative.object_story_spec?.video_data?.video_id) return "video";
  if (creative.asset_feed_spec?.videos?.length) return "video";
  if (url) return "image";
  return "unknown";
}

function looksLikeTinyThumb(url: string): boolean {
  return (
    /(?:^|[/_])(?:p|s)(?:64|74|75|100|130|150|160)x(?:64|74|75|100|130|150|160)(?:[/_]|$)/i.test(
      url
    ) || /[?&](?:w|width|h|height)=(64|74|75|100|130|150|160)\b/i.test(url)
  );
}

function collectImageHashes(creative: CreativeBody): string[] {
  return [
    creative.image_hash,
    creative.object_story_spec?.link_data?.image_hash,
    creative.object_story_spec?.photo_data?.image_hash,
    creative.asset_feed_spec?.images?.[0]?.hash,
  ].filter((hash): hash is string => Boolean(hash?.trim()));
}

function collectVideoIds(creative: CreativeBody): string[] {
  return [creative.video_id, creative.object_story_spec?.video_data?.video_id].filter(
    (id): id is string => Boolean(id?.trim())
  );
}

/** Prefer original/full assets. Default Graph thumbnail_url is 64px — last resort only. */
function pickCreativeUrl(creative: CreativeBody): string | null {
  const full = firstHttpUrl(
    creative.image_url,
    creative.object_story_spec?.photo_data?.url,
    creative.object_story_spec?.link_data?.picture,
    creative.object_story_spec?.video_data?.image_url,
    creative.asset_feed_spec?.images?.[0]?.url,
    creative.asset_feed_spec?.videos?.[0]?.url
  );
  if (full && !looksLikeTinyThumb(full)) return stripTokenFromUrl(full);

  const largeThumb = firstHttpUrl(
    creative.thumbnail_url,
    creative.asset_feed_spec?.videos?.[0]?.thumbnail_url,
    full || undefined
  );
  return largeThumb ? stripTokenFromUrl(largeThumb) : null;
}

async function fetchCreativeBody(creativeId: string, token: string): Promise<CreativeBody> {
  return graphGet<CreativeBody>(creativeId, token, {
    fields: CREATIVE_IMAGE_FIELDS,
    thumbnail_width: CREATIVE_THUMB_PX,
    thumbnail_height: CREATIVE_THUMB_PX,
  });
}

async function lookupAdImageUrl(
  adAccountId: string,
  token: string,
  imageHash: string
): Promise<string | null> {
  try {
    const images = await graphGet<
      GraphList<{ url?: string; permalink_url?: string; width?: number; height?: number }>
    >(`${metaAdAccountPath(adAccountId)}/adimages`, token, {
      hashes: JSON.stringify([imageHash]),
      fields: "url,permalink_url,width,height",
    });
    const row = images.data?.[0];
    const url = firstHttpUrl(row?.url, row?.permalink_url);
    return url ? stripTokenFromUrl(url) : null;
  } catch {
    return null;
  }
}

async function lookupVideoPicture(videoId: string, token: string): Promise<string | null> {
  try {
    const picture = await graphGet<{ data?: { url?: string }; url?: string }>(
      `${videoId}/picture`,
      token,
      { redirect: "false", width: CREATIVE_THUMB_PX, height: CREATIVE_THUMB_PX }
    );
    const url = firstHttpUrl(picture.data?.url, picture.url);
    if (url) return stripTokenFromUrl(url);
  } catch {
    /* try video.picture field */
  }
  try {
    const video = await graphGet<{ picture?: string }>(videoId, token, { fields: "picture" });
    const url = firstHttpUrl(video.picture);
    return url ? stripTokenFromUrl(url) : null;
  } catch {
    return null;
  }
}

async function fetchAdList(
  path: string,
  token: string,
  search: Record<string, string>,
  maxPages = 4
): Promise<InsightRow[]> {
  const rows: InsightRow[] = [];
  let pagePath: string | null = path;
  let pageSearch: Record<string, string> | undefined = search;
  for (let i = 0; i < maxPages && pagePath; i++) {
    const json: GraphList<InsightRow> = await graphGet<GraphList<InsightRow>>(
      pagePath,
      token,
      pageSearch
    );
    rows.push(...(json.data ?? []));
    const next: string | undefined = json.paging?.next;
    if (!next) break;
    const nextUrl = new URL(next);
    pagePath = nextUrl.pathname.replace(/^\/v\d+\.\d+\//, "").replace(/^\//, "");
    pageSearch = Object.fromEntries(nextUrl.searchParams.entries());
    delete pageSearch.appsecret_proof;
    pageSearch.access_token = token;
  }
  return rows;
}

async function lookupCreative(
  adId: string,
  token: string,
  adAccountId: string
): Promise<CachedCreative | null> {
  const ad = await graphGet<{
    id?: string;
    name?: string;
    creative?: CreativeBody & { id?: string };
  }>(adId, token, {
    fields: `id,name,creative{${CREATIVE_IMAGE_FIELDS}}`,
  });
  let creative = ad.creative ?? {};
  if (ad.creative?.id) {
    try {
      creative = { ...creative, ...(await fetchCreativeBody(ad.creative.id, token)) };
    } catch {
      /* keep nested creative — thumbnail_width only applies on the creative node */
    }
  }

  const picked = pickCreativeUrl(creative);
  const thumbUrl = creative.thumbnail_url ? stripTokenFromUrl(creative.thumbnail_url) : null;
  const pickedIsGeneratedThumb = Boolean(picked && thumbUrl && picked === thumbUrl);
  let url: string | null =
    picked && !looksLikeTinyThumb(picked) && !pickedIsGeneratedThumb ? picked : null;

  if (!url) {
    for (const hash of collectImageHashes(creative)) {
      const hashUrl = await lookupAdImageUrl(adAccountId, token, hash);
      if (hashUrl && !looksLikeTinyThumb(hashUrl)) {
        url = hashUrl;
        break;
      }
      if (!url && hashUrl) url = hashUrl;
    }
  }

  if (!url || looksLikeTinyThumb(url)) {
    for (const videoId of collectVideoIds(creative)) {
      const videoUrl = await lookupVideoPicture(videoId, token);
      if (videoUrl && !looksLikeTinyThumb(videoUrl)) {
        url = videoUrl;
        break;
      }
      if (!url && videoUrl) url = videoUrl;
    }
  }

  if (!url) url = picked;
  if (!url) return null;
  return { adId, url, kind: creativeKindFrom(creative, url) };
}

async function cachedCreativeFor(
  adId: string,
  token: string,
  adAccountId: string
): Promise<CachedCreative | null> {
  const key = `${CREATIVE_CACHE_PREFIX}${adId}`;
  const mem = memoryCreative.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.value;
  try {
    const value = await lookupCreative(adId, token, adAccountId);
    memoryCreative.set(key, {
      expiresAt: Date.now() + META_INSIGHTS_CACHE_TTL_SEC * 1000,
      value,
    });
    return value;
  } catch {
    memoryCreative.set(key, { expiresAt: Date.now() + ERROR_CACHE_TTL_SEC * 1000, value: null });
    return null;
  }
}

async function insightsForToken(
  token: string,
  adAccountId: string,
  days: MetaInsightsRangeDays
): Promise<{ account: InsightRow | undefined; ads: InsightRow[] }> {
  const { since, until } = rangeWindow(days);
  const timeRange = JSON.stringify({ since, until });
  const act = metaAdAccountPath(adAccountId);
  const [accountRows, adRows] = await Promise.all([
    graphGet<GraphList<InsightRow>>(`${act}/insights`, token, {
      fields: INSIGHTS_FIELDS,
      time_range: timeRange,
      level: "account",
    }),
    fetchAdList(`${act}/insights`, token, {
      fields: AD_INSIGHTS_FIELDS,
      time_range: timeRange,
      level: "ad",
      limit: "50",
    }),
  ]);
  return { account: accountRows.data?.[0], ads: adRows };
}

export async function loadMetaInsights(
  days: MetaInsightsRangeDays
): Promise<MetaInsightsPayload> {
  const adAccountId = await resolveMetaAdAccountId();
  const key = cacheKey(adAccountId, days);
  const cached = await readCache(key);
  if (cached) return cached;

  const adsToken = await resolveMetaAdsAccessToken();
  const pageToken = await resolveMetaPageAccessToken();
  const hasSecret = Boolean(await resolveMetaAppSecret());
  if (!adsToken && !pageToken) {
    const payload = emptyPayload(days, adAccountId, {
      ownerMessage: OWNER_CONNECT_MESSAGE,
      error: { message: "No Meta access token is stored" },
    });
    await writeCache(key, payload, ERROR_CACHE_TTL_SEC);
    return payload;
  }
  if (!hasSecret) {
    const payload = emptyPayload(days, adAccountId, {
      ownerMessage: OWNER_CONNECT_MESSAGE,
      error: { message: "Meta app secret is required for Graph calls (appsecret_proof)" },
    });
    await writeCache(key, payload, ERROR_CACHE_TTL_SEC);
    return payload;
  }

  const tokens = [adsToken, pageToken].filter((value, index, all): value is string => {
    return Boolean(value) && all.indexOf(value) === index;
  });

  let lastError: unknown;
  for (const token of tokens) {
    try {
      const { account, ads } = await insightsForToken(token, adAccountId, days);
      const totals = deriveTotals(account);
      const winner = rankTopAd(ads);
      const winnerTotals = deriveTotals(winner);
      let topAd: MetaTopAd | null = null;
      if (winner?.ad_id) {
        const creative = await cachedCreativeFor(winner.ad_id, token, adAccountId);
        topAd = {
          ...winnerTotals,
          id: winner.ad_id,
          name: winner.ad_name?.trim() || "Untitled ad",
          hasCreative: Boolean(creative?.url),
          creativeKind: creative?.kind || "unknown",
        };
      }
      const dateStart = account?.date_start || winner?.date_start || rangeWindow(days).since;
      const dateStop = account?.date_stop || winner?.date_stop || rangeWindow(days).until;
      const payload: MetaInsightsPayload = {
        ok: true,
        ownerMessage: null,
        range: {
          days,
          dateStart,
          dateStop,
          label: formatRangeLabel(days, dateStart, dateStop),
        },
        account: totals,
        topAd,
        adAccountId,
        cached: false,
        fetchedAt: new Date().toISOString(),
        error: null,
      };
      await writeCache(key, payload, META_INSIGHTS_CACHE_TTL_SEC);
      return payload;
    } catch (err) {
      lastError = err;
    }
  }

  const graph = graphErrorPayload(lastError);
  const payload = emptyPayload(days, adAccountId, {
    ownerMessage:
      lastError instanceof MetaGraphError
        ? ownerMessageForGraphError(lastError)
        : OWNER_CONNECT_MESSAGE,
    error: graph,
  });
  await writeCache(key, payload, ERROR_CACHE_TTL_SEC);
  return payload;
}

export async function loadAdCreativeImage(
  adId: string
): Promise<{ url: string } | null> {
  if (!/^\d+$/.test(adId)) return null;
  const token = (await resolveMetaAdsAccessToken()) || (await resolveMetaPageAccessToken());
  if (!token) return null;
  const adAccountId = await resolveMetaAdAccountId();
  const creative = await cachedCreativeFor(adId, token, adAccountId);
  if (!creative?.url) return null;
  try {
    const host = new URL(creative.url).hostname;
    if (!isAllowedCreativeHost(host)) return null;
  } catch {
    return null;
  }
  return { url: creative.url };
}
