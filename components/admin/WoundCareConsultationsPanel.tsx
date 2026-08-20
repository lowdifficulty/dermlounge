"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const TZ = "America/Los_Angeles";

type Consultation = {
  id: string;
  startAt: string;
  slotKey: string;
  status: string;
  firstName: string;
  lastName: string;
  phone: string;
  woundSizeLabel: string;
  woundDurationLabel: string;
  insuranceLabel: string;
  priorTreatment: "yes" | "no";
  contactId: string | null;
  isPast: boolean;
};

type LayoutView = "month" | "list";
type TimeFilter = "upcoming" | "past";

function formatWhen(iso: string): { date: string; time: string; dayKey: string } {
  const dt = new Date(iso);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(dt);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(dt);
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
  return { date, time, dayKey };
}

function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return digits;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function pacificToday(): { year: number; month: number; dayKey: string } {
  const now = new Date();
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month] = dayKey.split("-").map(Number);
  return { year, month, dayKey };
}

function pacificWeekday(year: number, month: number, day: number): number {
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(dt);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, month: m };
}

function dayKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ConsultationDetail({
  consultation,
  onOpenConversation,
  onClose,
}: {
  consultation: Consultation;
  onOpenConversation?: (contactId: string) => void;
  onClose?: () => void;
}) {
  const { date, time } = formatWhen(consultation.startAt);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900 text-lg">
            {consultation.firstName} {consultation.lastName}
          </p>
          <p className="text-sm text-gray-600 mt-0.5">
            {date} · {time}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600">{formatPhone(consultation.phone)}</p>
      <p className="text-sm text-gray-500">
        {consultation.woundSizeLabel} · {consultation.woundDurationLabel} ·{" "}
        {consultation.insuranceLabel}
        {consultation.priorTreatment === "yes" ? " · Prior treatment" : ""}
      </p>
      {consultation.contactId && onOpenConversation && (
        <button
          type="button"
          onClick={() => onOpenConversation(consultation.contactId!)}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          Open in CRM
        </button>
      )}
    </div>
  );
}

function ConsultationRow({
  consultation,
  onOpenConversation,
  onSelect,
}: {
  consultation: Consultation;
  onOpenConversation?: (contactId: string) => void;
  onSelect?: () => void;
}) {
  const { time } = formatWhen(consultation.startAt);

  return (
    <li className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
      <button
        type="button"
        onClick={onSelect}
        className="text-left flex-1 hover:opacity-80"
      >
        <p className="font-semibold text-gray-900">
          {time} · {consultation.firstName} {consultation.lastName}
        </p>
        <p className="text-sm text-gray-600">{formatPhone(consultation.phone)}</p>
        <p className="text-sm text-gray-500 mt-1">
          {consultation.woundSizeLabel} · {consultation.woundDurationLabel} ·{" "}
          {consultation.insuranceLabel}
          {consultation.priorTreatment === "yes" ? " · Prior treatment" : ""}
        </p>
      </button>
      {consultation.contactId && onOpenConversation && (
        <button
          type="button"
          onClick={() => onOpenConversation(consultation.contactId!)}
          className="self-start sm:self-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          Open in CRM
        </button>
      )}
    </li>
  );
}

