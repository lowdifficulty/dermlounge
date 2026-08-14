"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminAppShell, { type AdminNavItem } from "@/components/admin/AdminAppShell";
import CrmPanel from "@/components/crm/CrmPanel";
import OpportunitiesPanel from "@/components/crm/OpportunitiesPanel";
import CrmContactsPanel from "@/components/crm/CrmContactsPanel";
import PhoneSmsPanel from "@/components/admin/PhoneSmsPanel";
import PeoplePanel from "@/components/admin/PeoplePanel";

type Tab = "crm" | "contacts" | "opportunities" | "people" | "phoneSms";

const NAV: AdminNavItem[] = [
  { id: "crm", label: "Conversations", group: "CRM" },
  { id: "contacts", label: "Contacts", group: "CRM" },
  { id: "opportunities", label: "Opportunities", group: "CRM" },
  { id: "people", label: "People", group: "Admin" },
  { id: "phoneSms", label: "Phone & SMS", group: "Messaging" },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("crm");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  function openCrmConversation(contactId: string) {
    try {
      sessionStorage.setItem("dl-crm-open-contact", contactId);
    } catch {
      /* ignore */
    }
    setTab("crm");
  }

  const padded = tab !== "crm";

  return (
    <AdminAppShell
      title="Admin"
      items={NAV}
      activeId={tab}
      onSelect={(id) => setTab(id as Tab)}
      onLogout={logout}
    >
      <div className={padded ? "p-4 md:p-6" : ""}>
        {tab === "crm" && <CrmPanel />}
        {tab === "contacts" && (
          <CrmContactsPanel onOpenConversation={openCrmConversation} />
        )}
        {tab === "opportunities" && (
          <OpportunitiesPanel onOpenConversation={openCrmConversation} />
        )}
        {tab === "people" && <PeoplePanel />}
        {tab === "phoneSms" && <PhoneSmsPanel />}
      </div>
    </AdminAppShell>
  );
}
