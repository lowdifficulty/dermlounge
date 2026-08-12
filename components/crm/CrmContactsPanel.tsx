"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPhoneDisplay } from "@/lib/leads/normalize";
import type { CrmContactListItem, CrmContactSortField } from "@/lib/crm/types";
import { getMedicalService, medicalServiceTabLabel } from "@/lib/medical-services";

type CrmContact = CrmContactListItem;

type Stats = {
  total: number;
  leads: number;
  customers: number;
  inactive: number;
  unread: number;
};

type Column = {
  id: CrmContactSortField;
  label: string;
  className?: string;
};

const COLUMNS: Column[] = [
  { id: "name", label: "Name", className: "min-w-[140px]" },
  { id: "phone", label: "Phone", className: "min-w-[120px]" },
  { id: "email", label: "Email", className: "min-w-[160px]" },
  { id: "street", label: "Street", className: "min-w-[180px]" },
  { id: "city", label: "City", className: "min-w-[120px]" },
  { id: "zipCode", label: "Zip", className: "min-w-[72px]" },
  { id: "zone", label: "Zone", className: "min-w-[88px]" },
  { id: "areaCode", label: "Area", className: "min-w-[64px]" },
  { id: "status", label: "Status", className: "min-w-[88px]" },
  { id: "booked", label: "Booked", className: "min-w-[88px]" },
  { id: "lastAppointment", label: "Last appt", className: "min-w-[100px]" },
  { id: "lastInteraction", label: "Last activity", className: "min-w-[100px]" },
  { id: "pets", label: "Pets", className: "min-w-[120px]" },
  { id: "medicalService", label: "Service", className: "min-w-[120px]" },
];

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      year: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function zoneLabel(zone: 1 | 2 | null): string {
  if (zone === 1) return "OC";
  if (zone === 2) return "LA";
  return "—";
}

function displayName(c: CrmContact): string {
  return (
    c.fullName?.trim() ||
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    formatPhoneDisplay(c.phone)
  );
}

function petsLabel(c: CrmContact): string {
  if (!c.pets.length) return "—";
  return c.pets
    .map((p) => [p.petName, p.petSize].filter(Boolean).join(" · "))
    .join("; ");
}

