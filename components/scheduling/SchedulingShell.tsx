"use client";

import Link from "next/link";

export default function SchedulingShell({
  title,
  subtitle,
  children,
  onLogout,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onLogout?: () => void;
}) {
  return (
    <div className="min-h-screen bg-section-gray">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="site-container flex items-center justify-between h-16">
          <div>
            <Link href="/" className="font-serif font-bold text-brand text-lg">
              My Derm <span className="text-accent">Lounge</span>
            </Link>
            <p className="text-xs text-gray-500">{title}</p>
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="text-sm font-semibold text-gray-600 hover:text-brand"
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      <main className="site-container py-8">
        {subtitle && (
          <p className="text-gray-600 mb-6">{subtitle}</p>
        )}
        {children}
      </main>
    </div>
  );
}
