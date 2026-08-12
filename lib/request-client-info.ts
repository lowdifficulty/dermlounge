/** Request metadata available on Vercel, proxies, and local dev. */
export interface RequestClientInfo {
  ip: string | null;
  ipChain: string[];
  userAgent: string | null;
  acceptLanguage: string | null;
  referer: string | null;
  host: string | null;
  pathname: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryRegion: string | null;
  latitude: string | null;
  longitude: string | null;
  timezone: string | null;
  continent: string | null;
  clientHintsUa: string | null;
  clientHintsPlatform: string | null;
  clientHintsMobile: string | null;
}

function header(request: Request, name: string): string | null {
  const value = request.headers.get(name)?.trim();
  return value || null;
}

function parseIpChain(forwarded: string | null): string[] {
  if (!forwarded) return [];
  return forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function pickClientIp(chain: string[]): string | null {
  if (chain.length === 0) return null;
  return chain[0] ?? null;
}

export function formatRequestLocation(info: Pick<
  RequestClientInfo,
  "city" | "region" | "country" | "countryRegion" | "timezone"
>): string | null {
  const parts = [
    info.city,
    info.region ?? info.countryRegion,
    info.country,
  ].filter(Boolean);
  if (parts.length === 0) {
    return info.timezone ? `Timezone: ${info.timezone}` : null;
  }
  if (info.timezone) parts.push(`(${info.timezone})`);
  return parts.join(", ");
}

export function getRequestClientInfo(request: Request): RequestClientInfo {
  const ipChain = parseIpChain(
    header(request, "x-forwarded-for") ??
      header(request, "x-vercel-forwarded-for")
  );
  const ip =
    pickClientIp(ipChain) ??
    header(request, "x-real-ip") ??
    header(request, "cf-connecting-ip");

  let pathname: string | null = null;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    pathname = null;
  }

  return {
    ip,
    ipChain,
    userAgent: header(request, "user-agent"),
    acceptLanguage: header(request, "accept-language"),
    referer: header(request, "referer"),
    host: header(request, "host"),
    pathname,
    city: header(request, "x-vercel-ip-city"),
    region: header(request, "x-vercel-ip-country-region"),
    country: header(request, "x-vercel-ip-country"),
    countryRegion: header(request, "x-vercel-ip-country-region"),
    latitude: header(request, "x-vercel-ip-latitude"),
    longitude: header(request, "x-vercel-ip-longitude"),
    timezone: header(request, "x-vercel-ip-timezone"),
    continent: header(request, "x-vercel-ip-continent"),
    clientHintsUa: header(request, "sec-ch-ua"),
    clientHintsPlatform: header(request, "sec-ch-ua-platform"),
    clientHintsMobile: header(request, "sec-ch-ua-mobile"),
  };
}
