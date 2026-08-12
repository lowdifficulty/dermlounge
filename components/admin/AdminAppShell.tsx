"use client";

import StaffAppShell, { type StaffNavItem } from "@/components/staff/StaffAppShell";

export type AdminNavItem = StaffNavItem;

export default function AdminAppShell({
  title,
  items,
  activeId,
  onSelect,
  onLogout,
  headerTitle,
  children,
}: {
  title: string;
  items: AdminNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onLogout?: () => void;
  headerTitle?: string;
  children: React.ReactNode;
}) {
  return (
    <StaffAppShell
      title={title}
      eyebrow="Admin"
      items={items}
      activeId={activeId}
      onSelect={onSelect}
      onLogout={onLogout}
      headerTitle={headerTitle}
      storageKey="dl-admin-sidebar-collapsed"
      showDialer
    >
      {children}
    </StaffAppShell>
  );
}
