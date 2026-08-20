import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { findContactById } from "@/lib/crm/store";
import { sendStaffMetaDm } from "@/lib/meta/messaging";
import { metaMessagingStatus } from "@/lib/meta/config";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireStaff();
    const status = await metaMessagingStatus();
    if (!status.configured) {
      return NextResponse.json({ error: "Meta Messenger is not configured" }, { status: 503 });
    }

    const { id } = await params;
    const contact = await findContactById(id);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await request.json()) as { body?: string };
    const text = body.body?.trim() || "";
    if (!text) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }

    const result = await sendStaffMetaDm({
      contact,
      body: text,
      staffUserId: user.email || user.name,
      staffName: user.name,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to send Meta DM", interaction: result.interaction },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, interaction: result.interaction });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
