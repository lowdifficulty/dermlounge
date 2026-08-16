"use client";

type TokenKind = "page" | "user" | "expired" | "none" | "unknown";

export type MetaConnectionStatus = {
  connected: boolean;
  token?: {
    valid: boolean;
    kind?: TokenKind;
    pageId?: string | null;
    pageName?: string | null;
    error?: string;
  };
  subscription?: {
    subscribed: boolean;
    error?: string;
  };
  adsInsights?: {
    ok: boolean;
  };
  oauth?: {
    startUrl: string;
    redirectUri: string;
    productionRedirectUri: string;
    localhostRedirectUri: string;
  };
  config: {
    pageId: string;
    pageName?: string;
    lastSyncAt?: string;
    lastSyncCount?: number;
    lastWebhookAt?: string;
    lastWebhookCount?: number;
    lastError?: string | null;
  };
};

function when(iso?: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function tokenTypeLabel(kind?: TokenKind): string {
  if (kind === "page") return "Page (permanent)";
  if (kind === "user") return "User (will fail)";
  if (kind === "expired") return "Expired";
  return "Not connected";
}

function Row({
  ok,
  label,
  value,
}: {
  ok: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="flex items-center gap-2 text-sm font-medium text-right">
        <span
          className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
            ok ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className={ok ? "text-gray-900" : "text-red-800"}>{value}</span>
      </div>
    </div>
  );
}

export default function MetaConnectionCard({
  status,
  compact,
  connecting,
  disconnecting,
  onDisconnect,
  connectFailed,
}: {
  status: MetaConnectionStatus | null;
  compact?: boolean;
  connecting?: boolean;
  disconnecting?: boolean;
  onDisconnect?: () => void;
  connectFailed?: boolean;
}) {
  const connected = status?.connected === true;
  const kind = status?.token?.kind || (connected ? "page" : "none");
  const pageName = status?.token?.pageName || status?.config.pageName || "DermLounge";
  const pageId = status?.token?.pageId || status?.config.pageId || "";
  const subscribed = status?.subscription?.subscribed === true;
  const adsOk = status?.adsInsights?.ok === true;
  const startUrl = status?.oauth?.startUrl || "/api/admin/meta/oauth";
  const redirectUri =
    status?.oauth?.productionRedirectUri ||
    status?.oauth?.redirectUri ||
    "https://mydermlounge.com/api/admin/meta/oauth/callback";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Meta connection
          </p>
          <p className={`mt-1 text-lg font-semibold ${connected ? "text-green-800" : "text-red-800"}`}>
            {connected ? "Connected" : "Not connected"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={startUrl}
            className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            {connecting ? "Connecting…" : "Connect Meta"}
          </a>
          {onDisconnect && (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={disconnecting || !status?.config}
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        <Row
          ok={connected}
          label="Page"
          value={pageId ? `${pageName} · ${pageId}` : "Not set"}
        />
        <Row ok={kind === "page"} label="Token type" value={tokenTypeLabel(kind)} />
        <Row ok={subscribed} label="leadgen subscribed" value={subscribed ? "Yes" : "No"} />
        {!compact && (
          <>
            <Row
              ok={Boolean(status?.config.lastWebhookAt)}
              label="Last webhook received"
              value={
                status?.config.lastWebhookAt
                  ? `${when(status.config.lastWebhookAt)} (${status.config.lastWebhookCount ?? 0})`
                  : "Never"
              }
            />
            <Row
              ok={Boolean(status?.config.lastSyncAt)}
              label="Last lead pull (every 5 min)"
              value={
                status?.config.lastSyncAt
                  ? `${when(status.config.lastSyncAt)} (${status.config.lastSyncCount ?? 0} lead${
                      status.config.lastSyncCount === 1 ? "" : "s"
                    })`
                  : "Never"
              }
            />
          </>
        )}
        <Row ok={adsOk} label="Ads insights" value={adsOk ? "Yes" : "No"} />
      </div>

      {connectFailed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Add this exact URI in Facebook Login for Business → Settings → Valid OAuth
          Redirect URIs, then click Connect Meta again:
          <div className="mt-1 font-mono text-xs break-all">{redirectUri}</div>
        </div>
      )}
    </div>
  );
}
