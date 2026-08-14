import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { getCrmContactDetail, updateContactBot, updateContactProfile } from "@/lib/crm/service";
import type { CrmContactStatus } from "@/lib/crm/types";

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
    const body = (await request.json()) as {
      botEnabled?: boolean;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      zipCode?: string;
      status?: CrmContactStatus;
      medicalService?: string;
    };
    if (typeof body.botEnabled === "boolean") {
      const contact = await updateContactBot(id, body.botEnabled);
      if (!contact) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ contact });
    }
    const contact = await updateContactProfile(id, body);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ contact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
