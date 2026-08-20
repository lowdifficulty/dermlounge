"use client";

import { useCallback, useEffect, useState } from "react";

type MetaDmStatus = {
  connected: boolean;
  dmWebhookUrl?: string;
  verifyToken?: string;
  messagingSubscription?: { subscribed: boolean; fields: string[]; error?: string };
  config?: { backfilledAt?: string };
};

export default function MetaDmPanel() {
  const [status, setStatus] = useState<MetaDmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/meta");
      if (!res.ok) throw new Error("Could not load Meta settings");
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-dm" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Test failed");
      setTestResult(`Connected to page: ${data.pageName || data.pageId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function runBackfill() {
    setBackfilling(true);
    setBackfillResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backfill-dm", days: 7 }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Backfill failed");
      setBackfillResult(
        `Imported ${data.messagesImported} messages from ${data.conversationsScanned} conversations (${data.contactsCreated} new contacts, ${data.contactsLinked} linked). Skipped ${data.messagesSkipped}.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  }

  async function subscribeMessaging() {
    setSubscribing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subscribe-messaging" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Subscribe failed");
      setMessage("Page subscribed to messages webhook field");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Subscribe failed");
    } finally {
      setSubscribing(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500 p-6">Loading Meta DMs…</div>;
  }

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-brand">Meta Messenger & Instagram DMs</h2>
        <p className="text-sm text-gray-600 mt-1">
          Sync Facebook and Instagram DMs into Conversations. Use <strong>Connect Meta</strong> above
          first, then register the DM webhook in Meta Developer Console.
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

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3 text-sm">
          <span
            className={`px-2 py-1 rounded-full text-xs font-semibold ${
              status?.connected ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {status?.connected ? "Page token valid" : "Reconnect Meta required"}
          </span>
          {status?.messagingSubscription?.subscribed && (
            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
              messages subscribed
            </span>
          )}
        </div>

        {status?.dmWebhookUrl && (
          <div className="text-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">
              DM webhook callback URL
            </div>
            <code className="block bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs break-all">
              {status.dmWebhookUrl}
            </code>
            <p className="text-xs text-gray-500 mt-1">
              Verify token: <code>{status.verifyToken}</code> — subscribe to{" "}
              <strong>messages</strong> and <strong>messaging_postbacks</strong>.
            </p>
          </div>
        )}

        {status?.config?.backfilledAt && (
          <p className="text-xs text-gray-500">
            Last DM backfill: {new Date(status.config.backfilledAt).toLocaleString()}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={testing || !status?.connected}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test messaging API"}
          </button>
          <button
            type="button"
            onClick={() => void subscribeMessaging()}
            disabled={subscribing || !status?.connected}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 disabled:opacity-50"
          >
            {subscribing ? "Subscribing…" : "Subscribe Page to messages"}
          </button>
          <button
            type="button"
            onClick={() => void runBackfill()}
            disabled={backfilling || !status?.connected}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white disabled:opacity-50"
          >
            {backfilling ? "Importing…" : "Backfill last 7 days"}
          </button>
        </div>

        {testResult && <p className="text-sm text-green-800">{testResult}</p>}
        {backfillResult && <p className="text-sm text-green-800">{backfillResult}</p>}
      </div>
    </div>
  );
}
