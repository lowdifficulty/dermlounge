import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import {
  getStaffLoginLogPersistenceStatus,
  readStaffLoginLog,
} from "@/lib/staff/login-log";

export async function GET() {
  try {
    await requireAdmin();
    const entries = await readStaffLoginLog();
    return NextResponse.json({
      persistence: getStaffLoginLogPersistenceStatus(),
      entries,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
