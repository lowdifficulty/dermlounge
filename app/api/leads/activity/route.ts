import { NextResponse } from "next/server";
import { touchLeadActivity } from "@/lib/leads/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { leadSessionId?: string };
    const sessionId = body.leadSessionId?.trim();
    if (!sessionId) {
      return NextResponse.json({ error: "Session required" }, { status: 400 });
    }

    await touchLeadActivity(sessionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Lead activity touch failed:", err);
    return NextResponse.json({ error: "Could not record activity" }, { status: 500 });
  }
}
