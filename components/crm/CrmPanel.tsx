"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPhoneDisplay } from "@/lib/leads/normalize";
import type { CrmConversationView } from "@/lib/crm/types";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import {
  crmConversationTabs,
  getMedicalService,
  medicalServiceTabLabel,
  type MedicalServiceId,
} from "@/lib/medical-services";
import {
  medicalServiceConversationAvatarClass,
  medicalServiceConversationRowClass,
  medicalServiceTabActiveClass,
  medicalServiceTabDotClass,
} from "@/lib/crm/medical-service-crm-colors";
import { useStaffCallbackPhone } from "@/lib/twilio/use-staff-callback-phone";
import { useStaffDialerPanel } from "@/lib/twilio/staff-dialer-context";
import CreateContactForm from "@/components/crm/CreateContactForm";

type Platform = {
  configured: boolean;
  hasFromNumber: boolean;
  hasVoice: boolean;
  mode: string;
  smsBotEnabled: boolean;
  smsBotMode?: string;
  crmStorage?: "redis" | "file" | "ephemeral";
};

type CrmContact = {
  id: string;
  phone: string;
  phoneE164: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  pets: { petName: string; petSize?: string; petBreed?: string }[];
  service?: string;
  smsOptIn?: boolean;
  status: "lead" | "customer" | "inactive";
  tags: string[];
  source: string;
  unreadCount: number;
  botEnabled: boolean;
  lastInteractionAt?: string;
  updatedAt: string;
  medicalService?: string;
  primaryMedicalService?: MedicalServiceId;
};

