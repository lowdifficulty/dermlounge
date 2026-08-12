"use client";

import { useStaffDialer } from "@/lib/twilio/use-staff-dialer";

export default function StaffDialerPanel() {
  const {
    toPhone,
    setToPhone,
    staffPhone,
    setStaffPhone,
    configuredInSettings,
    busy,
    message,
    error,
    dial,
    staffCallbackHelp,
  } = useStaffDialer();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-brand">Dialer</h3>
        <p className="text-xs text-gray-600 mt-1">
          Call any number from the business line. Your cell rings first; when you answer,
          Twilio connects the customer.
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-gray-200 bg-section-gray text-gray-800 px-3 py-2 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Number to call
        </span>
        <input
          value={toPhone}
          onChange={(e) => setToPhone(e.target.value)}
          placeholder="9493863351 or +19493863351"
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </label>

      {!staffPhone.trim() && !configuredInSettings && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-xs">
          {staffCallbackHelp}
        </div>
      )}

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Your cell (click-to-call)
        </span>
        <input
          value={staffPhone}
          onChange={(e) => setStaffPhone(e.target.value)}
          placeholder="+19493863351 — not the business line"
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </label>

      <button
        type="button"
        onClick={() => void dial()}
        disabled={busy || !toPhone.trim()}
        className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white disabled:opacity-50"
      >
        {busy ? "Dialing…" : "Call number"}
      </button>
    </div>
  );
}
