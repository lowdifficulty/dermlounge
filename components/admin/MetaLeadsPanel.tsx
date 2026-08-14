"use client";

import { useCallback, useEffect, useState } from "react";

type MetaStatus = {
  connected: boolean;
  webhookUrl: string;
  verifyToken: string;
  autoSmsEnabled: boolean;
  config: {
    pageId: string;
    pageAccessTokenMasked: string;
    hasPageAccessToken: boolean;
    hasAppSecret?: boolean;
    lastSyncAt?: string;
    lastSyncCount?: number;
  };
};

export default function MetaLeadsPanel() {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [pageId, setPageId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/meta");
      if (!res.ok) throw new Error("Could not load Meta settings");
      const data = (await res.json()) as MetaStatus;
      setStatus(data);
      setPageId(data.config.pageId || "");
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
          verifyToken,
          ...(pageAccessToken.trim() ? { pageAccessToken } : {}),
          ...(appSecret.trim() ? { appSecret } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setPageAccessToken("");
      setAppSecret("");
      setMessage("Meta Lead Ads settings saved. Auto SMS stays off.");
      await load();
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
      const errNote =
        data.errors?.length > 0 ? ` ${data.errors.length} error(s).` : "";
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

  if (loading && !status) {
    return <div className="p-6 text-sm text-gray-500">Loading Meta Lead Ads…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-brand">Meta Lead Ads</h2>
        <p className="text-sm text-gray-600 mt-1">
          Instant Form leads from Facebook / Instagram (Lead Center) land in CRM as{" "}
          <strong>Wound Care</strong> contacts. Automatic SMS is off until you turn it
          on later.
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

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              status?.connected
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            {status?.connected ? "Connected" : "Needs Page token"}
          </span>
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200">
            Auto SMS off
          </span>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            Facebook Page ID
          </span>
          <input
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            placeholder="e.g. 1234567890"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            Page access token
          </span>
          <input
            type="password"
            value={pageAccessToken}
            onChange={(e) => setPageAccessToken(e.target.value)}
            placeholder={
              status?.config.hasPageAccessToken
                ? `Saved ${status.config.pageAccessTokenMasked} — paste to replace`
                : "Paste a Page token with leads_retrieval"
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
          <p className="text-xs text-gray-500 mt-1">
            Paste this exact value into Meta → Webhooks → Verify token.
          </p>
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            App secret (optional, for webhook signatures)
          </span>
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder={
              status?.config.hasAppSecret ? "Saved — paste to replace" : "Optional"
            }
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
            autoComplete="off"
          />
        </label>

        <div className="rounded-lg bg-[#f8fafc] border border-gray-100 px-3 py-2 text-xs text-gray-600 space-y-1">
          <p>
            Callback URL:{" "}
            <code className="font-mono break-all">{status?.webhookUrl}</code>
          </p>
          <p>
            Subscribe the Page to the <code>leadgen</code> field. Token needs{" "}
            <code>leads_retrieval</code>, <code>pages_manage_metadata</code>, and{" "}
            <code>pages_show_list</code>.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Meta connection"}
          </button>
          <button
            type="button"
            onClick={() => void syncLeads()}
            disabled={syncing || !status?.connected}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 disabled:opacity-50"
          >
            {syncing ? "Pulling…" : "Pull existing Lead Center leads"}
          </button>
        </div>
        {status?.config.lastSyncAt && (
          <p className="text-xs text-gray-500">
            Last pull: {new Date(status.config.lastSyncAt).toLocaleString()} (
            {status.config.lastSyncCount ?? 0} lead
            {status.config.lastSyncCount === 1 ? "" : "s"})
          </p>
        )}
      </div>
    </div>
  );
}
