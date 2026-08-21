"use client";

import { useCallback, useEffect, useState } from "react";
import MetaConnectionCard, {
  type MetaConnectionStatus,
} from "@/components/admin/MetaConnectionCard";

type MetaStatus = MetaConnectionStatus & {
  webhookUrl: string;
  verifyToken: string;
  autoSmsEnabled: boolean;
  appId?: string | null;
  tokenScopes?: string[];
  missingLeadScopes?: string[];
  needsLeadScopeReconnect?: boolean;
  config: MetaConnectionStatus["config"] & {
    adAccountId?: string;
    pageAccessTokenMasked: string;
    hasPageAccessToken: boolean;
    hasUserAccessToken?: boolean;
    hasAppSecret?: boolean;
    tokenExpiresAt?: string | null;
  };
};

export default function MetaLeadsPanel() {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [pageId, setPageId] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectFailed, setConnectFailed] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/meta");
      if (!res.ok) throw new Error("Could not load Meta settings");
      const data = (await res.json()) as MetaStatus;
      setStatus(data);
      setPageId(data.config.pageId || "");
      setAdAccountId(data.config.adAccountId || "");
      setVerifyToken(data.verifyToken || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("meta") === "connected") {
      setMessage("Meta is connected. Instant Form leads will enter CRM automatically.");
      setConnectFailed(false);
      setConnectError(null);
    }
    const err = params.get("meta_error");
    if (err) {
      setError(err);
      setConnectFailed(true);
      setConnectError(err);
      setShowAdvanced(true);
    }
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/meta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId,
          adAccountId,
          verifyToken,
          ...(pageAccessToken.trim() ? { pageAccessToken } : {}),
          ...(appSecret.trim() ? { appSecret } : {}),
        }),
      });
      const data = (await res.json()) as MetaStatus & { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      setPageAccessToken("");
      setAppSecret("");
      setStatus(data);
      setPageId(data.config.pageId || pageId);
      setAdAccountId(data.config.adAccountId || adAccountId);
      setVerifyToken(data.verifyToken || verifyToken);
      setMessage(
        data.connected
          ? "System User token saved. Instant Form leads will enter CRM automatically."
          : "Settings saved."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function syncLeads() {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      const errNote = data.errors?.length > 0 ? ` ${data.errors.length} error(s).` : "";
      setMessage(
        `Pulled ${data.fetched} Meta lead(s): ${data.created} new, ${data.updated} updated, ${data.skipped} skipped.${errNote} No SMS sent.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Meta? Instant Form leads will stop entering CRM until you connect again.")) {
      return;
    }
    setDisconnecting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = (await res.json()) as MetaStatus & { error?: string };
      if (!res.ok) throw new Error(data.error || "Disconnect failed");
      setStatus(data);
      setMessage("Meta disconnected.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading && !status) {
    return <div className="p-6 text-sm text-gray-500">Loading Meta Lead Ads…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-brand">Meta Lead Ads</h2>
        <p className="text-sm text-gray-600 mt-1">
          Click <strong>Connect Meta</strong> once. Instant Form leads land in CRM as{" "}
          <strong>Wound Care</strong> contacts. Existing Lead Center leads auto-pull every 5
          minutes. Automatic SMS stays off.
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-green-200 bg-green-50 text-green-800 px-4 py-3 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {status?.connected && status.needsLeadScopeReconnect && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-950 px-4 py-3 text-sm space-y-2">
          <p className="font-semibold">Reconnect Meta to enable Pull now</p>
          <p>
            Your token is missing:{" "}
            <code className="font-mono text-xs">
              {(status.missingLeadScopes || []).join(", ")}
            </code>
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              In{" "}
              <a
                href={`https://developers.facebook.com/apps/${status.appId || "1058248473418887"}/app-review/permissions/`}
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold"
              >
                Meta App → Permissions and Features
              </a>
              , ensure <strong>pages_manage_ads</strong> and{" "}
              <strong>leads_retrieval</strong> are added to the app.
            </li>
            <li>
              Click <strong>Disconnect</strong>, then <strong>Connect Meta</strong> again.
            </li>
            <li>
              On Facebook, allow <strong>all</strong> Page and Ads permissions (including manage
              ads).
            </li>
          </ol>
        </div>
      )}

      <MetaConnectionCard
        status={status}
        disconnecting={disconnecting}
        onDisconnect={() => void disconnect()}
        connectFailed={connectFailed}
        connectError={connectError}
        appId={status?.appId}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void syncLeads()}
          disabled={syncing || !status?.connected}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 disabled:opacity-50"
        >
          {syncing ? "Pulling…" : "Pull now"}
        </button>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((open) => !open)}
          className="text-sm font-semibold text-gray-600 underline-offset-2 hover:underline"
        >
          {showAdvanced ? "Hide advanced" : "Advanced: paste a System User token"}
        </button>
      </div>

      {showAdvanced && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <p className="text-sm text-gray-600">
            Only paste a Business Manager <strong>System User</strong> token assigned to the
            DermLounge Page. User tokens from Graph Explorer will be rejected.
          </p>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
              Facebook Page ID
            </span>
            <input
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              placeholder="107183565822734"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
              Ad account ID
            </span>
            <input
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              placeholder="593540209723240"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
              System User token
            </span>
            <input
              type="password"
              value={pageAccessToken}
              onChange={(e) => setPageAccessToken(e.target.value)}
              placeholder={
                status?.config.hasPageAccessToken
                  ? `Saved ${status.config.pageAccessTokenMasked} — paste a new token to replace`
                  : "Paste a System User token assigned to the DermLounge Page"
              }
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
              autoComplete="off"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
              Webhook verify token
            </span>
            <input
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
              App secret
            </span>
            <input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={
                status?.config.hasAppSecret ? "Saved — paste to replace" : "Required for Graph appsecret_proof"
              }
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
              autoComplete="off"
            />
          </label>

          <p className="text-xs text-gray-500">
            Webhook URL:{" "}
            <code className="font-mono break-all">{status?.webhookUrl}</code>
          </p>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save System User token"}
          </button>
        </div>
      )}
    </div>
  );
}
