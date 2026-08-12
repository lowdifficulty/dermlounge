import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { findContactById } from "@/lib/crm/store";
import { addCrmNote } from "@/lib/crm/messaging";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const contact = await findContactById(id);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await request.json()) as { text?: string };
    const text = body.text?.trim() || "";
    if (!text) {
      return NextResponse.json({ error: "Note text is required" }, { status: 400 });
    }

    const interaction = await addCrmNote({
      contactId: contact.id,
      phone: contact.phone,
      text,
      staffUserId: user.email || user.name,
      staffName: user.name,
    });

    return NextResponse.json({ ok: true, interaction });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
