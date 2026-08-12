"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SchedulingShell from "./SchedulingShell";

export default function SchedulingLoginForm({
  role,
  title,
  subtitle,
  dashboardPath,
}: {
  role: "groomer" | "admin";
  title: string;
  subtitle: string;
  loginPath: string;
  dashboardPath: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        username: role === "groomer" ? username : role === "admin" ? username : undefined,
        password,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Login failed");
      return;
    }

    router.push(dashboardPath);
    router.refresh();
  }

  return (
    <SchedulingShell title={title}>
      <div className="max-w-md mx-auto site-card p-8">
        <h1 className="admin-login-heading">{title}</h1>
        <p className="text-gray-600 text-sm mb-6 text-center">{subtitle}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {role === "groomer" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="Melanie, Diamond, Jessica, or Chris"
                className="admin-input"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="admin-input"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="admin-input"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="site-btn w-full">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-100 text-sm text-gray-600 space-y-2">
          {role === "admin" && (
            <p className="text-center text-xs text-gray-500">
              My Derm Lounge staff workspace
            </p>
          )}
          <p>
            <Link href="/client/login" className="font-semibold text-accent hover:text-accent-hot hover:underline">
              Client payment portal
            </Link>
            {" — customers can register, save cards, and pay online."}
          </p>
          {role === "groomer" && (
            <p>
              <Link href="/admin/login" className="font-semibold text-accent hover:text-accent-hot hover:underline">
                Admin login
              </Link>
            </p>
          )}
        </div>
      </div>
    </SchedulingShell>
  );
}