export default function WoundCareConsultationsPanel({
  onOpenConversation,
}: {
  onOpenConversation?: (contactId: string) => void;
}) {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [layoutView, setLayoutView] = useState<LayoutView>("month");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  const [viewMonth, setViewMonth] = useState(() => {
    const { year, month } = pacificToday();
    return { year, month };
  });
  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/wound-care/consultations/");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setConsultations(data.consultations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => consultations.filter((c) => (timeFilter === "upcoming" ? !c.isPast : c.isPast)),
    [consultations, timeFilter]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Consultation[]>();
    for (const c of filtered) {
      const { dayKey } = formatWhen(c.startAt);
      const bucket = map.get(dayKey) ?? [];
      bucket.push(c);
      map.set(dayKey, bucket);
    }
    for (const items of map.values()) {
      items.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return map;
  }, [filtered]);

  const grouped = useMemo(() => {
    return [...byDay.entries()]
      .map(([dayKey, items]) => ({ dayKey, label: formatWhen(items[0].startAt).date, items }))
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }, [byDay]);

  const upcomingCount = consultations.filter((c) => !c.isPast).length;
  const todayKey = useMemo(() => pacificToday().dayKey, []);

  const monthLabel = useMemo(() => {
    const dt = new Date(Date.UTC(viewMonth.year, viewMonth.month - 1, 1, 12, 0, 0));
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      month: "long",
      year: "numeric",
    }).format(dt);
  }, [viewMonth]);

  const calendarCells = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDow = pacificWeekday(year, month, 1);
    const numDays = daysInMonth(year, month);
    const cells: Array<{ day: number | null; dayKey: string | null }> = [];

    for (let i = 0; i < firstDow; i++) {
      cells.push({ day: null, dayKey: null });
    }
    for (let d = 1; d <= numDays; d++) {
      cells.push({ day: d, dayKey: dayKeyFromParts(year, month, d) });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, dayKey: null });
    }
    return cells;
  }, [viewMonth]);

  const selectedConsultation = useMemo(
    () => consultations.find((c) => c.id === selectedConsultationId) ?? null,
    [consultations, selectedConsultationId]
  );

  const selectedDayItems = useMemo(() => {
    if (!selectedDayKey) return [];
    return byDay.get(selectedDayKey) ?? [];
  }, [byDay, selectedDayKey]);

  const selectedDayLabel = useMemo(() => {
    if (!selectedDayKey || selectedDayItems.length === 0) return null;
    return formatWhen(selectedDayItems[0].startAt).date;
  }, [selectedDayKey, selectedDayItems]);

  function selectConsultation(id: string) {
    setSelectedConsultationId(id);
    setSelectedDayKey(null);
  }

  function selectDay(dayKey: string) {
    setSelectedDayKey(dayKey);
    setSelectedConsultationId(null);
  }

  function clearSelection() {
    setSelectedConsultationId(null);
    setSelectedDayKey(null);
  }

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Calendar</h1>
          <p className="text-gray-600 mt-1">
            Wound care bookings from the /woundcare intake form. {upcomingCount} upcoming.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex rounded-xl border border-gray-200 p-1 bg-white">
            <button
              type="button"
              onClick={() => {
                setLayoutView("month");
                clearSelection();
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                layoutView === "month" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => {
                setLayoutView("list");
                clearSelection();
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                layoutView === "list" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              List
            </button>
          </div>

          <div className="flex rounded-xl border border-gray-200 p-1 bg-white">
            <button
              type="button"
              onClick={() => {
                setTimeFilter("upcoming");
                clearSelection();
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                timeFilter === "upcoming"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Upcoming
            </button>
            <button
              type="button"
              onClick={() => {
                setTimeFilter("past");
                clearSelection();
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                timeFilter === "past" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Past
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="text-gray-500">Loading calendar…</p>}
      {error && (
        <p className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</p>
      )}

      {!loading && !error && layoutView === "month" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setViewMonth((m) => addMonths(m.year, m.month, -1));
                  clearSelection();
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                ← Prev
              </button>
              <h2 className="font-semibold text-gray-900">{monthLabel}</h2>
              <button
                type="button"
                onClick={() => {
                  setViewMonth((m) => addMonths(m.year, m.month, 1));
                  clearSelection();
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Next →
              </button>
            </div>

            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
              {weekdayLabels.map((label) => (
                <div
                  key={label}
                  className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarCells.map((cell, idx) => {
                if (!cell.day || !cell.dayKey) {
                  return (
                    <div
                      key={`blank-${idx}`}
                      className="min-h-[100px] border-b border-r border-gray-100 bg-gray-50/50"
                    />
                  );
                }

                const items = byDay.get(cell.dayKey) ?? [];
                const isToday = cell.dayKey === todayKey;
                const isSelected = selectedDayKey === cell.dayKey;

                return (
                  <div
                    key={cell.dayKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectDay(cell.dayKey!)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectDay(cell.dayKey!);
                      }
                    }}
                    className={`min-h-[100px] border-b border-r border-gray-100 p-1.5 text-left align-top transition-colors hover:bg-gray-50 cursor-pointer ${
                      isSelected ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : "bg-white"
                    }`}
                  >
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                        isToday ? "bg-gray-900 text-white" : "text-gray-900"
                      }`}
                    >
                      {cell.day}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {items.slice(0, 3).map((c) => {
                        const { time } = formatWhen(c.startAt);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectConsultation(c.id);
                            }}
                            className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs font-medium ${
                              c.isPast
                                ? "bg-gray-100 text-gray-600"
                                : "bg-emerald-100 text-emerald-900"
                            }`}
                          >
                            {time} {c.firstName}
                          </button>
                        );
                      })}
                      {items.length > 3 && (
                        <span className="block px-1.5 text-xs text-gray-500">+{items.length - 3} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedConsultation && (
            <ConsultationDetail
              consultation={selectedConsultation}
              onOpenConversation={onOpenConversation}
              onClose={clearSelection}
            />
          )}

          {!selectedConsultation && selectedDayKey && selectedDayItems.length > 0 && (
            <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{selectedDayLabel}</h3>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Close
                </button>
              </div>
              <ul className="divide-y divide-gray-100">
                {selectedDayItems.map((c) => (
                  <ConsultationRow
                    key={c.id}
                    consultation={c}
                    onOpenConversation={onOpenConversation}
                    onSelect={() => selectConsultation(c.id)}
                  />
                ))}
              </ul>
            </section>
          )}

          {!selectedConsultation && selectedDayKey && selectedDayItems.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center text-gray-500">
              No {timeFilter} consultations on this day.
            </div>
          )}
        </div>
      )}

      {!loading && !error && layoutView === "list" && grouped.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-gray-500">
          No {timeFilter} consultations yet.
        </div>
      )}

      {!loading && !error && layoutView === "list" && (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section
              key={group.dayKey}
              className="rounded-2xl border border-gray-200 bg-white overflow-hidden"
            >
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
                <h2 className="font-semibold text-gray-900">{group.label}</h2>
              </div>
              <ul className="divide-y divide-gray-100">
                {group.items.map((c) => (
                  <ConsultationRow
                    key={c.id}
                    consultation={c}
                    onOpenConversation={onOpenConversation}
                    onSelect={() => selectConsultation(c.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {selectedConsultation && (
            <ConsultationDetail
              consultation={selectedConsultation}
              onOpenConversation={onOpenConversation}
              onClose={clearSelection}
            />
          )}
        </div>
      )}
    </div>
  );
}
