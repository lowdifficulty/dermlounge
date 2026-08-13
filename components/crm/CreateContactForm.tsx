"use client";

import { useState } from "react";
import { MEDICAL_SERVICES } from "@/lib/medical-services";

export type CreatedCrmContact = {
  id: string;
  phone: string;
  fullName?: string;
};

export default function CreateContactForm({
  onCreated,
  compact = false,
}: {
  onCreated: (contact: CreatedCrmContact, created: boolean) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [medicalService, setMedicalService] = useState("wound_care");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhone("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setMedicalService("wound_care");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          phone,
          firstName,
          lastName,
          email,
          medicalService,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create contact");
      const contact = data.contact as CreatedCrmContact;
      reset();
      setOpen(false);
      onCreated(contact, Boolean(data.created));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create contact");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "w-full px-3 py-2 rounded-lg text-sm font-semibold bg-brand text-white"
            : "px-4 py-2 rounded-xl text-sm font-semibold bg-brand text-white"
        }
      >
        New contact
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className={
        compact
          ? "rounded-xl border border-gray-200 bg-white p-3 space-y-2"
          : "rounded-xl border border-gray-200 bg-white p-4 space-y-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-sm text-brand">New contact</div>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
        inputMode="tel"
        autoComplete="tel"
        placeholder="Phone *"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Email"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <select
        value={medicalService}
        onChange={(e) => setMedicalService(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      >
        {MEDICAL_SERVICES.map((service) => (
          <option key={service.id} value={service.id}>
            {service.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || !phone.trim()}
        className="w-full px-3 py-2 rounded-lg text-sm font-semibold bg-brand text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Create & text"}
      </button>
    </form>
  );
}
