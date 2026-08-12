"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPhoneDisplay } from "@/lib/leads/normalize";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useStaffDialer } from "@/lib/twilio/use-staff-dialer";

type DialerContact = {
  id: string;
  phone: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
};

const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

function contactLabel(c: DialerContact): string {
  return (
    c.fullName?.trim() ||
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    formatPhoneDisplay(c.phone)
  );
}

function callPhaseLabel(phase: string): string {
  switch (phase) {
    case "connecting":
      return "Connecting…";
    case "ringing":
      return "Ringing…";
    case "open":
      return "On call";
    default:
      return "Calling…";
  }
}

export default function StaffDialerPopup({
  prefillPhone = "",
  onClose,
}: {
  prefillPhone?: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"keypad" | "contacts">("keypad");
  const [contactQ, setContactQ] = useState("");
  const [contacts, setContacts] = useState<DialerContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );

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
    callMode,
    setCallMode,
    staffCallbackHelp,
    browserReady,
    browserInitializing,
    browserError,
    inCall,
    callPhase,
    muted,
    hangUp,
    toggleMute,
  } = useStaffDialer();

  useEffect(() => {
    if (prefillPhone.trim()) {
      setToPhone(prefillPhone.replace(/\D/g, "").slice(-10));
      setTab("keypad");
    }
  }, [prefillPhone, setToPhone]);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const res = await fetch("/api/admin/crm/contacts");
      if (!res.ok) throw new Error("Could not load contacts");
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } catch {
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "contacts" && contacts.length === 0 && !contactsLoading) {
      void loadContacts();
    }
  }, [tab, contacts.length, contactsLoading, loadContacts]);

  const filteredContacts = useMemo(() => {
    const q = contactQ.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const hay = [contactLabel(c), c.phone, formatPhoneDisplay(c.phone)]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [contactQ, contacts]);

  function appendKey(key: string) {
    if (inCall) return;
    setToPhone((prev) => prev + key);
  }

  function backspace() {
    if (inCall) return;
    setToPhone((prev) => prev.slice(0, -1));
  }

  function selectContact(c: DialerContact) {
    setToPhone(c.phone);
    setTab("keypad");
    void dial(c.phone, { contactId: c.id });
  }

  function onDragStart(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, input, select, textarea")) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }

  function onDragEnd() {
    dragRef.current = null;
  }

  const showCellBridgeFields =
    callMode === "bridge" || (!browserReady && !browserInitializing);

  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  return (
    <div
      className={`fixed z-[100] shadow-2xl overflow-hidden border border-accent/30 bg-[#111827] text-white ${
        isLargeScreen
          ? "w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl"
          : "inset-x-0 bottom-0 rounded-t-2xl max-h-[85dvh] flex flex-col"
      }`}
      style={
        isLargeScreen
          ? { right: `calc(1.5rem - ${pos.x}px)`, bottom: `calc(1.5rem - ${pos.y}px)` }
          : undefined
      }
    >
      <div
        className={`flex items-center justify-between px-4 py-3 bg-gradient-to-r from-accent to-accent-hot select-none ${
          isLargeScreen ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        onPointerDown={isLargeScreen ? onDragStart : undefined}
        onPointerMove={isLargeScreen ? onDragMove : undefined}
        onPointerUp={isLargeScreen ? onDragEnd : undefined}
        onPointerCancel={isLargeScreen ? onDragEnd : undefined}
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <span className="font-semibold text-sm">Dialer</span>
          {browserReady && (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-white/20 px-1.5 py-0.5 rounded">
              Browser
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/20"
          aria-label="Close dialer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex border-b border-white/10">
        {(["keypad", "contacts"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            disabled={inCall}
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-50 ${
              tab === t ? "text-white border-b-2 border-white" : "text-white/50"
            }`}
          >
            {t === "keypad" ? "Keypad" : "Contacts"}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto max-h-[min(420px,60dvh)] lg:max-h-[420px]">
        {(message || error || browserError) && (
          <div
            className={`rounded-lg px-3 py-2 text-xs ${
              error || browserError
                ? "border border-red-400/40 bg-red-950/50 text-red-200"
                : "border border-white/20 bg-white/5 text-white/80"
            }`}
          >
            {error || browserError || message}
          </div>
        )}

        {inCall && (
          <div className="rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-center space-y-3">
            <div className="text-sm font-semibold text-white/90">{callPhaseLabel(callPhase)}</div>
            <div className="text-lg font-mono">{formatPhoneDisplay(toPhone || prefillPhone)}</div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={toggleMute}
                className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                  muted ? "bg-amber-500 text-white" : "bg-white/10 hover:bg-white/20"
                }`}
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={hangUp}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-400 text-white"
              >
                Hang up
              </button>
            </div>
          </div>
        )}

        {tab === "keypad" && !inCall && (
          <>
            <div className="bg-black/30 rounded-xl px-3 py-3 min-h-[48px] flex items-center justify-between gap-2">
              <span className="text-lg font-mono tracking-wider truncate">
                {toPhone ? formatPhoneDisplay(toPhone) : "Enter number"}
              </span>
              {toPhone && (
                <button
                  type="button"
                  onClick={backspace}
                  className="text-white/60 hover:text-white shrink-0"
                  aria-label="Backspace"
                >
                  ⌫
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {KEYPAD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => appendKey(key)}
                  className="h-12 rounded-xl bg-white/10 hover:bg-white/20 text-lg font-semibold"
                >
                  {key}
                </button>
              ))}
            </div>

            <div className="flex rounded-lg overflow-hidden border border-white/10 text-[11px]">
              <button
                type="button"
                onClick={() => setCallMode("browser")}
                disabled={!browserReady && !browserInitializing}
                className={`flex-1 py-2 font-semibold ${
                  callMode === "browser" ? "bg-accent text-white" : "bg-black/20 text-white/60"
                }`}
              >
                Browser
              </button>
              <button
                type="button"
                onClick={() => setCallMode("bridge")}
                className={`flex-1 py-2 font-semibold ${
                  callMode === "bridge" ? "bg-accent text-white" : "bg-black/20 text-white/60"
                }`}
              >
                Cell bridge
              </button>
            </div>

            {browserInitializing && (
              <p className="text-[11px] text-white/50">Connecting browser phone…</p>
            )}

            {showCellBridgeFields && !staffPhone.trim() && !configuredInSettings && (
              <p className="text-[11px] text-amber-300/90">{staffCallbackHelp}</p>
            )}

            {showCellBridgeFields && (
              <input
                value={staffPhone}
                onChange={(e) => setStaffPhone(e.target.value)}
                placeholder="Your cell (click-to-call bridge)"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/40"
              />
            )}

            <button
              type="button"
              onClick={() => void dial()}
              disabled={busy || !toPhone.trim()}
              className="w-full py-3 rounded-xl font-semibold bg-accent hover:bg-accent-hot text-white disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" />
              </svg>
              {busy ? "Dialing…" : callMode === "browser" && browserReady ? "Call (browser)" : "Call"}
            </button>
          </>
        )}

        {tab === "contacts" && !inCall && (
          <>
            <input
              value={contactQ}
              onChange={(e) => setContactQ(e.target.value)}
              placeholder="Search contacts…"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/40"
            />
            {contactsLoading && (
              <p className="text-sm text-white/50 text-center py-4">Loading contacts…</p>
            )}
            {!contactsLoading && filteredContacts.length === 0 && (
              <p className="text-sm text-white/50 text-center py-4">No contacts found.</p>
            )}
            <div className="space-y-1">
              {filteredContacts.slice(0, 80).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectContact(c)}
                  disabled={busy}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 disabled:opacity-50"
                >
                  <div className="text-sm font-medium truncate">{contactLabel(c)}</div>
                  <div className="text-xs text-white/50">{formatPhoneDisplay(c.phone)}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