type CrmInteraction = {
  id: string;
  channel: "sms" | "call" | "note" | "email" | "system";
  direction: "inbound" | "outbound" | "internal";
  body?: string;
  summary?: string;
  messageStatus?: string;
  callStatus?: string;
  recordingSid?: string;
  recordingUrl?: string;
  recordingChannels?: string;
  transcript?: string;
  transcriptionSid?: string;
  actor: string;
  staffName?: string;
  durationSeconds?: number;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type ContactDetail = CrmContact & {
  interactions: CrmInteraction[];
  upcomingAppointments: {
    id: string;
    startAt: string;
    status: string;
    service: string;
    petName: string;
    groomerId: string;
  }[];
  pastAppointments: {
    id: string;
    startAt: string;
    status: string;
    service: string;
    petName: string;
    groomerId: string;
  }[];
};

type Stats = {
  total: number;
  leads: number;
  customers: number;
  inactive: number;
  unread: number;
};

function formatWhen(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function initials(name?: string, phone?: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return (phone || "?").slice(-2);
}

const CRM_POLL_MS = 10_000;

const VIEW_TABS: { id: CrmConversationView; label: string; dotClass?: string }[] = [
  { id: "all", label: "All" },
  ...crmConversationTabs().map((service) => ({
    id: service.id as CrmConversationView,
    label: medicalServiceTabLabel(service),
    dotClass: medicalServiceTabDotClass(service.id),
  })),
];

function serviceLabelForContact(c: CrmContact): string {
  const id = c.primaryMedicalService ?? c.medicalService;
  return medicalServiceTabLabel(getMedicalService(id));
}

function paneClass(show: boolean) {
  return show ? "flex flex-col min-h-0 min-w-0" : "hidden lg:flex lg:flex-col lg:min-h-0 lg:min-w-0";
}

export default function CrmPanel() {
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const deepLinkContactId = useRef<string | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [selectedId, setSelectedId] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const open = sessionStorage.getItem("dl-crm-open-contact");
      if (open) {
        sessionStorage.removeItem("dl-crm-open-contact");
        deepLinkContactId.current = open;
        return open;
      }
    } catch {
      /* ignore */
    }
    return "";
  });
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<CrmConversationView>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const { staffPhone, setStaffPhone } = useStaffCallbackPhone();
  const { openDialer } = useStaffDialerPanel();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (deepLinkContactId.current && selectedId === deepLinkContactId.current && !isLargeScreen) {
      setMobileThreadOpen(true);
      deepLinkContactId.current = null;
    }
  }, [isLargeScreen, selectedId]);

  function openConversation(id: string) {
    setSelectedId(id);
    if (!isLargeScreen) {
      setMobileThreadOpen(true);
      setMobileDetailsOpen(false);
    }
  }

  async function handleContactCreated(
    contact: { id: string; phone?: string; fullName?: string },
    created: boolean
  ) {
    setView("all");
    setUnreadOnly(false);
    setQ("");
    setBanner(
      created
        ? "Contact created — send a text below"
        : "Contact already exists — send a text below"
    );
    setError(null);
    setContacts((prev) => {
      if (prev.some((c) => c.id === contact.id)) return prev;
      return [
        {
          id: contact.id,
          phone: contact.phone || "",
          phoneE164: "",
          pets: [],
          status: "lead",
          tags: [],
          source: "manual",
          unreadCount: 0,
          botEnabled: true,
          updatedAt: new Date().toISOString(),
          fullName: contact.fullName,
        },
        ...prev,
      ];
    });
    openConversation(contact.id);
    await loadDetail(contact.id);
  }

  function backToConversationList() {
    setMobileThreadOpen(false);
    setMobileDetailsOpen(false);
  }

  const loadContacts = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (view !== "all") params.set("view", view);
      if (unreadOnly) params.set("unread", "1");
      const res = await fetch(`/api/admin/crm/contacts?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load CRM contacts");
      const data = await res.json();
      setContacts(data.contacts ?? []);
      setStats(data.stats ?? null);
      setPlatform(data.platform ?? null);
      if (!selectedId && data.contacts?.[0]?.id && isLargeScreen) {
        setSelectedId(data.contacts[0].id);
      }
      setListReady(true);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [q, view, unreadOnly, selectedId, isLargeScreen]);

  const loadDetail = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      const res = await fetch(`/api/admin/crm/contacts/${id}`);
      if (!res.ok) throw new Error("Could not load contact");
      const data = await res.json();
      setDetail(data.contact as ContactDetail);
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Detail load failed");
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (!listReady) return;
    if (contacts.length === 0) {
      setSelectedId("");
      return;
    }
    if (!contacts.some((c) => c.id === selectedId)) {
      if (isLargeScreen && contacts[0]) setSelectedId(contacts[0].id);
      else {
        setSelectedId("");
        setMobileThreadOpen(false);
      }
    }
  }, [contacts, listReady, selectedId, isLargeScreen]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  /** Background refresh for inbound SMS — silent, every 10s while tab is visible. */
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadContacts({ silent: true });
      if (selectedId) void loadDetail(selectedId, { silent: true });
    };
    const id = window.setInterval(tick, CRM_POLL_MS);
    return () => window.clearInterval(id);
  }, [selectedId, loadDetail, loadContacts]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [detail?.interactions?.length, selectedId]);

  const selected = useMemo(
    () => contacts.find((c) => c.id === selectedId) || detail,
    [contacts, selectedId, detail]
  );

  const smsThread = useMemo(() => {
    return (detail?.interactions || []).filter(
      (ix) =>
        ix.channel === "sms" ||
        ix.channel === "call" ||
        ix.channel === "note" ||
        (ix.channel === "system" && ix.body)
    );
  }, [detail]);

  async function refreshFromSources() {
    setBusy("refresh");
    setBanner(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      setBanner(`Synced ${data.contactCount} contacts`);
      setSelectedId("");
      setMobileThreadOpen(false);
      await loadContacts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setBusy(null);
    }
  }

  async function sendSms(template?: "lead_follow_up" | "appointment_follow_up") {
    if (!selectedId) return;
    setBusy("sms");
    setError(null);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/crm/contacts/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template ? { template } : { body: message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SMS failed");
      setMessage("");
      setBanner("SMS sent");
      await loadDetail(selectedId);
      await loadContacts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "SMS failed");
    } finally {
      setBusy(null);
    }
  }

  function openCallDialer() {
    if (!selected) return;
    openDialer(selected.phone);
  }

  async function saveNote() {
    if (!selectedId || !note.trim()) return;
    setBusy("note");
    try {
      const res = await fetch(`/api/admin/crm/contacts/${selectedId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Note failed");
      setNote("");
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Note failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleBot(enabled: boolean) {
    if (!selectedId) return;
    setBusy("bot");
    try {
      const res = await fetch(`/api/admin/crm/contacts/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botEnabled: enabled }),
      });
      if (!res.ok) throw new Error("Could not update bot setting");
      await loadDetail(selectedId);
      await loadContacts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bot update failed");
    } finally {
      setBusy(null);
    }
  }

  const showListPane = isLargeScreen || !mobileThreadOpen;
  const showThreadPane = isLargeScreen || mobileThreadOpen;

  return (
    <div className="h-[calc(100dvh-3.5rem)] flex flex-col min-h-0">
      {(banner || error || platform) && (
        <div className="px-4 py-2 border-b border-gray-200 bg-white flex flex-wrap gap-3 items-center text-xs">
          {platform && (
            <span className="text-gray-500">
              Twilio {platform.configured ? "ready" : "needs setup"} · SMS bot{" "}
              {platform.smsBotEnabled ? `on (${platform.smsBotMode || "test"})` : "off"}
              {platform.crmStorage === "file" ? " · CRM: local file (inbound SMS only on production Redis)" : platform.crmStorage === "redis" ? " · CRM: live" : null}
            </span>
          )}
          {platform?.crmStorage === "file" && (
            <span className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              Inbound texts are stored on production only. Paste KV credentials into{" "}
              <code className="text-[11px]">.env.local</code> from the Vercel dashboard (env pull
              omits secrets), restart localhost, or use{" "}
              <a href="https://mydermlounge.com/admin" className="underline font-semibold">
                live admin
              </a>
              .
            </span>
          )}
          {stats && (
            <span className="text-gray-500">
              {stats.total} contacts · {stats.unread} unread
            </span>
          )}
          <button
            type="button"
            onClick={() => void refreshFromSources()}
            disabled={busy === "refresh"}
            className="ml-auto font-semibold text-brand hover:underline disabled:opacity-50"
          >
            Sync customers
          </button>
          {banner && <span className="text-gray-700 font-medium">{banner}</span>}
          {error && <span className="text-red-700 font-medium">{error}</span>}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_300px] overflow-hidden">
        {/* Conversations list */}
        <section className={`${paneClass(showListPane)} border-r border-gray-200 bg-white`}>
          <div className="p-3 border-b border-gray-100 space-y-2">
            <CreateContactForm
              compact
              onCreated={(contact, created) => void handleContactCreated(contact, created)}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-lg border border-gray-200 bg-[#f8fafc] px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {VIEW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                    view === tab.id
                      ? tab.id === "all"
                        ? "bg-accent text-white"
                        : medicalServiceTabActiveClass(tab.id as MedicalServiceId)
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {tab.dotClass && (
                    <span className={`h-2 w-2 rounded-full ${tab.dotClass}`} aria-hidden />
                  )}
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUnreadOnly((v) => !v)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                  unreadOnly ? "bg-accent text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                Unread
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {listReady && contacts.length === 0 && (
              <div className="p-4 text-sm text-gray-500">No conversations</div>
            )}
            {contacts.map((c) => {
              const active = c.id === selectedId;
              const serviceId = (c.primaryMedicalService ?? c.medicalService) as
                | MedicalServiceId
                | undefined;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-50 flex gap-3 ${medicalServiceConversationRowClass(
                    serviceId,
                    active
                  )}`}
                >
                  <div
                    className={`h-10 w-10 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${medicalServiceConversationAvatarClass(
                      serviceId
                    )}`}
                  >
                    {initials(c.fullName, c.phone)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm text-gray-900 truncate">
                        {c.fullName || formatPhoneDisplay(c.phone)}
                      </div>
                      <div className="text-[10px] text-gray-400 shrink-0">
                        {formatWhen(c.lastInteractionAt || c.updatedAt)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {formatPhoneDisplay(c.phone)}
                      {c.service ? ` · ${c.service}` : ""}
                      {serviceId ? ` · ${serviceLabelForContact(c)}` : ""}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400">
                        {c.status}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="text-[10px] font-bold bg-accent text-white rounded-full px-1.5">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Thread */}
        <section className={`${paneClass(showThreadPane)} bg-[#f5f7fb] border-r border-gray-200`}>
          {!selected && (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 px-4 text-center">
              Select a conversation, or create a contact to send the first text.
            </div>
          )}
          {selected && (
            <>
              <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={backToConversationList}
                    className="lg:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    aria-label="Back to conversations"
                  >
                    ←
                  </button>
                  <div className="min-w-0">
                    <div className="font-bold text-brand truncate">
                      {detail?.fullName || selected.fullName || formatPhoneDisplay(selected.phone)}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {formatPhoneDisplay(selected.phone)}
                      {selected.email ? ` · ${selected.email}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMobileDetailsOpen(true)}
                    className="lg:hidden px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700"
                  >
                    Info
                  </button>
                  <button
                    type="button"
                    onClick={openCallDialer}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white"
                  >
                    Call
                  </button>
                </div>
              </div>

              <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {smsThread.map((ix) => {
                  const mine = ix.direction === "outbound" || ix.direction === "internal";
                  const suppressed = Boolean(ix.metadata?.suppressed);
                  const isCall = ix.channel === "call";
                  const callSummary =
                    ix.summary ||
                    (ix.callStatus ? `Call ${ix.callStatus}` : "Call");
                  const callTranscript = ix.transcript || (isCall ? ix.body : undefined);
                  return (
                    <div
                      key={ix.id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                          ix.channel === "note"
                            ? "bg-amber-50 border border-amber-100 text-amber-950"
                            : isCall
                              ? "bg-white border border-gray-200 text-gray-800"
                              : mine
                                ? suppressed
                                  ? "bg-sky-100 text-sky-950 border border-sky-200"
                                  : "bg-brand text-white"
                                : "bg-white text-gray-800 border border-gray-100"
                        }`}
                      >
                        <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
                          {ix.channel === "note"
                            ? "Note"
                            : isCall
                              ? ix.direction === "inbound"
                                ? "Inbound call"
                                : "Outbound call"
                              : ix.actor === "bot"
                                ? suppressed
                                  ? "Bot draft (not sent)"
                                  : "Bot"
                                : ix.actor === "system" && ix.channel === "sms"
                                  ? "Confirmation"
                                  : mine
                                    ? "You"
                                    : "Customer"}
                          {" · "}
                          {formatWhen(ix.createdAt)}
                          {isCall && ix.durationSeconds
                            ? ` · ${ix.durationSeconds}s`
                            : ""}
                          {isCall && ix.recordingChannels === "dual" ? " · dual recording" : ""}
                        </div>
                        {isCall ? (
                          <div className="space-y-2">
                            <div>{callSummary}</div>
                            {ix.recordingSid && (
                              <audio
                                controls
                                preload="none"
                                className="w-full max-w-sm h-9"
                                src={`/api/admin/crm/recordings/${ix.recordingSid}`}
                              />
                            )}
                            {callTranscript && (
                              <div>
                                <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                                  Transcript
                                </div>
                                <div className="whitespace-pre-wrap text-sm bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100">
                                  {callTranscript}
                                </div>
                              </div>
                            )}
                            {!ix.recordingSid && !callTranscript && ix.callStatus === "completed" && (
                              <div className="text-xs text-gray-500">
                                Recording and transcript will appear when ready.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">{ix.body || ix.summary || "—"}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {detail && smsThread.length === 0 && (
                  <div className="text-center text-sm text-gray-400 py-10">
                    No messages yet — send the first SMS below.
                  </div>
                )}
              </div>

              <div className="bg-white border-t border-gray-200 p-3 space-y-2 shrink-0">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  placeholder="Write an SMS…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
                />
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void sendSms()}
                      disabled={busy === "sms" || !message.trim()}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand text-white disabled:opacity-50"
                    >
                      Send
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendSms("lead_follow_up")}
                      disabled={busy === "sms"}
                      className="px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200"
                    >
                      Lead follow-up
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendSms("appointment_follow_up")}
                      disabled={busy === "sms"}
                      className="px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200"
                    >
                      Rebook
                    </button>
                  </div>
                  <input
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                    placeholder="Your phone for click-to-call"
                    className="w-full sm:w-44 sm:ml-auto border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
            </>
          )}
        </section>

        {/* Contact details — desktop sidebar */}
        <section className="hidden lg:flex bg-white flex-col min-h-0 overflow-y-auto">
          {!selected && (
            <div className="p-6 text-sm text-gray-500">Contact details appear here.</div>
          )}
          {selected && (
            <ContactDetailsContent
              selected={selected}
              detail={detail}
              note={note}
              setNote={setNote}
              busy={busy}
              onSaveNote={() => void saveNote()}
              onToggleBot={(enabled) => void toggleBot(enabled)}
            />
          )}
        </section>
      </div>

      {mobileDetailsOpen && selected && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close contact details"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileDetailsOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold text-brand">Contact details</h3>
              <button
                type="button"
                onClick={() => setMobileDetailsOpen(false)}
                className="text-gray-500 hover:text-gray-800 px-2 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <ContactDetailsContent
              selected={selected}
              detail={detail}
              note={note}
              setNote={setNote}
              busy={busy}
              onSaveNote={() => void saveNote()}
              onToggleBot={(enabled) => void toggleBot(enabled)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ContactDetailsContent({
  selected,
  detail,
  note,
  setNote,
  busy,
  onSaveNote,
  onToggleBot,
}: {
  selected: CrmContact | ContactDetail;
  detail: ContactDetail | null;
  note: string;
  setNote: (value: string) => void;
  busy: string | null;
  onSaveNote: () => void;
  onToggleBot: (enabled: boolean) => void;
}) {
  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Contact</div>
        <div className="font-bold text-brand mt-1">
          {detail?.fullName || selected.fullName || formatPhoneDisplay(selected.phone)}
        </div>
        <div className="text-sm text-gray-600 mt-1">{formatPhoneDisplay(selected.phone)}</div>
        {(detail?.email || selected.email) && (
          <div className="text-sm text-gray-600">{detail?.email || selected.email}</div>
        )}
        <div className="text-sm text-gray-500 mt-1">
          Service:{" "}
          {serviceLabelForContact(
            (detail ?? selected) as CrmContact
          )}
        </div>
        {(detail?.address || selected.address) && (
          <div className="text-sm text-gray-500 mt-1">
            {[detail?.address || selected.address, detail?.city || selected.city, detail?.zipCode || selected.zipCode]
              .filter(Boolean)
              .join(", ")}
          </div>
        )}
      </div>

      <div>
        {(detail?.pets || selected.pets).length === 0 && (
          <div className="text-sm text-gray-400">No pets on file</div>
        )}
        {(detail?.pets || selected.pets).map((p, i) => (
          <div key={`${p.petName}-${i}`} className="text-sm text-gray-700">
            {p.petName || "Pet"} {p.petSize ? `· ${p.petSize}` : ""}
          </div>
        ))}
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-1">Upcoming</div>
        {(detail?.upcomingAppointments || []).slice(0, 3).map((a) => (
          <div key={a.id} className="text-sm border border-gray-100 rounded-lg px-2 py-1.5 mb-1">
            {formatWhen(a.startAt)} · {a.petName || "Pet"} · {a.service}
          </div>
        ))}
        {detail && detail.upcomingAppointments.length === 0 && (
          <div className="text-sm text-gray-400">None</div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={detail?.botEnabled ?? selected.botEnabled}
          onChange={(e) => onToggleBot(e.target.checked)}
          disabled={busy === "bot"}
        />
        SMS bot for this contact
      </label>

      <div className="flex flex-wrap gap-1">
        {(detail?.tags || selected.tags).map((tag) => (
          <span
            key={tag}
            className="text-[10px] uppercase font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
          >
            {tag}
          </span>
        ))}
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-1">Add note</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          placeholder="Internal note…"
        />
        <button
          type="button"
          onClick={onSaveNote}
          disabled={busy === "note" || !note.trim()}
          className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 disabled:opacity-50"
        >
          Save note
        </button>
      </div>
    </div>
  );
}
