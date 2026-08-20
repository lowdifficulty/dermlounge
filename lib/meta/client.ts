import "server-only";
import { metaGraphVersion, resolveMetaPageAccessToken, resolveMetaPageId } from "./config";

type GraphError = { message?: string; type?: string; code?: number };

export type MetaUserProfile = {
  id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  profile_pic?: string;
  username?: string;
};

export type MetaConversationMessage = {
  id: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string; email?: string };
};

export type MetaConversation = {
  id: string;
  participants?: { data?: { id?: string; name?: string; email?: string }[] };
  messages?: { data?: MetaConversationMessage[] };
  updated_time?: string;
};

type GraphFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

async function graphFetch<T>(
  path: string,
  options?: { method?: string; body?: unknown; token?: string }
): Promise<GraphFetchResult<T>> {
  const token = options?.token || (await resolveMetaPageAccessToken());
  if (!token) {
    return { ok: false, error: "Meta page access token is not configured", status: 400 };
  }

  const url = new URL(
    `https://graph.facebook.com/${metaGraphVersion()}/${path.replace(/^\//, "")}`
  );
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), {
    method: options?.method || "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: GraphError };
  if (!res.ok || json.error) {
    const msg = json.error?.message || res.statusText || "Meta API error";
    return { ok: false, error: msg, status: res.status };
  }
  return { ok: true, data: json as T };
}

export async function fetchMetaUserProfile(psid: string): Promise<MetaUserProfile | null> {
  const result = await graphFetch<MetaUserProfile>(
    `${encodeURIComponent(psid)}?fields=first_name,last_name,name,profile_pic`
  );
  return result.ok ? result.data : null;
}

export async function sendMetaTextMessage(options: {
  psid: string;
  text: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const result = await graphFetch<{ recipient_id?: string; message_id?: string }>("me/messages", {
    method: "POST",
    body: {
      recipient: { id: options.psid },
      message: { text: options.text.slice(0, 2000) },
      messaging_type: "RESPONSE",
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, messageId: result.data.message_id };
}

export async function listMetaConversations(options: {
  platform?: "messenger" | "instagram";
  sinceUnix?: number;
  limit?: number;
}): Promise<{ ok: true; conversations: MetaConversation[] } | { ok: false; error: string }> {
  const pageId = await resolveMetaPageId();
  if (!pageId) return { ok: false, error: "Meta page ID is not configured" };

  const fields = [
    "participants",
    "updated_time",
    "messages.limit(50){id,message,created_time,from}",
  ].join(",");
  const params = new URLSearchParams({
    fields,
    limit: String(options.limit ?? 50),
  });
  if (options.platform) params.set("platform", options.platform);
  if (options.sinceUnix) params.set("since", String(options.sinceUnix));

  const path = `${encodeURIComponent(pageId)}/conversations?${params.toString()}`;
  const result = await graphFetch<{ data?: MetaConversation[] }>(path);
  if (!result.ok) return { ok: false, error: result.error };

  return { ok: true, conversations: result.data.data || [] };
}

export async function testMetaConnection(): Promise<{
  ok: boolean;
  pageName?: string;
  pageId?: string;
  error?: string;
}> {
  const pageId = await resolveMetaPageId();
  if (!pageId) return { ok: false, error: "Page ID missing" };

  const result = await graphFetch<{ id?: string; name?: string }>(
    `${encodeURIComponent(pageId)}?fields=id,name`
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, pageId: result.data.id, pageName: result.data.name };
}
