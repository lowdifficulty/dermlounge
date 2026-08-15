export const META_INSIGHTS_RANGES = [7, 30] as const;
export type MetaInsightsRangeDays = (typeof META_INSIGHTS_RANGES)[number];

export type MetaAdsTotals = {
  spend: number;
  clicks: number;
  impressions: number;
  leads: number;
  cpc: number | null;
  cpl: number | null;
  ctr: number | null;
};

export type MetaTopAd = MetaAdsTotals & {
  id: string;
  name: string;
  hasCreative: boolean;
  creativeKind: "image" | "video" | "unknown";
};

export type MetaInsightsGraphError = {
  message: string;
  code?: number;
  errorSubcode?: number;
};

export type MetaInsightsPayload = {
  ok: boolean;
  ownerMessage: string | null;
  range: {
    days: MetaInsightsRangeDays;
    dateStart: string | null;
    dateStop: string | null;
    label: string;
  };
  account: MetaAdsTotals | null;
  topAd: MetaTopAd | null;
  adAccountId: string;
  cached: boolean;
  fetchedAt: string;
  error: MetaInsightsGraphError | null;
};
