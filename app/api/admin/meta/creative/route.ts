import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import { metaAppSecretProof } from "@/lib/meta/graph";
import { resolveMetaAdsAccessToken, resolveMetaAppSecret, resolveMetaPageAccessToken } from "@/lib/meta/config";
import { isAllowedCreativeHost, loadAdCreativeImage } from "@/lib/meta/insights";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adId = new URL(request.url).searchParams.get("adId")?.trim() || "";
  if (!/^\d+$/.test(adId)) {
    return new NextResponse(null, { status: 404 });
  }

  const creative = await loadAdCreativeImage(adId);
  if (!creative?.url) {
    return new NextResponse(null, { status: 404 });
  }

  let parsed: URL;
  try {
    parsed = new URL(creative.url);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (!isAllowedCreativeHost(parsed.hostname)) {
    return new NextResponse(null, { status: 404 });
  }

  const token = (await resolveMetaAdsAccessToken()) || (await resolveMetaPageAccessToken());
  if (parsed.hostname.includes("graph.facebook.com") && token) {
    parsed.searchParams.set("access_token", token);
    const secret = await resolveMetaAppSecret();
    if (secret) parsed.searchParams.set("appsecret_proof", metaAppSecretProof(token, secret));
  }

  const res = await fetch(parsed.toString(), {
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: "image/*,video/mp4;q=0.1" },
  });
  if (!res.ok) {
    return new NextResponse(null, { status: 404 });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/") && contentType !== "application/octet-stream") {
    return new NextResponse(null, { status: 404 });
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_BYTES) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType.startsWith("image/") ? contentType : "image/jpeg",
      "Cache-Control": "private, max-age=600",
    },
  });
}
