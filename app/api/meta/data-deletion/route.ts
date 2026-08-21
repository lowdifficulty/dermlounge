import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { companyLegal, legalRoutes } from "@/lib/company-legal";
import { resolveMetaAppSecret } from "@/lib/meta/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SignedRequestPayload = {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
};

function decodeSignedRequest(
  signedRequest: string,
  appSecret: string
): SignedRequestPayload | null {
  const [encodedSig, payload] = signedRequest.split(".", 2);
  if (!encodedSig || !payload) return null;

  const sig = Buffer.from(encodedSig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    return null;
  }

  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
    return JSON.parse(json) as SignedRequestPayload;
  } catch {
    return null;
  }
}

async function readSignedRequest(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    return params.get("signed_request");
  }
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const value = form.get("signed_request");
    return typeof value === "string" ? value : null;
  }
  try {
    const json = (await request.json()) as { signed_request?: string };
    return json.signed_request?.trim() || null;
  } catch {
    return null;
  }
}

/** Meta User Data Deletion callback — App settings → User data deletion. */
export async function POST(request: Request) {
  const appSecret = await resolveMetaAppSecret();
  if (!appSecret) {
    return NextResponse.json({ error: "Meta app secret is not configured" }, { status: 503 });
  }

  const signedRequest = await readSignedRequest(request);
  if (!signedRequest) {
    return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });
  }

  const payload = decodeSignedRequest(signedRequest, appSecret);
  if (!payload?.user_id) {
    return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
  }

  const statusUrl = `${companyLegal.siteUrl.replace(/\/$/, "")}${legalRoutes.dataDeletion}`;
  const confirmationCode = `dl-${payload.user_id}-${Date.now()}`;

  return NextResponse.json({
    url: statusUrl,
    confirmation_code: confirmationCode,
  });
}
