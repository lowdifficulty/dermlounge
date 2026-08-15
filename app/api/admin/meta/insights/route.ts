import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import { loadMetaInsights, parseInsightsRange } from "@/lib/meta/insights";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = parseInsightsRange(url.searchParams.get("range"));
  const payload = await loadMetaInsights(days);
  return NextResponse.json(payload);
}
