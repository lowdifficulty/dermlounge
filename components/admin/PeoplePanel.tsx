"use client";

import { useCallback, useEffect, useState } from "react";

type StaffRow = {
  id: string;
  usernames: string[];
  name: string;
  email: string;
  enabled: boolean;
  protected: boolean;
  createdAt: string;
};

export default function PeoplePanel() {
  const [accounts, setAccounts] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetPassword, setResetPassword] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/staff");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load staff");
      setAccounts(data.accounts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add person");
      setUsername("");
      setEmail("");
      setPassword("");
      setBanner(`${data.account.usernames[0]} can now sign in at Admin login.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add person");
    } finally {
      setSaving(false);
    }
  }

  async function patchStaff(id: string, body: Record<string, string | boolean>) {
    setBusyId(id);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setBanner("Saved");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function removeStaff(id: string, label: string) {
    if (!window.confirm(`Remove login for ${label}?`)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove login");
      setBanner("Login removed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove login");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-brand">People</h2>
        <p className="text-sm text-gray-600 mt-1">
          Add staff who can sign into this CRM. Add patients under Contacts.
        </p>
      </div>

      {banner && (
        <div className="rounded-xl border border-green-200 bg-green-50 text-green-800 px-4 py-3 text-sm">
          {banner}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-brand">Staff logins</h3>
          <p className="text-sm text-gray-600 mt-0.5">
            Username is what they type on the login screen.
          </p>
        </div>

        <form
          onSubmit={(e) => void addStaff(e)}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="Username"
            autoComplete="off"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            placeholder="Email"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            placeholder="Password"
            autoComplete="new-password"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand text-white disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add staff login"}
          </button>
        </form>

        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {loading && (
            <div className="px-4 py-6 text-sm text-gray-500">Loading staff…</div>
          )}
          {!loading &&
            accounts.map((account) => (
              <div
                key={account.id}
                className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900">
                    {account.usernames[0]}
                    {!account.enabled && (
                      <span className="ml-2 text-xs font-semibold text-amber-700">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{account.email}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={resetPassword[account.id] ?? ""}
                    onChange={(e) =>
                      setResetPassword((prev) => ({
                        ...prev,
                        [account.id]: e.target.value,
                      }))
                    }
                    placeholder="New password"
                    className="w-32 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busyId === account.id || !resetPassword[account.id]?.trim()}
                    onClick={() =>
                      void patchStaff(account.id, {
                        password: resetPassword[account.id],
                      }).then(() =>
                        setResetPassword((prev) => ({ ...prev, [account.id]: "" }))
                      )
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 disabled:opacity-50"
                  >
                    Set password
                  </button>
                  {!account.protected && (
                    <>
                      <button
                        type="button"
                        disabled={busyId === account.id}
                        onClick={() =>
                          void patchStaff(account.id, { enabled: !account.enabled })
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 disabled:opacity-50"
                      >
                        {account.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === account.id}
                        onClick={() =>
                          void removeStaff(account.id, account.usernames[0])
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 border border-red-200 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
