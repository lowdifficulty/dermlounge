"use client";

import { useCallback, useEffect, useState } from "react";
import MetaConnectionCard, {
  type MetaConnectionStatus,
} from "@/components/admin/MetaConnectionCard";
import type { MetaInsightsPayload, MetaInsightsRangeDays } from "@/lib/meta/insights-types";

function usd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function int(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

function updatedLabel(iso: string, cached: boolean): string {
  const when = new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return cached ? `Updated ${when} · cached for this meeting` : `Updated ${when}`;
}

function MetricCard({
  label,
  value,
  hint,
  featured,
}: {
  label: string;
  value: string;
  hint: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-5 py-6 ${
        featured
          ? "border-accent/20 bg-white shadow-sm"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
        {label}
      </div>
      <div
        className={`mt-2 font-sans font-semibold tabular-nums ${
          featured ? "text-4xl md:text-5xl text-brand" : "text-2xl text-brand"
        }`}
      >
        {value}
      </div>
      <p className="mt-2 text-sm text-gray-500">{hint}</p>
    </div>
  );
}

function TopAdVisual({ payload }: { payload: MetaInsightsPayload }) {
  const ad = payload.topAd;
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [ad?.id, payload.range.days]);

  if (!ad) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-2xl bg-section-gray px-6 text-center">
        <div>
          <p className="font-semibold text-brand">No ads ran in this period</p>
          <p className="mt-1 text-sm text-gray-500">
            When a campaign delivers, the top creative will appear here.
          </p>
        </div>
      </div>
    );
  }

  const showImage = ad.hasCreative && !broken;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] items-stretch">
      <div className="relative overflow-hidden rounded-2xl bg-brand min-h-[280px] max-h-[420px]">
          {showImage ? (
            <img
              src={`/api/admin/meta/creative?adId=${encodeURIComponent(ad.id)}&v=2`}
              alt={ad.name}
              width={1080}
              height={1080}
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
          <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-white/80">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-white/50">Creative</p>
              <p className="mt-2 font-serif text-xl text-white">{ad.name}</p>
              <p className="mt-2 text-sm text-white/60">
                Meta did not return an image for this ad.
              </p>
            </div>
          </div>
        )}
        {ad.creativeKind === "video" && showImage && (
          <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            Video
          </span>
        )}
      </div>
      <div className="flex flex-col justify-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          Top performing ad
        </p>
        <h3 className="mt-2 font-serif text-2xl md:text-3xl text-brand leading-tight">
          {ad.name}
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          Ranked by Instant Form leads, then click-through rate.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Spend</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-brand">{usd(ad.spend)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Leads</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-brand">{int(ad.leads)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">CPC</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-brand">{usd(ad.cpc)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">CPL</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-brand">{usd(ad.cpl)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">CTR</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-brand">{pct(ad.ctr)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default function MetaAdsDashboard() {
  const [range, setRange] = useState<MetaInsightsRangeDays>(7);
  const [payload, setPayload] = useState<MetaInsightsPayload | null>(null);
  const [connection, setConnection] = useState<MetaConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (days: MetaInsightsRangeDays) => {
    setLoading(true);
    try {
      const [insightsRes, metaRes] = await Promise.all([
        fetch(`/api/admin/meta/insights?range=${days}`),
        fetch("/api/admin/meta"),
      ]);
      if (metaRes.ok) {
        setConnection((await metaRes.json()) as MetaConnectionStatus);
      }
      if (insightsRes.status === 401) {
        setPayload(null);
        return;
      }
      const data = (await insightsRes.json()) as MetaInsightsPayload;
      setPayload(data);
    } catch {
      setPayload({
        ok: false,
        ownerMessage: "Connect Meta in Admin to load ads",
        range: {
          days,
          dateStart: null,
          dateStop: null,
          label: days === 30 ? "Last 30 days" : "Last 7 days",
        },
        account: null,
        topAd: null,
        adAccountId: "",
        cached: false,
        fetchedAt: new Date().toISOString(),
        error: { message: "Could not load ads performance" },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const account = payload?.account;
  const showEmpty = !loading && payload && !payload.ok;

  return (
    <div className="min-h-full bg-cream">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              My Derm Lounge
            </p>
            <h1 className="mt-2 font-serif text-3xl md:text-4xl text-brand">
              Meta Ads performance
            </h1>
            <p className="mt-2 text-sm md:text-base text-gray-600 max-w-xl">
              Cost per click, cost per Instant Form lead, and click-through rate
              for the selected period.
            </p>
          </div>
          <div className="flex rounded-full border border-gray-200 bg-white p-1 self-start">
            {([7, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRange(days)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  range === days
                    ? "bg-brand text-white"
                    : "text-gray-600 hover:text-brand"
                }`}
              >
                Last {days} days
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <MetaConnectionCard status={connection} compact />
        </div>

        <p className="mt-4 text-sm font-medium text-gray-700">
          {payload?.range.label || (range === 30 ? "Last 30 days" : "Last 7 days")}
        </p>

        {loading && (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-36 animate-pulse rounded-2xl bg-white border border-gray-100" />
            ))}
          </div>
        )}

        {!loading && showEmpty && (
          <div className="mt-10 rounded-3xl border border-gray-200 bg-white px-8 py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white text-sm font-bold">
              DL
            </div>
            <h2 className="font-serif text-2xl text-brand">Ads performance</h2>
            <p className="mt-3 text-base text-gray-600">
              {payload.ownerMessage || "Connect Meta in Admin to load ads"}
            </p>
          </div>
        )}

        {!loading && payload?.ok && account && (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <MetricCard
                featured
                label="CPC"
                value={usd(account.cpc)}
                hint="Cost per click"
              />
              <MetricCard
                featured
                label="CPL"
                value={usd(account.cpl)}
                hint="Cost per Instant Form lead"
              />
              <MetricCard
                featured
                label="CTR"
                value={pct(account.ctr)}
                hint="Click-through rate"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard label="Spend" value={usd(account.spend)} hint="Amount spent" />
              <MetricCard label="Clicks" value={int(account.clicks)} hint="Link clicks" />
              <MetricCard label="Leads" value={int(account.leads)} hint="Instant Form results" />
              <MetricCard label="Impressions" value={int(account.impressions)} hint="Times ads were shown" />
            </div>

            <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-5 md:p-8">
              <TopAdVisual payload={payload} />
            </section>

            <p className="mt-6 text-xs text-gray-400">
              Source: Meta Marketing API · {updatedLabel(payload.fetchedAt, payload.cached)} ·
              figures are not live to the second
            </p>
          </>
        )}
      </div>
    </div>
  );
}
