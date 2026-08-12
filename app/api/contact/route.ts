import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

interface ContactPayload {
  fname?: string;
  email?: string;
  pnumber?: string;
  services?: string;
  message?: string;
  hpname?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendViaResend(
  data: Required<Pick<ContactPayload, "fname" | "email" | "services" | "message">> &
    Pick<ContactPayload, "pnumber">
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const to = process.env.CONTACT_TO || "info@mydermlounge.com";
  const from =
    process.env.CONTACT_FROM || "DermLounge <info@mydermlounge.com>";

  const lines = [
    `Name: ${data.fname}`,
    `Email: ${data.email}`,
    `Phone: ${data.pnumber || "(not provided)"}`,
    `Service: ${data.services}`,
    "",
    data.message,
  ];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: data.email,
      subject: `DermLounge contact — ${data.services}`,
      text: lines.join("\n"),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend API ${res.status}: ${detail}`);
  }

  return true;
}

async function sendContactEmail(data: Required<Pick<ContactPayload, "fname" | "email" | "services" | "message">> & Pick<ContactPayload, "pnumber">) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.CONTACT_TO || "info@mydermlounge.com";
  const from = process.env.CONTACT_FROM || user || "noreply@mydermlounge.com";

  if (host && user && pass) {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const lines = [
      `Name: ${data.fname}`,
      `Email: ${data.email}`,
      `Phone: ${data.pnumber || "(not provided)"}`,
      `Service: ${data.services}`,
      "",
      data.message,
    ];

    await transporter.sendMail({
      from,
      to,
      replyTo: data.email,
      subject: `DermLounge contact — ${data.services}`,
      text: lines.join("\n"),
    });
    return;
  }

  if (await sendViaResend(data)) {
    return;
  }

  console.log("[contact] Email not configured — logging submission:");
  console.log(JSON.stringify(data, null, 2));
}

export async function POST(request: NextRequest) {
  let body: ContactPayload;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  // Honeypot — silently accept bots
  if (body.hpname && body.hpname.trim().length > 0) {
    return NextResponse.json({ success: true, message: "Thank you." });
  }

  const fname = (body.fname || "").trim();
  const email = (body.email || "").trim();
  const services = (body.services || "").trim();
  const message = (body.message || "").trim();
  const pnumber = (body.pnumber || "").trim();

  if (!fname || !email || !services || !message) {
    return NextResponse.json(
      { success: false, message: "Please fill in all required fields." },
      { status: 400 }
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { success: false, message: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  try {
    await sendContactEmail({ fname, email, pnumber, services, message });
    return NextResponse.json({
      success: true,
      message: "Your message has been received!",
    });
  } catch (err) {
    console.error("[contact] Send failed:", err);
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
