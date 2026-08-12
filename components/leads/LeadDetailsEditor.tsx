"use client";

import { useEffect, useState } from "react";
import { PET_SIZES } from "@/lib/constants";
import { GROOMING_SERVICES } from "@/lib/pricing";

export interface LeadDetailsFormValues {
  phone: string;
  firstName: string;
  lastName: string;
  email: string;
  petName: string;
  petSize: string;
  service: string;
  address: string;
  city: string;
  zipCode: string;
}

export function leadToFormValues(lead: {
  phone?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  petName?: string;
  petSize?: string;
  service?: string;
  address?: string;
  city?: string;
  zipCode?: string;
}): LeadDetailsFormValues {
  return {
    phone: lead.phone ?? "",
    firstName: lead.firstName ?? "",
    lastName: lead.lastName ?? "",
    email: lead.email ?? "",
    petName: lead.petName ?? "",
    petSize: lead.petSize ?? "medium",
    service: lead.service ?? "full-groom",
    address: lead.address ?? "",
    city: lead.city ?? "",
    zipCode: lead.zipCode ?? "",
  };
}

export default function LeadDetailsEditor({
  leadId,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  leadId: string;
  initial: LeadDetailsFormValues;
  busy?: boolean;
  onSave: (leadId: string, values: LeadDetailsFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<LeadDetailsFormValues>(initial);

  useEffect(() => {
    setValues(initial);
  }, [initial, leadId]);

  function update<K extends keyof LeadDetailsFormValues>(key: K, value: LeadDetailsFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(leadId, values);
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Edit lead details
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
          <input
            type="tel"
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
          <input
            type="email"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">First name</label>
          <input
            value={values.firstName}
            onChange={(e) => update("firstName", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Last name</label>
          <input
            value={values.lastName}
            onChange={(e) => update("lastName", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Pet name</label>
          <input
            value={values.petName}
            onChange={(e) => update("petName", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Pet size</label>
          <select
            value={values.petSize}
            onChange={(e) => update("petSize", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
          >
            {PET_SIZES.map((size) => (
              <option key={size.value} value={size.value}>
                {size.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Service</label>
          <select
            value={values.service}
            onChange={(e) => update("service", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
          >
            {GROOMING_SERVICES.map((svc) => (
              <option key={svc.value} value={svc.value}>
                {svc.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Street address</label>
          <input
            value={values.address}
            onChange={(e) => update("address", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">City</label>
          <input
            value={values.city}
            onChange={(e) => update("city", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">ZIP code</label>
          <input
            value={values.zipCode}
            onChange={(e) => update("zipCode", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save details"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
