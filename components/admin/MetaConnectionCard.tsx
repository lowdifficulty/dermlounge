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
    wwwRedirectUri?: string;
    localhostRedirectUri: string;
    redirectUriOptions?: string[];
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
  connectError,
  appId,
}: {
  status: MetaConnectionStatus | null;
  compact?: boolean;
  connecting?: boolean;
  disconnecting?: boolean;
  onDisconnect?: () => void;
  connectFailed?: boolean;
  connectError?: string | null;
  appId?: string | null;
}) {
  const connected = status?.connected === true;
  const kind = status?.token?.kind || (connected ? "page" : "none");
  const pageName = status?.token?.pageName || status?.config.pageName || "DermLounge";
  const pageId = status?.token?.pageId || status?.config.pageId || "";
  const subscribed = status?.subscription?.subscribed === true;
  const adsOk = status?.adsInsights?.ok === true;
  const startUrl = status?.oauth?.startUrl || "/api/admin/meta/oauth";
  const redirectUri =
    status?.oauth?.redirectUri ||
    status?.oauth?.productionRedirectUri ||
    "https://mydermlounge.com/api/admin/meta/oauth/callback";
  const redirectUriOptions =
    status?.oauth?.redirectUriOptions ||
    Array.from(
      new Set(
        [
          redirectUri,
          status?.oauth?.productionRedirectUri,
          status?.oauth?.wwwRedirectUri,
        ].filter(Boolean) as string[]
      )
    );

  const metaAppId = appId || "1058248473418887";
  const metaBasicUrl = `https://developers.facebook.com/apps/${metaAppId}/settings/basic/`;
  const metaLoginUrl = `https://developers.facebook.com/apps/${metaAppId}/fb-login/settings/`;

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
          <p className="text-xs text-gray-500 mb-3">
            When Facebook asks for permissions, turn on <strong>all</strong> toggles and select the{" "}
            <strong>DermLounge</strong> Page ({pageId || "107183565822734"}). Use the Facebook account
            that is an admin of that Page in Meta Business Settings.
          </p>
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

      {!connected && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-950 space-y-3">
          <p className="font-semibold">
            If Facebook shows &ldquo;Can&apos;t load URL — domain isn&apos;t included in the app&apos;s
            domains&rdquo;
          </p>
          <p>
            This is a Meta Developer Console setting — not the DermLounge website. Confirm you are
            editing app <strong>{metaAppId}</strong> (check the number in the Meta URL bar).
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Open{" "}
              <a href={metaBasicUrl} target="_blank" rel="noreferrer" className="underline font-semibold">
                Settings → Basic
              </a>
              . In <strong>App Domains</strong> type exactly{" "}
              <code className="font-mono bg-white/70 px-1 rounded">mydermlounge.com</code> — no{" "}
              <code>https://</code>, no trailing slash. Click <strong>Save Changes</strong>.
            </li>
            <li>
              On the same Basic page, scroll to <strong>Add platform</strong> → choose{" "}
              <strong>Website</strong> if it is missing. Set Site URL to{" "}
              <code className="font-mono text-xs break-all">https://mydermlounge.com/</code> and save
              again.
            </li>
            <li>
              Open{" "}
              <a href={metaLoginUrl} target="_blank" rel="noreferrer" className="underline font-semibold">
                Facebook Login → Settings
              </a>
              . If that page 404s, add the <strong>Facebook Login</strong> product first (left sidebar →
              Add product). Under <strong>Valid OAuth Redirect URIs</strong>, add both:
              <ul className="list-disc pl-5 mt-1 font-mono text-xs break-all space-y-1">
                {redirectUriOptions.map((uri) => (
                  <li key={uri}>{uri}</li>
                ))}
              </ul>
              Turn on <strong>Client OAuth Login</strong> and <strong>Web OAuth Login</strong>, then save.
            </li>
            <li>
              Use the <strong>Redirect URI Validator</strong> on that Facebook Login settings page.
              Paste{" "}
              <code className="font-mono text-xs break-all">{redirectUriOptions[0] || redirectUri}</code>{" "}
              — it must show valid before Connect Meta will work.
            </li>
          </ol>
          <p className="text-xs">
            Admin URL:{" "}
            <a href="https://mydermlounge.com/admin/" className="underline">
              https://mydermlounge.com/admin/
            </a>{" "}
            (www redirects to this automatically after deploy).
          </p>
        </div>
      )}

      {connectFailed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 space-y-2">
          <p>{connectError || "Connect Meta did not finish. See the steps below and try again."}</p>
          {(connectError || "").toLowerCase().includes("redirect") ||
          (connectError || "").toLowerCase().includes("domain") ? (
            <>
              <p>
                Add <strong>every</strong> URI below in Meta → <strong>Facebook Login</strong>{" "}
                (or Facebook Login for Business) → Settings → Valid OAuth Redirect URIs:
              </p>
              <ul className="list-disc pl-5 space-y-1 font-mono text-xs break-all">
                {redirectUriOptions.map((uri) => (
                  <li key={uri}>{uri}</li>
                ))}
              </ul>
              <p className="text-xs">
                Also set Settings → Basic → App Domains to <code>mydermlounge.com</code>, and use
                the same host you admin from (prefer{" "}
                <a href="https://mydermlounge.com/admin/" className="underline">
                  https://mydermlounge.com/admin/
                </a>
                ).
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
