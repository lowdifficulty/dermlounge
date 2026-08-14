"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPhoneDisplay } from "@/lib/leads/normalize";
import type { CrmContactListItem, CrmContactStatus } from "@/lib/crm/types";
import {
  CRM_PIPELINE_STAGE_OPTIONS,
  CRM_PIPELINE_STAGES,
  crmContactStatusLabel,
  normalizeCrmContactStatus,
} from "@/lib/crm/pipeline";
import { getMedicalService, medicalServiceTabLabel } from "@/lib/medical-services";

const COLUMN_ACCENT: Record<CrmContactStatus, string> = {
  lead: "border-t-gray-400",
  contact: "border-t-gray-600",
  appointment: "border-t-brand",
  patient: "border-t-accent",
  follow_up: "border-t-amber-500",
  cold: "border-t-gray-300",
};

function displayName(contact: CrmContactListItem): string {
  return (
    contact.fullName?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    formatPhoneDisplay(contact.phone)
  );
}

function serviceLabel(contact: CrmContactListItem): string {
  return medicalServiceTabLabel(getMedicalService(contact.primaryMedicalService));
}

export default function OpportunitiesPanel({
  onOpenConversation,
}: {
  onOpenConversation?: (contactId: string) => void;
}) {
  const [contacts, setContacts] = useState<CrmContactListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<CrmContactStatus | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/contacts?sort=lastInteraction&order=desc");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load pipeline");
      setContacts(data.contacts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((contact) => {
      const hay = [
        contact.fullName,
        contact.firstName,
        contact.lastName,
        contact.phone,
        contact.email,
        contact.service,
        contact.city,
        serviceLabel(contact),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [contacts, q]);

  const byStage = useMemo(() => {
    const grouped = Object.fromEntries(
      CRM_PIPELINE_STAGES.map((stage) => [stage, [] as CrmContactListItem[]])
    ) as Record<CrmContactStatus, CrmContactListItem[]>;
    for (const contact of filtered) {
      grouped[normalizeCrmContactStatus(contact.status)].push(contact);
    }
    return grouped;
  }, [filtered]);

  async function moveToStage(contactId: string, status: CrmContactStatus) {
    const current = contacts.find((c) => c.id === contactId);
    if (!current || normalizeCrmContactStatus(current.status) === status) return;
    const previous = contacts;
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, status } : c))
    );
    setBusyId(contactId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/crm/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not move contact");
    } catch (e) {
      setContacts(previous);
      setError(e instanceof Error ? e.message : "Could not move contact");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-brand">Opportunities</h2>
          <p className="text-sm text-gray-600 mt-1">
            Drag a card between columns, or pick a stage on the card.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search pipeline…"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm min-w-[220px] max-w-md"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-[1100px] items-start">
          {CRM_PIPELINE_STAGES.map((stage) => {
            const cards = byStage[stage];
            const isDropTarget = dropStage === stage;
            return (
              <section
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropStage(stage);
                }}
                onDragLeave={() => {
                  setDropStage((current) => (current === stage ? null : current));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setDropStage(null);
                  setDraggingId(null);
                  if (id) void moveToStage(id, stage);
                }}
                className={`flex-1 min-w-[170px] rounded-xl border bg-gray-50 ${
                  isDropTarget ? "border-accent ring-1 ring-accent/30" : "border-gray-200"
                }`}
              >
                <header
                  className={`px-3 py-2.5 border-b border-gray-200 border-t-4 rounded-t-xl bg-white ${COLUMN_ACCENT[stage]}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-brand">
                      {crmContactStatusLabel(stage)}
                    </h3>
                    <span className="text-xs font-bold text-gray-500 tabular-nums">
                      {loading ? "…" : cards.length}
                    </span>
                  </div>
                </header>
                <div className="p-2 space-y-2 min-h-[280px] max-h-[calc(100vh-220px)] overflow-y-auto">
                  {loading && (
                    <div className="text-xs text-gray-500 px-2 py-6 text-center">
                      Loading…
                    </div>
                  )}
                  {!loading && cards.length === 0 && (
                    <div className="text-xs text-gray-400 px-2 py-6 text-center">
                      No one in this stage
                    </div>
                  )}
                  {cards.map((contact) => (
                    <article
                      key={contact.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", contact.id);
                        setDraggingId(contact.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDropStage(null);
                      }}
                      className={`rounded-lg border bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing ${
                        draggingId === contact.id
                          ? "opacity-50 border-accent"
                          : "border-gray-200"
                      } ${busyId === contact.id ? "opacity-70" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenConversation?.(contact.id)}
                        className="block w-full text-left"
                      >
                        <div className="font-semibold text-sm text-gray-900 truncate">
                          {displayName(contact)}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          {formatPhoneDisplay(contact.phone)}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1 truncate">
                          {serviceLabel(contact)}
                          {contact.hasUpcomingAppointment ? " · Upcoming appt" : ""}
                        </div>
                      </button>
                      <label className="sr-only" htmlFor={`stage-${contact.id}`}>
                        Pipeline stage
                      </label>
                      <select
                        id={`stage-${contact.id}`}
                        value={normalizeCrmContactStatus(contact.status)}
                        disabled={busyId === contact.id}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          void moveToStage(contact.id, e.target.value as CrmContactStatus)
                        }
                        className="mt-2 w-full border border-gray-200 rounded-md px-2 py-1 text-[11px] bg-white"
                      >
                        {CRM_PIPELINE_STAGE_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