function SortIndicator({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <span className="text-gray-300 ml-1">↕</span>;
  return <span className="ml-1">{order === "asc" ? "↑" : "↓"}</span>;
}

export default function CrmContactsPanel({
  onOpenConversation,
}: {
  onOpenConversation?: (contactId: string) => void;
}) {
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "lead" | "customer" | "inactive">("all");
  const [sort, setSort] = useState<CrmContactSortField>("lastInteraction");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status !== "all") params.set("status", status);
      params.set("sort", sort);
      params.set("order", sortOrder);
      const res = await fetch(`/api/admin/crm/contacts?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load contacts");
      const data = await res.json();
      setContacts(data.contacts ?? []);
      setStats(data.stats ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [q, status, sort, sortOrder]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  function toggleSort(field: CrmContactSortField) {
    if (sort === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setSortOrder(field === "name" || field === "city" || field === "street" ? "asc" : "desc");
    }
  }

  async function syncCustomers() {
    setBusy(true);
    setBanner(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setBanner(`Synced ${data.contactCount} contacts`);
      await loadContacts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  function cellValue(c: CrmContact, column: CrmContactSortField): string {
    switch (column) {
      case "name":
        return displayName(c);
      case "phone":
        return formatPhoneDisplay(c.phone);
      case "email":
        return c.email || "—";
      case "street":
        return c.street || c.address || "—";
      case "city":
        return c.parsedCity || c.city || "—";
      case "zipCode":
        return c.parsedZip || c.zipCode || "—";
      case "zone":
        return zoneLabel(c.serviceZone);
      case "areaCode":
        return c.areaCode || "—";
      case "status":
        return c.status;
      case "booked":
        return c.hasBookedAppointment ? "Yes" : "No";
      case "lastAppointment":
        return formatWhen(c.lastAppointmentAt);
      case "lastInteraction":
        return formatWhen(c.lastInteractionAt || c.updatedAt);
      case "pets":
        return petsLabel(c);
      case "medicalService":
        return medicalServiceTabLabel(getMedicalService(c.primaryMedicalService));
      default:
        return "—";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-brand">Contacts</h2>
          <p className="text-sm text-gray-600 mt-1">
            Spreadsheet view — click a column header to sort. City and zip are parsed from addresses.
          </p>
        </div>
        {stats && (
          <p className="text-xs text-gray-500">
            {stats.total} total · {stats.customers} customers · {stats.leads} leads · {stats.unread}{" "}
            unread
          </p>
        )}
      </div>

      {(banner || error) && (
        <div className="space-y-2">
          {banner && (
            <div className="rounded-xl border border-gray-200 bg-section-gray text-gray-800 px-4 py-2 text-sm">
              {banner}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">
              {error}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, email, city, zip…"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm min-w-[220px] flex-1 max-w-md"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="customer">Customers</option>
          <option value="lead">Leads</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          type="button"
          onClick={() => void syncCustomers()}
          disabled={busy}
          className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 disabled:opacity-50"
        >
          {busy ? "Syncing…" : "Sync from bookings"}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="lg:hidden divide-y divide-gray-100">
          {loading && <div className="px-4 py-8 text-gray-500 text-sm">Loading contacts…</div>}
          {!loading && contacts.length === 0 && (
            <div className="px-4 py-8 text-gray-500 text-sm">No contacts match your filters.</div>
          )}
          {!loading &&
            contacts.map((c) => (
              <div key={c.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{displayName(c)}</div>
                    <div className="text-sm text-gray-600">{formatPhoneDisplay(c.phone)}</div>
                    {c.email && <div className="text-sm text-gray-500 truncate">{c.email}</div>}
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="text-[10px] font-bold bg-accent text-white rounded-full px-1.5 py-0.5 shrink-0">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span>{c.status}</span>
                  {c.parsedCity || c.city ? <span>{c.parsedCity || c.city}</span> : null}
                  {petsLabel(c) !== "—" ? <span>{petsLabel(c)}</span> : null}
                  <span>{medicalServiceTabLabel(getMedicalService(c.primaryMedicalService))}</span>
                </div>
                {onOpenConversation && (
                  <button
                    type="button"
                    onClick={() => onOpenConversation(c.id)}
                    className="text-sm font-semibold text-brand hover:underline"
                  >
                    Message
                  </button>
                )}
              </div>
            ))}
        </div>

        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                {COLUMNS.map((col) => (
                  <th key={col.id} className={`px-3 py-2 font-semibold text-gray-600 ${col.className ?? ""}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className="inline-flex items-center hover:text-brand whitespace-nowrap"
                    >
                      {col.label}
                      <SortIndicator active={sort === col.id} order={sortOrder} />
                    </button>
                  </th>
                ))}
                {onOpenConversation && (
                  <th className="px-3 py-2 font-semibold text-gray-600 min-w-[88px] sticky right-0 bg-gray-50">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={COLUMNS.length + (onOpenConversation ? 1 : 0)} className="px-4 py-8 text-gray-500">
                    Loading contacts…
                  </td>
                </tr>
              )}
              {!loading && contacts.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + (onOpenConversation ? 1 : 0)} className="px-4 py-8 text-gray-500">
                    No contacts match your filters.
                  </td>
                </tr>
              )}
              {!loading &&
                contacts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-100 hover:bg-sky-50/40 even:bg-gray-50/40"
                  >
                    {COLUMNS.map((col) => (
                      <td
                        key={col.id}
                        className={`px-3 py-2 text-gray-800 whitespace-nowrap ${col.className ?? ""}`}
                        title={cellValue(c, col.id)}
                      >
                        <span className="block truncate max-w-[240px]">{cellValue(c, col.id)}</span>
                        {col.id === "name" && c.unreadCount > 0 && (
                          <span className="ml-1 inline-flex text-[10px] font-bold bg-accent text-white rounded-full px-1.5 py-0.5">
                            {c.unreadCount}
                          </span>
                        )}
                      </td>
                    ))}
                    {onOpenConversation && (
                      <td className="px-3 py-2 sticky right-0 bg-inherit">
                        <button
                          type="button"
                          onClick={() => onOpenConversation(c.id)}
                          className="text-xs font-semibold text-brand hover:underline"
                        >
                          Message
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
