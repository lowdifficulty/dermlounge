import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import {
  readSmsBotConfig,
  writeSmsBotConfig,
  type SmsBotConfig,
} from "@/lib/crm/sms-bot-config";
import { findContactById, findContactByPhone } from "@/lib/crm/store";
import { ensureCrmSeeded } from "@/lib/crm/seed";
import { simulateSmsBotReply } from "@/lib/crm/sms-bot";
import { crmPhoneDigits } from "@/lib/crm/phone";
import { DEFAULT_MEDICAL_SERVICE } from "@/lib/medical-services";

export async function GET() {
  try {
    await requireAdmin();
    const config = await readSmsBotConfig();
    return NextResponse.json({ config });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Partial<SmsBotConfig>;
    const config = await writeSmsBotConfig(body);
    return NextResponse.json({ config });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    await ensureCrmSeeded();
    const body = (await request.json()) as {
      action?: string;
      contactId?: string;
      phone?: string;
      message?: string;
    };

    if (body.action !== "simulate") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    let contact =
      (body.contactId ? await findContactById(body.contactId) : null) ||
      (body.phone ? await findContactByPhone(body.phone) : null);

    if (!contact && body.phone) {
      const digits = crmPhoneDigits(body.phone);
      contact = {
        id: "simulate",
        phone: digits,
        phoneE164: `+1${digits}`,
        firstName: "Test",
        fullName: "Test Contact",
        pets: [],
        appointmentIds: [],
        medicalService: DEFAULT_MEDICAL_SERVICE,
        status: "lead",
        tags: ["test", "wound-care"],
        source: "contact",
        unreadCount: 0,
        botEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const result = await simulateSmsBotReply({
      contact,
      inboundBody: message,
    });

    return NextResponse.json({ ok: true, ...result, contactId: contact.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Simulate failed" },
      { status: 400 }
    );
  }
}
