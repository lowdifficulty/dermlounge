import "server-only";
import { graphGet, graphGetPublic, MetaGraphError } from "./graph";
import {
  resolveMetaAppId,
  resolveMetaAppSecret,
  resolveMetaPageAccessToken,
  resolveMetaPageId,
} from "./config";

/** Scopes required for Pull now / leadgen_forms (Meta Marketing API). */
export const META_LEAD_PULL_SCOPES = [
  "pages_manage_ads",
  "leads_retrieval",
  "pages_show_list",
  "pages_read_engagement",
] as const;

export async function inspectGrantedTokenScopes(token?: string | null): Promise<{
  scopes: string[];
  missingLeadScopes: string[];
}> {
  const access = token?.trim();
  if (!access) {
    return {
      scopes: [],
      missingLeadScopes: [...META_LEAD_PULL_SCOPES],
    };
  }
  const appId = await resolveMetaAppId();
  const appSecret = await resolveMetaAppSecret();
  if (!appId || !appSecret) {
    return { scopes: [], missingLeadScopes: [...META_LEAD_PULL_SCOPES] };
  }
  try {
    const debug = await graphGetPublic<{
      data?: { scopes?: string[]; is_valid?: boolean };
    }>("debug_token", {
      input_token: access,
      access_token: `${appId}|${appSecret}`,
    });
    const scopes = debug.data?.scopes ?? [];
    const missingLeadScopes = META_LEAD_PULL_SCOPES.filter(
      (scope) => !scopes.includes(scope)
    );
    return { scopes, missingLeadScopes: [...missingLeadScopes] };
  } catch {
    return { scopes: [], missingLeadScopes: [...META_LEAD_PULL_SCOPES] };
  }
}

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

export type PageTokenResolveResult =
  | {
      ok: true;
      pageToken: string;
      userToken: string;
      pageName: string;
      exchanged: boolean;
      leadgenOk: boolean;
      leadgenWarning?: string;
    }
  | {
      ok: false;
      reason: string;
      availablePages?: Array<{ id: string; name: string }>;
    };

export async function resolvePageTokenFromUserToken(
  userToken: string,
  pageId: string,
  opts?: { requireLeadgen?: boolean }
): Promise<PageTokenResolveResult> {
  const requireLeadgen = opts?.requireLeadgen ?? false;
  const workingUser = await exchangeUserToken(userToken);
  let accounts: PageAccount[] = [];
  try {
    const res = await graphGet<{ data?: PageAccount[] }>("me/accounts", workingUser, {
      fields: "id,name,access_token,tasks",
      limit: "100",
    });
    accounts = res.data ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not list Facebook Pages";
    if (isMissingPagePermsError(err)) {
      return {
        ok: false,
        reason:
          "Facebook did not grant pages_show_list. Click Connect Meta again and allow every Page permission, including access to DermLounge.",
      };
    }
    return { ok: false, reason: message };
  }

  const availablePages = accounts
    .filter((page) => page.id)
    .map((page) => ({ id: page.id as string, name: page.name || page.id as string }));

  const match = accounts.find((page) => page.id === pageId);
  if (!match?.access_token) {
    const listed =
      availablePages.length > 0
        ? availablePages.map((p) => `${p.name} (${p.id})`).join(", ")
        : "none";
    return {
      ok: false,
      reason: `Facebook did not grant access to Page ${pageId}. Log in with the Facebook account that administers DermLounge, then on the permission screen enable every Page (including DermLounge) and all requested permissions. Pages Facebook returned: ${listed}.`,
      availablePages,
    };
  }

  const probe = await probePageToken(match.access_token, pageId);
  if (!probe.valid) {
    return {
      ok: false,
      reason:
        probe.error ||
        "Facebook returned a Page token but it failed validation. Try Connect Meta again.",
      availablePages,
    };
  }

  let leadgenOk = true;
  let leadgenWarning: string | undefined;
  try {
    await assertLeadgenForms(pageId, match.access_token);
  } catch (err) {
    leadgenOk = false;
    leadgenWarning =
      err instanceof Error
        ? err.message
        : "Lead forms are not accessible yet (leads_retrieval may need App Review).";
    if (requireLeadgen) {
      return { ok: false, reason: leadgenWarning, availablePages };
    }
  }

  return {
    ok: true,
    pageToken: match.access_token,
    userToken: workingUser,
    pageName: match.name || probe.pageName || "",
    exchanged: true,
    leadgenOk,
    leadgenWarning,
  };
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

  const fromUser = await resolvePageTokenFromUserToken(token, pageId, { requireLeadgen: true });
  if (fromUser.ok) {
    return {
      pageToken: fromUser.pageToken,
      userToken: fromUser.userToken,
      pageName: fromUser.pageName,
      exchanged: fromUser.exchanged,
    };
  }

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
