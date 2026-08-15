import "server-only";
import { graphGet, graphGetPublic } from "./graph";
import {
  resolveMetaAppId,
  resolveMetaAppSecret,
  resolveMetaPageAccessToken,
  resolveMetaPageId,
} from "./config";

export type MetaTokenStatus = {
  valid: boolean;
  expiresAt: string | null;
  neverExpires: boolean;
  error?: string;
};

type DebugToken = {
  data?: {
    is_valid?: boolean;
    expires_at?: number;
    error?: { message?: string };
  };
};

function unixToIso(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

export async function inspectMetaAccessToken(token?: string | null): Promise<MetaTokenStatus> {
  const access = token || (await resolveMetaPageAccessToken());
  if (!access) {
    return { valid: false, expiresAt: null, neverExpires: false, error: "No Page access token" };
  }

  const appId = await resolveMetaAppId();
  const appSecret = await resolveMetaAppSecret();
  if (appId && appSecret) {
    try {
      const debug = await graphGetPublic<DebugToken>("debug_token", {
        input_token: access,
        access_token: `${appId}|${appSecret}`,
      });
      const data = debug.data;
      const expiresAt = unixToIso(data?.expires_at);
      const neverExpires = data?.expires_at === 0;
      const error = data?.error?.message;
      return {
        valid: Boolean(data?.is_valid),
        expiresAt,
        neverExpires,
        error: data?.is_valid ? undefined : error || "Page access token is not valid",
      };
    } catch (err) {
      return {
        valid: false,
        expiresAt: null,
        neverExpires: false,
        error: err instanceof Error ? err.message : "Could not inspect Meta token",
      };
    }
  }

  const pageId = await resolveMetaPageId();
  try {
    await graphGet(pageId || "me", access, { fields: "id,name" });
    return { valid: true, expiresAt: null, neverExpires: false };
  } catch (err) {
    return {
      valid: false,
      expiresAt: null,
      neverExpires: false,
      error: err instanceof Error ? err.message : "Page access token is not valid",
    };
  }
}

/**
 * Turn a short-lived user/page token into a long-lived Page token when App ID + secret exist.
 * Page tokens from a long-lived user token typically do not expire.
 */
export async function ensureLongLivedPageToken(
  pageId: string,
  rawToken: string
): Promise<{ token: string; exchanged: boolean; status: MetaTokenStatus }> {
  const token = rawToken.trim();
  const appId = await resolveMetaAppId();
  const appSecret = await resolveMetaAppSecret();
  let working = token;
  let exchanged = false;

  if (appId && appSecret) {
    try {
      const exchangedUser = await graphGetPublic<{ access_token?: string }>("oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: token,
      });
      if (exchangedUser.access_token) {
        working = exchangedUser.access_token;
        exchanged = true;
      }
    } catch {
      // Already a Page token, or exchange is unavailable — try it as-is.
    }

    try {
      const page = await graphGet<{ access_token?: string }>(pageId, working, {
        fields: "access_token",
      });
      if (page.access_token && page.access_token !== working) {
        working = page.access_token;
        exchanged = true;
      }
    } catch {
      // Keep the exchanged user token or original if this Page lookup fails.
    }
  }

  const status = await inspectMetaAccessToken(working);
  if (!status.valid) {
    throw new Error(status.error || "Meta Page access token is not valid");
  }
  return { token: working, exchanged, status };
}
