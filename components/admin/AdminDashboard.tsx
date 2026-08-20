"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminAppShell, { type AdminNavItem } from "@/components/admin/AdminAppShell";
import CrmPanel from "@/components/crm/CrmPanel";
import OpportunitiesPanel from "@/components/crm/OpportunitiesPanel";
import CrmContactsPanel from "@/components/crm/CrmContactsPanel";
import PhoneSmsPanel from "@/components/admin/PhoneSmsPanel";
import PeoplePanel from "@/components/admin/PeoplePanel";
import MetaAdsDashboard from "@/components/admin/MetaAdsDashboard";
import WoundCareConsultationsPanel from "@/components/admin/WoundCareConsultationsPanel";
import { adminTabHref, type AdminTab } from "@/lib/admin/tabs";

const NAV: AdminNavItem[] = [
  { id: "crm", label: "Conversations", group: "CRM" },
  { id: "opportunities", label: "Opportunities", group: "CRM" },
  { id: "contacts", label: "Contacts", group: "CRM" },
  { id: "consultations", label: "Calendar", group: "CRM" },
  { id: "people", label: "People", group: "Admin" },
  { id: "phoneSms", label: "Phone & SMS", group: "Settings" },
  { id: "metaAds", label: "Meta Ads", group: "Ads" },
];

export default function AdminDashboard({ initialTab = "crm" }: { initialTab?: AdminTab }) {
  const router = useRouter();
  const [tab, setTab] = useState<AdminTab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

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
    selectTab("crm");
  }

  function selectTab(id: string) {
    const next = id as AdminTab;
    if (next === tab) return;
    if (next === "metaAds" || tab === "metaAds") {
      router.push(adminTabHref(next));
      return;
    }
    setTab(next);
  }

  return (
    <AdminAppShell
      title="Admin"
      items={NAV}
      activeId={tab}
      onSelect={selectTab}
      onLogout={logout}
      headerTitle={tab === "metaAds" ? "Meta Ads" : undefined}
      lockViewport={tab === "crm"}
    >
      <div
        className={
          tab === "crm"
            ? "h-full min-h-0 overflow-hidden"
            : tab === "metaAds"
              ? "min-h-full"
              : "p-4 md:p-6"
        }
      >
        {tab === "crm" && <CrmPanel />}
        {tab === "contacts" && (
          <CrmContactsPanel onOpenConversation={openCrmConversation} />
        )}
        {tab === "opportunities" && (
          <OpportunitiesPanel onOpenConversation={openCrmConversation} />
        )}
        {tab === "consultations" && (
          <WoundCareConsultationsPanel onOpenConversation={openCrmConversation} />
        )}
        {tab === "people" && <PeoplePanel />}
        {tab === "phoneSms" && <PhoneSmsPanel />}
        {tab === "metaAds" && <MetaAdsDashboard />}
      </div>
    </AdminAppShell>
  );
}
