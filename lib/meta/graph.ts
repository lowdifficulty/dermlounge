import "server-only";
import { META_GRAPH_VERSION } from "./config";

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

export class MetaGraphError extends Error {
  readonly type?: string;
  readonly code?: number;
  readonly errorSubcode?: number;

  constructor(err: { message?: string; type?: string; code?: number; error_subcode?: number }, status?: number) {
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
  }
}

function graphUrl(path: string, search?: Record<string, string>): URL {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
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
  const url = graphUrl(path, { ...search, access_token: token });
  const res = await fetch(url, { cache: "no-store" });
  return readGraph<T>(res);
}

export async function graphGetPublic<T>(
  path: string,
  search: Record<string, string>
): Promise<T> {
  const url = graphUrl(path, search);
  const res = await fetch(url, { cache: "no-store" });
  return readGraph<T>(res);
}

export async function graphPost<T>(
  path: string,
  token: string,
  body?: Record<string, string>
): Promise<T> {
  const url = graphUrl(path, { access_token: token });
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body ?? {}).toString(),
  });
  return readGraph<T>(res);
}
