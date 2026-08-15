import "server-only";
import { createHmac } from "crypto";
import { META_GRAPH_VERSION, resolveMetaAppSecret } from "./config";

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export class MetaGraphError extends Error {
  readonly type?: string;
  readonly code?: number;
  readonly errorSubcode?: number;
  readonly fbtraceId?: string;

  constructor(
    err: {
      message?: string;
      type?: string;
      code?: number;
      error_subcode?: number;
      fbtrace_id?: string;
    },
    status?: number
  ) {
    const message = err.message || `Meta Graph error ${status ?? ""}`.trim();
    const suffix =
      err.code != null
        ? ` (code ${err.code}${err.error_subcode != null ? `/${err.error_subcode}` : ""})`
        : "";
    super(`${message}${suffix}`);
    this.name = "MetaGraphError";
    this.type = err.type;
    this.code = err.code;
    this.errorSubcode = err.error_subcode;
    this.fbtraceId = err.fbtrace_id;
  }
}

export function metaAppSecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

function graphUrl(path: string, search?: Record<string, string>): URL {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
}

async function withAppSecretProof(
  search: Record<string, string>
): Promise<Record<string, string>> {
  const token = search.access_token;
  if (!token) return search;
  const secret = await resolveMetaAppSecret();
  if (!secret) return search;
  return { ...search, appsecret_proof: metaAppSecretProof(token, secret) };
}

async function readGraph<T>(res: Response): Promise<T> {
  const json = (await res.json()) as T & GraphErrorBody;
  if (!res.ok || json.error) {
    throw new MetaGraphError(json.error || {}, res.status);
  }
  return json;
}

export async function graphGet<T>(
  path: string,
  token: string,
  search?: Record<string, string>
): Promise<T> {
  const params = await withAppSecretProof({ ...search, access_token: token });
  const url = graphUrl(path, params);
  const res = await fetch(url, { cache: "no-store" });
  return readGraph<T>(res);
}

export async function graphGetPublic<T>(
  path: string,
  search: Record<string, string>
): Promise<T> {
  const params = await withAppSecretProof(search);
  const url = graphUrl(path, params);
  const res = await fetch(url, { cache: "no-store" });
  return readGraph<T>(res);
}

export async function graphPost<T>(
  path: string,
  token: string,
  body?: Record<string, string>
): Promise<T> {
  const params = await withAppSecretProof({ access_token: token });
  const url = graphUrl(path, params);
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body ?? {}).toString(),
  });
  return readGraph<T>(res);
}
