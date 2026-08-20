import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import {
  readMetaBotConfig,
  writeMetaBotConfig,
  type MetaBotConfig,
} from "@/lib/meta/meta-bot-config";
import { findContactById } from "@/lib/crm/store";
import { ensureCrmSeeded } from "@/lib/crm/seed";
import { simulateMetaBotReply } from "@/lib/meta/bot";

export async function GET() {
  try {
    await requireAdmin();
    const config = await readMetaBotConfig();
    return NextResponse.json({ config });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Partial<MetaBotConfig>;
    const config = await writeMetaBotConfig(body);
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
      message?: string;
    };

    if (body.action !== "simulate") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    let contact = body.contactId ? await findContactById(body.contactId) : null;
    if (!contact) {
      contact = {
        id: "simulate",
        phone: "8000000001",
        phoneE164: "+18000000001",
        firstName: "Test",
        fullName: "Test Meta Contact",
        metaPsid: "test-psid",
        metaPlatform: "facebook",
        pets: [],
        appointmentIds: [],
        status: "lead",
        tags: ["test"],
        source: "meta",
        medicalService: "wound_care",
        unreadCount: 0,
        botEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const result = await simulateMetaBotReply({ contact, inboundBody: message });
    return NextResponse.json({ ok: true, ...result, contactId: contact.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Simulate failed" },
      { status: 400 }
    );
  }
}
