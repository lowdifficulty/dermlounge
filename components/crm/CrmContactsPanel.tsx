"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPhoneDisplay } from "@/lib/leads/normalize";
import { getMedicalService, medicalServiceTabLabel, MEDICAL_SERVICES } from "@/lib/medical-services";
import type { CrmContactListItem, CrmContactSortField, CrmContactStatus } from "@/lib/crm/types";
import {
  CRM_PIPELINE_STAGE_OPTIONS,
  crmContactStatusLabel,
} from "@/lib/crm/pipeline";
import CreateContactForm from "@/components/crm/CreateContactForm";

type CrmContact = CrmContactListItem;

type Stats = {
  total: number;
  unread: number;
  byStage?: Record<CrmContactStatus, number>;
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
  const [status, setStatus] = useState<"all" | CrmContactStatus>("all");
  const [sort, setSort] = useState<CrmContactSortField>("lastInteraction");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [editing, setEditing] = useState<CrmContact | null>(null);

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
        return crmContactStatusLabel(c.status);
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
            {stats.total} total · {stats.unread} unread
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
          <option value="all">All stages</option>
          {CRM_PIPELINE_STAGE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void syncCustomers()}
          disabled={busy}
          className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 disabled:opacity-50"
        >
          {busy ? "Syncing…" : "Sync from bookings"}
        </button>
        <CreateContactForm
          onCreated={(contact, created) => {
            setBanner(
              created
                ? "Contact created — send a text from the conversation"
                : "Contact already exists — send a text from the conversation"
            );
            void loadContacts();
            onOpenConversation?.(contact.id);
          }}
        />
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
                  <span>{crmContactStatusLabel(c.status)}</span>
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
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className="text-sm font-semibold text-gray-600 hover:underline ml-3"
                >
                  Edit
                </button>
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
                <th className="px-3 py-2 font-semibold text-gray-600 min-w-[120px] sticky right-0 bg-gray-50">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-gray-500">
                    Loading contacts…
                  </td>
                </tr>
              )}
              {!loading && contacts.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-gray-500">
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
                          className="text-xs font-semibold text-brand hover:underline mr-3"
                        >
                          Message
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(c)}
                          className="text-xs font-semibold text-gray-600 hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                    {!onOpenConversation && (
                      <td className="px-3 py-2 sticky right-0 bg-inherit">
                        <button
                          type="button"
                          onClick={() => setEditing(c)}
                          className="text-xs font-semibold text-gray-600 hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ContactEditor
          contact={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setBanner("Contact updated");
            void loadContacts();
          }}
        />
      )}
    </div>
  );
}

function ContactEditor({
  contact,
  onClose,
  onSaved,
}: {
  contact: CrmContact;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(contact.firstName || "");
  const [lastName, setLastName] = useState(contact.lastName || "");
  const [phone, setPhone] = useState(contact.phone);
  const [email, setEmail] = useState(contact.email || "");
  const [address, setAddress] = useState(contact.address || "");
  const [city, setCity] = useState(contact.city || contact.parsedCity || "");
  const [zipCode, setZipCode] = useState(contact.zipCode || contact.parsedZip || "");
  const [status, setStatus] = useState<CrmContactStatus>(contact.status);
  const [medicalService, setMedicalService] = useState(
    contact.medicalService || contact.primaryMedicalService || "wound_care"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/crm/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          email,
          address,
          city,
          zipCode,
          status,
          medicalService,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save contact");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <form
        onSubmit={(e) => void save(e)}
        className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 space-y-3 shadow-xl max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-brand">Edit contact</h3>
          <button type="button" onClick={onClose} className="text-gray-500 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          placeholder="Phone"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            placeholder="Zip"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CrmContactStatus)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          {CRM_PIPELINE_STAGE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={medicalService}
          onChange={(e) => setMedicalService(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          {MEDICAL_SERVICES.map((service) => (
            <option key={service.id} value={service.id}>
              {service.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
