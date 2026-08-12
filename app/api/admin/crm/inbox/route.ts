import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { listCrmInbox } from "@/lib/crm/service";

export async function GET(request: Request) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || "80");
    const result = await listCrmInbox(
      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 80
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
