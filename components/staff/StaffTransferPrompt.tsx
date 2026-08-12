"use client";

import { useCallback, useEffect, useState } from "react";
import type { GroomerId } from "@/lib/scheduling/types";
import type { StaffTransfer } from "@/lib/staff/types";

export default function StaffTransferPrompt({
  groomerId,
}: {
  groomerId: GroomerId;
}) {
  const [queue, setQueue] = useState<StaffTransfer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadPending = useCallback(() => {
    return fetch("/api/staff/transfers/pending")
      .then((r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then((data) => setQueue(data.transfers ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadPending();
    const interval = window.setInterval(() => {
      void loadPending();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [loadPending]);

  const current = queue[0];

  async function respond(accept: boolean) {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/staff/transfers/${current.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not respond");
      setQueue((prev) => prev.filter((t) => t.id !== current.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not respond");
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;

  const label = current.type === "lead" ? "lead" : "appointment";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-6 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-prompt-title"
      >
        <h2 id="transfer-prompt-title" className="text-lg font-bold text-gray-900">
          {current.fromName} sent you a {label}
        </h2>
        <p className="text-sm text-gray-600">Do you accept?</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => respond(true)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark disabled:opacity-50"
          >
            Yes
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => respond(false)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}
