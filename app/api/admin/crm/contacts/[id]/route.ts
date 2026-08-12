import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { getCrmContactDetail, updateContactBot } from "@/lib/crm/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireStaff();
    const { id } = await params;
    const contact = await getCrmContactDetail(id);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ contact });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireStaff();
    const { id } = await params;
    const body = (await request.json()) as { botEnabled?: boolean };
    if (typeof body.botEnabled === "boolean") {
      const contact = await updateContactBot(id, body.botEnabled);
      if (!contact) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ contact });
    }
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
