"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StaffDialerPopup from "@/components/admin/StaffDialerPopup";
import {
  StaffDialerProvider,
  useStaffDialerPanel,
} from "@/lib/twilio/staff-dialer-context";

export type StaffNavItem = {
  id: string;
  label: string;
  group?: string;
};

function NavIcon({ id }: { id: string }) {
  const common = "w-5 h-5 shrink-0";
  switch (id) {
    case "crm":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "appointments":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "contacts":
    case "crm-contacts":
    case "clients":
    case "people":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "follow-ups":
    case "opportunities":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "availability":
    case "shifts":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "route":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 19h4a2 2 0 0 0 2-2V7a2 2 0 0 1 2-2h8" />
          <circle cx="18" cy="5" r="2" />
          <circle cx="6" cy="19" r="2" />
        </svg>
      );
    case "book":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 5v14M5 12h14" />
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
    case "team-calendar":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
      );
    case "sms-bot":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2a7 7 0 0 0-7 7v3l-2 3h18l-2-3V9a7 7 0 0 0-7-7z" />
          <path d="M9 18a3 3 0 0 0 6 0" />
        </svg>
      );
    case "twilio":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
        </svg>
      );
    case "analytics":
    case "metaAds":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 19V5M10 19V9M16 19v-6M22 19V7" />
        </svg>
      );
    case "emails":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "job-interviews":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <path d="M2 13h20" />
        </svg>
      );
    case "accounting":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2v20" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "payments":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 15h3" />
        </svg>
      );
    case "licky":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3l1.2 3.6L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.4L12 3z" />
          <path d="M5 16l.8 2.4L8 19l-2.2.7L5 22l-.8-2.3L2 19l2.2-.6L5 16z" />
          <path d="M19 15l.8 2.4L22 18l-2.2.7L19 21l-.8-2.3L16 18l2.2-.6L19 15z" />
        </svg>
      );
    case "qa":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    default:
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

export default function StaffAppShell(props: {
  title: string;
  eyebrow?: string;
  items: StaffNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onLogout?: () => void;
  storageKey?: string;
  showDialer?: boolean;
  headerTitle?: string;
  /** CRM-style views fill the pane and scroll internally. Other views scroll the page. */
  lockViewport?: boolean;
  children: React.ReactNode;
}) {
  return (
    <StaffDialerProvider enabled={Boolean(props.showDialer)}>
      <StaffAppShellInner {...props} />
    </StaffDialerProvider>
  );
}

function StaffAppShellInner({
  title,
  eyebrow = "Workspace",
  items,
  activeId,
  onSelect,
  onLogout,
  storageKey = "dl-staff-sidebar-collapsed",
  showDialer = false,
  headerTitle,
  lockViewport = false,
  children,
}: {
  title: string;
  eyebrow?: string;
  items: StaffNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onLogout?: () => void;
  storageKey?: string;
  showDialer?: boolean;
  headerTitle?: string;
  lockViewport?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { dialerOpen, openDialer, closeDialer, prefillPhone } = useStaffDialerPanel();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(storageKey) === "1");
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function selectNav(id: string) {
    onSelect(id);
    setMobileNavOpen(false);
  }

  const groups = items.reduce<{ name: string; items: StaffNavItem[] }[]>((acc, item) => {
    const name = item.group || "Workspace";
    const existing = acc.find((g) => g.name === name);
    if (existing) existing.items.push(item);
    else acc.push({ name, items: [item] });
    return acc;
  }, []);

  const activeLabel =
    headerTitle || items.find((i) => i.id === activeId)?.label || title;
  const showNavLabels = !collapsed || mobileNavOpen;

  const sidebar = (
    <>
      <div
        className={`flex items-center gap-3 border-b border-white/10 ${
          showNavLabels ? "px-4 py-4 justify-between" : "px-3 py-4 justify-center"
        }`}
      >
        <Link href="/" className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white font-bold text-xs shrink-0">
            DL
          </span>
          {showNavLabels && (
            <span className="font-semibold leading-tight truncate">
              My Derm <span className="text-accent">Lounge</span>
            </span>
          )}
        </Link>
        {mobileNavOpen && (
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden text-white/70 hover:text-white p-1"
            aria-label="Close menu"
          >
            ×
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {groups.map((group) => (
          <div key={group.name}>
            {showNavLabels && (
              <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold">
                {group.name}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.label}
                    onClick={() => selectNav(item.id)}
                    className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                      showNavLabels ? "px-3 py-2.5" : "justify-center px-2 py-2.5"
                    } ${
                      active
                        ? "bg-accent/15 text-white border-l-2 border-l-accent"
                        : "text-white/70 hover:bg-white/5 hover:text-white border-l-2 border-l-transparent"
                    }`}
                  >
                    <NavIcon id={item.id} />
                    {showNavLabels && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-2 space-y-1">
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`hidden lg:flex w-full items-center gap-3 rounded-lg text-sm text-white/70 hover:bg-white/5 hover:text-white ${
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
          }`}
          title={collapsed ? "Expand menu" : "Minimize menu"}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {collapsed ? (
              <path d="M9 6l6 6-6 6" />
            ) : (
              <path d="M15 6l-6 6 6 6" />
            )}
          </svg>
          {!collapsed && <span>{collapsed ? "Expand" : "Minimize"}</span>}
        </button>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className={`w-full flex items-center gap-3 rounded-lg text-sm text-white/70 hover:bg-white/5 hover:text-white ${
              showNavLabels ? "px-3 py-2.5" : "justify-center px-2 py-2.5"
            }`}
            title="Sign out"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            {showNavLabels && <span>Sign out</span>}
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-section-gray text-gray-900 flex">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 z-40 h-[100dvh] flex flex-col bg-[#111827] text-white transition-[transform,width] duration-200 ease-out w-[min(100vw-3rem,248px)] ${
          collapsed ? "lg:w-[72px]" : "lg:w-[248px]"
        } ${mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {sidebar}
      </aside>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full w-full overflow-hidden lg:pl-0">
        <header className="sticky top-0 z-20 shrink-0 bg-white/95 backdrop-blur border-b border-gray-200 px-3 sm:px-4 md:px-6 h-12 lg:h-14 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 shrink-0"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0">
              <p className="hidden sm:block text-[11px] uppercase tracking-wide text-gray-400 font-semibold truncate">
                {eyebrow}
              </p>
              <h1 className="text-sm lg:text-base font-bold text-brand leading-tight truncate">{activeLabel}</h1>
            </div>
          </div>
          {showDialer && (
            <button
              type="button"
              onClick={() => (dialerOpen ? closeDialer() : openDialer())}
              className={`inline-flex items-center gap-2 px-2.5 py-1.5 lg:px-3 rounded-lg text-sm font-semibold transition-colors shrink-0 ${
                dialerOpen
                  ? "bg-accent text-white"
                  : "bg-accent-light text-accent-hot hover:bg-accent/10 border border-accent/20"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span className="hidden sm:inline">Dialer</span>
            </button>
          )}
        </header>
        <main
          className={`flex-1 min-h-0 flex flex-col ${
            lockViewport ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden overscroll-y-contain"
          }`}
        >
          {children}
        </main>
        {showDialer && dialerOpen && (
          <StaffDialerPopup prefillPhone={prefillPhone} onClose={closeDialer} />
        )}
      </div>
    </div>
  );
}
