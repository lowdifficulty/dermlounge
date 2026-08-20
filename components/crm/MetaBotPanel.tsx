"use client";

import { useCallback, useEffect, useState } from "react";

type BotConfig = {
  mode: "test" | "live";
  enabled: boolean;
  useAiPolish: boolean;
  systemPrompt: string;
  customLogic: string;
  testPsids: string[];
  updatedAt?: string;
};

export default function MetaBotPanel() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testPsidsText, setTestPsidsText] = useState("");
  const [simMessage, setSimMessage] = useState("How do I book a wound care consultation?");
  const [simResult, setSimResult] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/meta-bot");
      if (!res.ok) throw new Error("Could not load Meta bot settings");
      const data = await res.json();
      setConfig(data.config);
      setTestPsidsText((data.config.testPsids || []).join("\n"));
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
    if (!config) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/meta-bot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          testPsids: testPsidsText
            .split(/[\n,]+/)
            .map((p) => p.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setConfig(data.config);
      setTestPsidsText((data.config.testPsids || []).join("\n"));
      setMessage("Meta bot logic saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function simulate() {
    setSimResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/meta-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          message: simMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Simulate failed");
      setSimResult(
        `[${data.mode}${data.draftOnly ? " · draft/test" : ""}]\n${data.body}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulate failed");
    }
  }

  if (loading || !config) {
    return <div className="text-sm text-gray-500 p-6">Loading Meta bot…</div>;
  }

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-brand">My Derm Lounge Meta DM Bot</h2>
        <p className="text-sm text-gray-600 mt-1">
          Auto-replies to Facebook Messenger and Instagram DMs. Keep in <strong>test mode</strong>{" "}
          until replies look right — only allowlisted PSIDs get live replies in test mode.
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
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            />
            Meta bot enabled
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={config.useAiPolish}
              onChange={(e) => setConfig({ ...config, useAiPolish: e.target.checked })}
            />
            Use AI polish (OpenAI)
          </label>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
            Environment
          </div>
          <div className="flex gap-2">
            {(["test", "live"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setConfig({ ...config, mode })}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                  config.mode === mode
                    ? mode === "live"
                      ? "bg-accent text-white border-accent"
                      : "bg-brand text-white border-brand"
                    : "bg-white text-brand border-gray-200"
                }`}
              >
                {mode === "test" ? "Test mode" : "Live mode"}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            Test PSID allowlist (one per line)
          </span>
          <textarea
            value={testPsidsText}
            onChange={(e) => setTestPsidsText(e.target.value)}
            rows={3}
            placeholder="1234567890123456"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            System prompt
          </span>
          <textarea
            value={config.systemPrompt}
            onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
            rows={5}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            Custom logic / instructions
          </span>
          <textarea
            value={config.customLogic}
            onChange={(e) => setConfig({ ...config, customLogic: e.target.value })}
            rows={8}
            placeholder={`Examples:\n- Never give medical advice; offer a consult or phone call.\n- Wound care booking: mydermlounge.com/woundcare/\n- Keep replies under 3 sentences.`}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </label>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save bot logic"}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="text-sm font-bold text-brand">Simulator (no DM sent)</div>
        <input
          value={simMessage}
          onChange={(e) => setSimMessage(e.target.value)}
          placeholder="Inbound message"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void simulate()}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200"
        >
          Generate reply
        </button>
        {simResult && (
          <pre className="whitespace-pre-wrap text-sm bg-[#f8fafc] border border-gray-100 rounded-lg p-3">
            {simResult}
          </pre>
        )}
      </div>
    </div>
  );
}
