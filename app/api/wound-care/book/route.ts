import { NextRequest, NextResponse } from "next/server";
import { bookWoundCareConsultation } from "@/lib/wound-care/booking";
import type {
  WoundDuration,
  WoundInsurance,
  WoundSize,
} from "@/lib/wound-care/types";

const WOUND_SIZES = new Set<WoundSize>([
  "0-1-inches",
  "1-2-inches",
  "2-3-inches",
  "3-plus-inches",
]);

const WOUND_DURATIONS = new Set<WoundDuration>([
  "less-than-30-days",
  "1-3-months",
  "3-6-months",
  "more-than-6-months",
]);

const INSURANCE = new Set<WoundInsurance>([
  "medicare",
  "private",
  "none",
  "other",
]);

function parseOptionalEnum<T extends string>(
  value: unknown,
  allowed: Set<T>
): T | undefined {
  if (typeof value !== "string" || !allowed.has(value as T)) return undefined;
  return value as T;
}

function parsePriorTreatment(value: unknown): "yes" | "no" | undefined {
  if (value === "yes" || value === "no") return value;
  return undefined;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const woundSize = parseOptionalEnum(body.woundSize, WOUND_SIZES);
  const woundDuration = parseOptionalEnum(body.woundDuration, WOUND_DURATIONS);
  const priorTreatment = parsePriorTreatment(body.priorTreatment);
  const insurance = parseOptionalEnum(body.insurance, INSURANCE);

  const result = await bookWoundCareConsultation({
    firstName: String(body.firstName ?? ""),
    lastName: String(body.lastName ?? ""),
    phone: String(body.phone ?? ""),
    smsOptIn: body.smsOptIn !== false,
    ...(woundSize ? { woundSize } : {}),
    ...(woundDuration ? { woundDuration } : {}),
    ...(priorTreatment ? { priorTreatment } : {}),
    ...(insurance ? { insurance } : {}),
    slotKey: String(body.slotKey ?? ""),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    consultationId: result.consultation.id,
    displayDate: result.displayDate,
    displayTime: result.displayTime,
    startAt: result.consultation.startAt,
  });
}
