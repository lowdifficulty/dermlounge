"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  WoundDuration,
  WoundInsurance,
  WoundSize,
} from "@/lib/wound-care/types";
import {
  WOUND_DURATION_OPTIONS,
  WOUND_INSURANCE_OPTIONS,
  WOUND_SIZE_OPTIONS,
} from "@/lib/wound-care/labels";

type DaySlots = {
  date: string;
  displayDate: string;
  slots: { slotKey: string; displayTime: string; startAt: string }[];
};

const STEPS = [
  "Your information",
  "About your wound",
  "How long",
  "Prior treatment",
  "Insurance",
  "Choose appointment",
] as const;

function ChoiceButtons<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T | "";
  onChange: (id: T) => void;
}) {
  return (
    <div className="grid gap-2">
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`w-full rounded-xl border px-4 py-3 text-left text-[15px] transition ${
              selected
                ? "border-[#1e3a5f] bg-[#eef2f6] text-gray-900 ring-2 ring-[#1e3a5f]/25"
                : "border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const inputClass =
  "rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f]/20";

export default function WoundCareIntakeForm() {
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [woundSize, setWoundSize] = useState<WoundSize | "">("");
  const [woundDuration, setWoundDuration] = useState<WoundDuration | "">("");
  const [priorTreatment, setPriorTreatment] = useState<"yes" | "no" | "">("");
  const [insurance, setInsurance] = useState<WoundInsurance | "">("");
  const [slotKey, setSlotKey] = useState("");
  const [days, setDays] = useState<DaySlots[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState<{
    displayDate: string;
    displayTime: string;
  } | null>(null);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    setError("");
    try {
      const res = await fetch("/api/wound-care/availability/");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load times");
      setDays(data.days ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load times");
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (step === 5 && days.length === 0 && !loadingSlots) {
      void loadSlots();
    }
  }, [step, days.length, loadingSlots, loadSlots]);

  function isPhoneValid(): boolean {
    return phone.replace(/\D/g, "").length >= 10;
  }

  function canBook(): boolean {
    return isPhoneValid() && Boolean(slotKey);
  }

  function canContinue(): boolean {
    if (confirmed) return false;
    if (step === 5) return canBook();
    return true;
  }

  function selectAndAdvance<T extends string>(
    setter: Dispatch<SetStateAction<T | "">>
  ) {
    return (id: T) => {
      setter(id);
      setError("");
      setStep((s) => s + 1);
    };
  }

  async function handleBook() {
    if (!canContinue() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/wound-care/book/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone,
          ...(woundSize ? { woundSize } : {}),
          ...(woundDuration ? { woundDuration } : {}),
          ...(priorTreatment ? { priorTreatment } : {}),
          ...(insurance ? { insurance } : {}),
          slotKey,
          smsOptIn: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Booking failed");
      setConfirmed({
        displayDate: data.displayDate,
        displayTime: data.displayTime,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setError("");
    if (step < 5) {
      setStep((s) => s + 1);
      return;
    }
    void handleBook();
  }

  function back() {
    if (confirmed) return;
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }

  if (confirmed) {
    return (
      <div className="p-6 sm:p-10 md:p-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#eef2f6] text-2xl text-[#1e3a5f]">
          ✓
        </div>
        <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-2">You&apos;re booked!</h2>
        <p className="text-gray-700 leading-relaxed md:text-lg">
          Your DermLounge wound care consultation is scheduled for{" "}
          <strong>{confirmed.displayDate}</strong> at{" "}
          <strong>{confirmed.displayTime}</strong>.
          <br />
          We&apos;ll send you a confirmation by text shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-h-[92vh] md:max-h-[88vh] min-h-0">
      <div className="border-b border-gray-100 px-5 md:px-8 py-4 md:py-6">
        <p className="text-sm md:text-base font-semibold uppercase tracking-wide text-[#1e3a5f]">
          Complete Your Intake Form
        </p>
        <h2 className="text-lg md:text-2xl font-semibold text-gray-900 mt-1">{STEPS[step]}</h2>
      </div>

      <div className="px-5 md:px-8 pt-2 md:pt-3">
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 md:h-1.5 flex-1 rounded-full ${i <= step ? "bg-[#1e3a5f]" : "bg-gray-200"}`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 md:px-8 py-5 md:py-8">
        {step === 0 && (
          <div className="grid gap-4 md:gap-5">
            <label className="grid gap-1.5">
              <span className="text-sm md:text-base font-medium text-gray-700">
                First name
              </span>
              <input
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm md:text-base font-medium text-gray-700">
                Last name
              </span>
              <input
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm md:text-base font-medium text-gray-700">Phone number</span>
              <input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3">
            <p className="text-sm md:text-base text-gray-600 mb-1">
              Approximately how large is the wound?
            </p>
            <ChoiceButtons
              options={WOUND_SIZE_OPTIONS}
              value={woundSize}
              onChange={selectAndAdvance(setWoundSize)}
            />
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3">
            <p className="text-sm md:text-base text-gray-600 mb-1">
              How long have you had the wound?
            </p>
            <ChoiceButtons
              options={WOUND_DURATION_OPTIONS}
              value={woundDuration}
              onChange={selectAndAdvance(setWoundDuration)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-3">
            <p className="text-sm md:text-base text-gray-600 mb-1">
              Have you received treatment for this wound before?
            </p>
            <ChoiceButtons
              options={[
                { id: "yes" as const, label: "Yes" },
                { id: "no" as const, label: "No" },
              ]}
              value={priorTreatment}
              onChange={selectAndAdvance(setPriorTreatment)}
            />
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-3">
            <p className="text-sm md:text-base text-gray-600 mb-1">
              What type of insurance do you have?
            </p>
            <ChoiceButtons
              options={WOUND_INSURANCE_OPTIONS}
              value={insurance}
              onChange={selectAndAdvance(setInsurance)}
            />
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-5 md:gap-6">
            <p className="text-sm md:text-base text-gray-600">
              Select a time for your free wound care consultation.
            </p>
            {loadingSlots && (
              <p className="text-sm text-gray-500 py-8 text-center">Loading available times…</p>
            )}
            {!loadingSlots &&
              days.map((day) => (
                <div key={day.date}>
                  <h3 className="font-semibold text-gray-900 mb-2 md:text-lg">{day.displayDate}</h3>
                  <div className="grid grid-cols-3 gap-2 md:gap-3">
                    {day.slots.map((slot) => {
                      const selected = slotKey === slot.slotKey;
                      return (
                        <button
                          key={slot.slotKey}
                          type="button"
                          onClick={() => setSlotKey(slot.slotKey)}
                          className={`rounded-xl border px-2 py-3 md:py-4 text-sm md:text-base font-medium transition ${
                            selected
                              ? "border-[#1e3a5f] bg-[#eef2f6] text-[#1e3a5f] ring-2 ring-[#1e3a5f]/25"
                              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {slot.displayTime}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-gray-100 border border-gray-300 px-3 py-2 text-sm text-gray-800">
            {error}
          </p>
        )}
      </div>

      <div className="border-t border-gray-100 px-5 md:px-8 py-4 md:py-6 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            className="rounded-xl border border-gray-200 px-4 py-3 md:px-6 md:py-3.5 text-gray-700 font-medium hover:bg-gray-50"
          >
            Back
          </button>
        )}
        {(step === 0 || step === 5 || (step >= 1 && step <= 4)) && (
          <button
            type="button"
            onClick={next}
            disabled={!canContinue() || submitting}
            className="flex-1 rounded-xl bg-[#1e3a5f] px-4 py-3 md:py-3.5 text-white font-semibold hover:bg-[#152a47] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 5
              ? submitting
                ? "Booking…"
                : "Book My Consultation"
              : step >= 1 && step <= 4
                ? "Skip"
                : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}
