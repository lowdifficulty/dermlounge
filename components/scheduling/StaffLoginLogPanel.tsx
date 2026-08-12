"use client";

import { useCallback, useEffect, useState } from "react";
import { GROOMERS } from "@/lib/scheduling/groomers";
import type { StaffLoginLogEntry } from "@/lib/staff/login-log";

function formatWhen(at: string): string {
  return new Date(at).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function roleLabel(entry: StaffLoginLogEntry): string {
  if (entry.role === "admin") return "Admin";
  if (entry.groomerId) return `Groomer · ${GROOMERS[entry.groomerId].name}`;
  return "Groomer";
}

function deviceSummary(entry: StaffLoginLogEntry): string {
  const parts: string[] = [];
  if (entry.clientHintsPlatform) {
    parts.push(entry.clientHintsPlatform.replace(/^"|"$/g, ""));
  }
  if (entry.clientHintsMobile === "?1") parts.push("Mobile");
  if (entry.userAgent) {
    const browser = entry.userAgent.split(")")[0]?.split("(").pop()?.trim();
    if (browser && !parts.includes(browser)) parts.push(browser);
  }
  return parts.length > 0 ? parts.join(" · ") : entry.userAgent ?? "Unknown device";
}

export default function StaffLoginLogPanel() {
  const [entries, setEntries] = useState<StaffLoginLogEntry[]>([]);
  const [persistenceMessage, setPersistenceMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/login-log");
    if (!res.ok) {
      setError("Could not load login history. Try signing in again.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setEntries(data.entries ?? []);
    setPersistenceMessage(data.persistence?.message ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading login history…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Successful staff sign-ins for admin and groomer accounts.
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="text-sm font-semibold text-brand hover:underline"
        >
          Refresh
        </button>
      </div>

      {persistenceMessage && (
        <p className="text-sm text-gray-600 bg-section-gray border border-gray-100 rounded-xl px-4 py-3">
          {persistenceMessage}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">
          No login events yet. Entries appear when admin or groomer staff sign in successfully.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="site-card p-4 border border-gray-100">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-brand text-sm">
                    {entry.name}
                    <span className="text-gray-500 font-normal"> · {roleLabel(entry)}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{formatWhen(entry.at)}</p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  Sign-in
                </span>
              </div>

              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-gray-500">Account</dt>
                  <dd className="text-gray-800">{entry.email}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Login as</dt>
                  <dd className="text-gray-800">{entry.loginIdentifier}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">IP address</dt>
                  <dd className="text-gray-800 font-mono text-xs">{entry.ip ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Location</dt>
                  <dd className="text-gray-800">
                    {entry.locationLabel ?? "Not available"}
                    {entry.latitude && entry.longitude && (
                      <span className="block text-xs text-gray-500 font-mono mt-0.5">
                        {entry.latitude}, {entry.longitude}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Device / browser</dt>
                  <dd className="text-gray-800 break-words">{deviceSummary(entry)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Language</dt>
                  <dd className="text-gray-800 break-words">
                    {entry.acceptLanguage ?? "Unknown"}
                  </dd>
                </div>
                {entry.referer && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Referrer</dt>
                    <dd className="text-gray-800 break-all text-xs">{entry.referer}</dd>
                  </div>
                )}
                {entry.host && (
                  <div>
                    <dt className="text-gray-500">Host</dt>
                    <dd className="text-gray-800">{entry.host}</dd>
                  </div>
                )}
                {entry.pathname && (
                  <div>
                    <dt className="text-gray-500">Login path</dt>
                    <dd className="text-gray-800 font-mono text-xs">{entry.pathname}</dd>
                  </div>
                )}
                {entry.ipChain.length > 1 && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">IP chain</dt>
                    <dd className="text-gray-800 font-mono text-xs break-all">
                      {entry.ipChain.join(" → ")}
                    </dd>
                  </div>
                )}
                {entry.userAgent && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">User agent</dt>
                    <dd className="text-gray-700 text-xs break-all">{entry.userAgent}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
