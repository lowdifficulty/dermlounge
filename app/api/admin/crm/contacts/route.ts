import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { createManualContact, listCrmContacts, refreshCrm } from "@/lib/crm/service";
import type { CrmContactSortField, CrmConversationView } from "@/lib/crm/types";
import { isCrmConversationView } from "@/lib/medical-services";

const SORT_FIELDS: CrmContactSortField[] = [
  "lastInteraction",
  "name",
  "phone",
  "email",
  "status",
  "street",
  "city",
  "zipCode",
  "areaCode",
  "address",
  "booked",
  "lastAppointment",
  "daysSinceLastAppointment",
  "zone",
  "medicalService",
  "pets",
];

export async function GET(request: Request) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const sortParam = searchParams.get("sort") as CrmContactSortField | null;
    const orderParam = searchParams.get("order");
    const viewParam = searchParams.get("view") as CrmConversationView | null;
    const result = await listCrmContacts({
      q: searchParams.get("q") ?? undefined,
      status: (searchParams.get("status") as "all" | "lead" | "customer" | "inactive") || "all",
      tag: searchParams.get("tag") ?? undefined,
      unread: searchParams.get("unread") === "1",
      view:
        viewParam && isCrmConversationView(viewParam) && viewParam !== "all"
          ? (viewParam as CrmConversationView)
          : undefined,
      sort: sortParam && SORT_FIELDS.includes(sortParam) ? sortParam : undefined,
      order: orderParam === "asc" || orderParam === "desc" ? orderParam : undefined,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireStaff();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      medicalService?: string;
    };
    if (body.action === "refresh") {
      const result = await refreshCrm();
      return NextResponse.json({ ok: true, ...result });
    }
    if (body.action === "create") {
      const result = await createManualContact({
        phone: body.phone || "",
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        medicalService: body.medicalService,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 400 }
    );
  }
}
