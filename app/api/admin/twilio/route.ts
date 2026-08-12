import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import { twilioStatus, getTwilioClient } from "@/lib/notifications/twilio-client";
import {
  configureTwilioPhoneWebhooks,
  expectedTwilioWebhookUrls,
  inspectTwilioPhoneWebhooks,
} from "@/lib/notifications/twilio-phone-webhooks";
import {
  readTwilioRuntimeConfig,
  writeTwilioRuntimeConfig,
  resolveTwilioAccountSid,
  type TwilioRuntimeConfig,
} from "@/lib/notifications/twilio-runtime-config";

export async function GET() {
  try {
    await requireAdmin();
    const [status, runtime, expected, client] = await Promise.all([
      twilioStatus(),
      readTwilioRuntimeConfig(),
      expectedTwilioWebhookUrls(),
      getTwilioClient(),
    ]);
    const webhooks = client ? await inspectTwilioPhoneWebhooks(client) : null;
    return NextResponse.json({
      status,
      config: {
        accountSid: runtime.accountSid || "",
        fromNumber: runtime.fromNumber || process.env.TWILIO_FROM_NUMBER || "",
        voiceCallerId: runtime.voiceCallerId || "",
        staffCallbackNumber: runtime.staffCallbackNumber || "",
        voiceForwardNumber: runtime.voiceForwardNumber || "",
        twimlAppSid: runtime.twimlAppSid || process.env.TWILIO_TWIML_APP_SID || "",
        webhookBaseUrl: runtime.webhookBaseUrl || expected.base,
        updatedAt: runtime.updatedAt,
        hasEnvApiKey: Boolean(
          process.env.TWILIO_API_KEY_SID?.trim() &&
            process.env.TWILIO_API_KEY_SECRET?.trim()
        ),
        hasEnvAccountSid: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()),
      },
      webhooks,
      expectedWebhooks: expected,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Partial<TwilioRuntimeConfig>;
    const config = await writeTwilioRuntimeConfig(body);
    const status = await twilioStatus();
    return NextResponse.json({ ok: true, config, status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const body = (await request.json().catch(() => ({}))) as { action?: string };

    const client = await getTwilioClient();
    const status = await twilioStatus();

    if (body.action === "configure-webhooks") {
      if (!client || !status.hasAccountSid) {
        return NextResponse.json(
          {
            ok: false,
            error: "Missing Account SID or API credentials",
            status,
          },
          { status: 400 }
        );
      }
      const result = await configureTwilioPhoneWebhooks(client);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error, status },
          { status: 400 }
        );
      }
      let twimlAppSid: string | undefined;
      if (status.hasApiKey) {
        try {
          const { ensureTwilioTwimlApp } = await import("@/lib/twilio/twiml-app");
          twimlAppSid = await ensureTwilioTwimlApp(client);
        } catch (err) {
          console.error("TwiML App provisioning failed:", err);
        }
      }
      return NextResponse.json({
        ok: true,
        status,
        webhooks: result.status,
        twimlAppSid,
      });
    }

    if (body.action === "ensure-twilml-app") {
      if (!client || !status.hasApiKey) {
        return NextResponse.json(
          {
            ok: false,
            error: "Browser calling requires API key credentials",
            status,
          },
          { status: 400 }
        );
      }
      const { ensureTwilioTwimlApp } = await import("@/lib/twilio/twiml-app");
      const twimlAppSid = await ensureTwilioTwimlApp(client);
      return NextResponse.json({ ok: true, twimlAppSid, status });
    }

    if (body.action === "dial") {
      const to = (body as { to?: string; staffPhone?: string }).to?.trim();
      const staffPhone = (body as { staffPhone?: string }).staffPhone?.trim();
      if (!to) {
        return NextResponse.json({ error: "Phone number required" }, { status: 400 });
      }
      const { crmPublicBaseUrl } = await import("@/lib/crm/public-url");
      const { startOutboundBridgeCall } = await import("@/lib/notifications/twilio-voice");
      const { ensureContactForPhone, recordOutboundCall } = await import("@/lib/crm/messaging");
      const base = await crmPublicBaseUrl(request);
      const result = await startOutboundBridgeCall({
        customerPhone: to,
        staffPhone,
        twimlUrl: `${base}/api/twilio/voice/bridge`,
        statusCallbackUrl: `${base}/api/twilio/voice/status`,
      });

      const contact = await ensureContactForPhone(to);
      await recordOutboundCall({
        contact,
        staffUserId: user.email || user.name,
        staffName: user.name,
        twilioSid: result.sid,
        summary: result.ok
          ? "Outbound dialer call started"
          : `Outbound call failed: ${result.error}`,
      });

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error || "Call failed", status },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, sid: result.sid, status });
    }

    if (body.action !== "test") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    if (!client || !status.hasAccountSid) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing Account SID or API credentials",
          status,
        },
        { status: 400 }
      );
    }

    const numbers = await client.incomingPhoneNumbers.list({ limit: 10 });
    const webhooks = await inspectTwilioPhoneWebhooks(client);
    const expected = await expectedTwilioWebhookUrls();

    let account: { friendlyName?: string; status?: string } | null = null;
    try {
      const sid = await resolveTwilioAccountSid();
      if (sid) {
        const fetched = await client.api.accounts(sid).fetch();
        account = { friendlyName: fetched.friendlyName, status: fetched.status };
      }
    } catch {
      /* API keys may lack account read */
    }

    return NextResponse.json({
      ok: true,
      status,
      account,
      numbers: numbers.map((n) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        smsUrl: n.smsUrl,
        voiceUrl: n.voiceUrl,
      })),
      webhooks,
      expectedWebhooks: expected,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Twilio request failed" },
      { status: 400 }
    );
  }
}
