"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPhoneDisplay } from "@/lib/leads/normalize";

interface JobApplicationRow {
  id: string;
  jobId: string;
  jobTitle: string;
  fullName: string;
  email: string;
  phone: string;
  message: string;
  submittedAt: string;
  resume?: {
    fileName: string;
    mimeType: string;
    hasFile: boolean;
  };
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

export default function JobApplicantsPanel() {
  const [applications, setApplications] = useState<JobApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  const loadApplications = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch("/api/admin/job-applications")
      .then((r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then((d) => setApplications(d.applications ?? []))
      .catch(() => setError("Could not load job applications."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  useEffect(() => {
    return () => {
      if (resumeUrl) URL.revokeObjectURL(resumeUrl);
    };
  }, [resumeUrl]);

  async function downloadResume(id: string, fileName: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/job-applications/${id}`);
      if (!res.ok) throw new Error("Could not load resume");
      const data = await res.json();
      const resume = data.application?.resume;
      if (!resume?.dataBase64) throw new Error("No resume on file");

      const binary = atob(resume.dataBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: resume.mimeType || "application/octet-stream" });
      if (resumeUrl) URL.revokeObjectURL(resumeUrl);
      const url = URL.createObjectURL(blob);
      setResumeUrl(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
    } catch {
      setError("Could not download resume.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteApplication(id: string) {
    if (!window.confirm("Delete this job application permanently?")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/job-applications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setExpandedId(null);
      await loadApplications();
    } catch {
      setError("Could not delete application.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading job applications…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {applications.length} application{applications.length === 1 ? "" : "s"} · newest first
        </p>
        <button
          type="button"
          onClick={() => loadApplications()}
          className="text-sm font-semibold text-brand hover:text-accent"
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {applications.length === 0 ? (
        <p className="text-sm text-gray-600 rounded-xl bg-gray-50 border border-gray-200 px-4 py-6">
          No job applications yet. Applicants from the careers page will appear here.
        </p>
      ) : (
        <div className="space-y-3">
          {applications.map((application) => {
            const expanded = expandedId === application.id;
            const busy = busyId === application.id;

            return (
              <article
                key={application.id}
                className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : application.id)}
                  className="w-full text-left px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{application.fullName}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-violet-900 bg-violet-200 px-2 py-0.5 rounded-full">
                        {application.jobTitle}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {application.email} · {formatPhoneDisplay(application.phone)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Applied {formatWhen(application.submittedAt)}
                    </p>
                  </div>
                  {application.resume?.hasFile && (
                    <span className="text-xs font-semibold text-violet-800 bg-white/80 border border-violet-200 px-2 py-1 rounded-full shrink-0">
                      Resume attached
                    </span>
                  )}
                </button>

                {expanded && (
                  <div className="border-t border-violet-200/80 px-4 py-4 space-y-4 bg-white/60">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                        Introduction
                      </p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{application.message}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {application.resume?.hasFile && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            downloadResume(application.id, application.resume!.fileName)
                          }
                          className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-violet-300 bg-white text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                        >
                          Download resume
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => deleteApplication(application.id)}
                        className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
