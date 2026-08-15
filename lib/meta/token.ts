import "server-only";
import { graphGet, graphGetPublic, MetaGraphError } from "./graph";
import {
  resolveMetaAppId,
  resolveMetaAppSecret,
  resolveMetaPageAccessToken,
  resolveMetaPageId,
} from "./config";

export type MetaTokenKind = "page" | "user" | "expired" | "none" | "unknown";

export type MetaTokenStatus = {
  valid: boolean;
  kind: MetaTokenKind;
  pageId: string | null;
  pageName: string | null;
  expiresAt: string | null;
  neverExpires: boolean;
  missingPagePerms?: boolean;
  error?: string;
  code?: number;
  errorSubcode?: number;
};

export const USER_TOKEN_PASTE_MESSAGE =
  "This is not a Page token. Use Connect Meta, or generate a System User token assigned to the DermLounge Page.";

type PageAccount = {
  id?: string;
  name?: string;
  access_token?: string;
  tasks?: string[];
};

function unixToIso(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

export function isMissingPagePermsError(err: unknown): boolean {
  if (!(err instanceof MetaGraphError)) return false;
  const message = (err.message || "").toLowerCase();
  return (
    err.code === 190 &&
    /pages_show_list|pages_manage_metadata|pages_read_engagement|pages_read_user_content|pages_manage_ads|pages_messaging|impersonating a user's page/.test(
      message
    )
  );
}

export function isExpiredTokenError(err: unknown): boolean {
  if (!(err instanceof MetaGraphError)) return false;
  if (err.errorSubcode === 463 || err.errorSubcode === 467) return true;
  const message = (err.message || "").toLowerCase();
  return err.code === 190 && /session has expired|has expired|expired token|invalid oauth/.test(message);
}

function emptyStatus(error: string): MetaTokenStatus {
  return {
    valid: false,
    kind: "none",
    pageId: null,
    pageName: null,
    expiresAt: null,
    neverExpires: false,
    error,
  };
}

export async function probePageToken(
  token: string,
  pageId: string
): Promise<MetaTokenStatus> {
  try {
    const page = await graphGet<{ id?: string; name?: string }>(pageId, token, {
      fields: "id,name",
    });
    return {
      valid: true,
      kind: "page",
      pageId: page.id || pageId,
      pageName: page.name || null,
      expiresAt: null,
      neverExpires: true,
    };
  } catch (err) {
    const code = err instanceof MetaGraphError ? err.code : undefined;
    const errorSubcode = err instanceof MetaGraphError ? err.errorSubcode : undefined;
    const missingPagePerms = isMissingPagePermsError(err);
    const expired = isExpiredTokenError(err) || (code === 190 && !missingPagePerms);
    return {
      valid: false,
      kind: missingPagePerms ? "user" : expired ? "expired" : "unknown",
      pageId,
      pageName: null,
      expiresAt: null,
      neverExpires: false,
      missingPagePerms,
      error: missingPagePerms
        ? USER_TOKEN_PASTE_MESSAGE
        : err instanceof Error
          ? err.message
          : "Page access token is not valid",
      code,
      errorSubcode,
    };
  }
}

export async function assertLeadgenForms(pageId: string, token: string): Promise<void> {
  await graphGet(`${pageId}/leadgen_forms`, token, { fields: "id,name", limit: "1" });
}

async function exchangeUserToken(token: string): Promise<string> {
  const appId = await resolveMetaAppId();
  const appSecret = await resolveMetaAppSecret();
  if (!appId || !appSecret) return token;
  try {
    const exchanged = await graphGetPublic<{ access_token?: string }>("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: token,
    });
    return exchanged.access_token || token;
  } catch {
    return token;
  }
}

export async function resolvePageTokenFromUserToken(
  userToken: string,
  pageId: string
): Promise<{
  pageToken: string;
  userToken: string;
  pageName: string;
  exchanged: boolean;
} | null> {
  const workingUser = await exchangeUserToken(userToken);
  try {
    const accounts = await graphGet<{ data?: PageAccount[] }>("me/accounts", workingUser, {
      fields: "id,name,access_token,tasks",
      limit: "100",
    });
    const match = (accounts.data ?? []).find((page) => page.id === pageId);
    if (!match?.access_token) return null;
    const probe = await probePageToken(match.access_token, pageId);
    if (!probe.valid) return null;
    await assertLeadgenForms(pageId, match.access_token);
    return {
      pageToken: match.access_token,
      userToken: workingUser,
      pageName: match.name || probe.pageName || "",
      exchanged: true,
    };
  } catch {
    return null;
  }
}

/**
 * Live Page Graph calls decide validity. debug_token is never the health check —
 * a blocked app token must not mark a working Page token expired.
 */
export async function inspectMetaAccessToken(token?: string | null): Promise<MetaTokenStatus> {
  const access = token || (await resolveMetaPageAccessToken());
  if (!access) {
    return emptyStatus("Not connected");
  }

  const pageId = await resolveMetaPageId();
  if (!pageId) {
    return emptyStatus("Facebook Page ID is not configured");
  }

  return probePageToken(access, pageId);
}

/**
 * Accept a pasted System User token, or a user token that can be resolved to a
 * Page token. Never persist a Graph Explorer / user token as the Page token.
 */
export async function resolvePermanentPageToken(
  pageId: string,
  rawToken: string
): Promise<{
  pageToken: string;
  userToken?: string;
  pageName: string;
  exchanged: boolean;
}> {
  const token = rawToken.trim();
  if (!token) {
    throw new Error("Paste a System User token, or use Connect Meta");
  }

  const fromUser = await resolvePageTokenFromUserToken(token, pageId);
  if (fromUser) return fromUser;

  const probe = await probePageToken(token, pageId);
  if (probe.missingPagePerms || probe.kind === "user") {
    throw new Error(USER_TOKEN_PASTE_MESSAGE);
  }
  if (!probe.valid) {
    throw new Error(probe.error || USER_TOKEN_PASTE_MESSAGE);
  }

  try {
    await assertLeadgenForms(pageId, token);
  } catch (err) {
    if (isMissingPagePermsError(err) || (err instanceof MetaGraphError && err.code === 190)) {
      throw new Error(USER_TOKEN_PASTE_MESSAGE);
    }
    throw err instanceof Error ? err : new Error(USER_TOKEN_PASTE_MESSAGE);
  }

  return {
    pageToken: token,
    pageName: probe.pageName || "",
    exchanged: false,
  };
}

export async function ensureLongLivedPageToken(
  pageId: string,
  rawToken: string
): Promise<{
  token: string;
  userToken?: string;
  exchanged: boolean;
  status: MetaTokenStatus;
  pageName: string;
}> {
  const resolved = await resolvePermanentPageToken(pageId, rawToken);
  const status = await probePageToken(resolved.pageToken, pageId);
  if (!status.valid) {
    throw new Error(status.error || USER_TOKEN_PASTE_MESSAGE);
  }
  return {
    token: resolved.pageToken,
    userToken: resolved.userToken,
    exchanged: resolved.exchanged,
    status,
    pageName: resolved.pageName,
  };
}
