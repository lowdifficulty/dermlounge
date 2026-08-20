import "server-only";
import { graphGet, graphPost } from "./graph";
import { resolveMetaPageAccessToken, resolveMetaPageId } from "./config";

export type MetaPageSubscription = {
  subscribed: boolean;
  fields: string[];
  error?: string;
};

type SubscribedApp = {
  id?: string;
  name?: string;
  subscribed_fields?: string[];
};

export async function readLeadgenSubscription(): Promise<MetaPageSubscription> {
  const token = await resolveMetaPageAccessToken();
  const pageId = await resolveMetaPageId();
  if (!token || !pageId) {
    return { subscribed: false, fields: [], error: "Page ID or token is not configured" };
  }
  try {
    const json = await graphGet<{ data?: SubscribedApp[] }>(`${pageId}/subscribed_apps`, token, {
      fields: "id,name,subscribed_fields",
    });
    const fields = new Set<string>();
    for (const app of json.data ?? []) {
      for (const field of app.subscribed_fields ?? []) fields.add(field);
    }
    return { subscribed: fields.has("leadgen"), fields: Array.from(fields) };
  } catch (err) {
    return {
      subscribed: false,
      fields: [],
      error: err instanceof Error ? err.message : "Could not read Page subscriptions",
    };
  }
}

export async function subscribePageToLeadgen(): Promise<MetaPageSubscription> {
  const token = await resolveMetaPageAccessToken();
  const pageId = await resolveMetaPageId();
  if (!token || !pageId) {
    throw new Error("Page ID and Page access token are required to subscribe leadgen");
  }
  await graphPost(`${pageId}/subscribed_apps`, token, { subscribed_fields: "leadgen" });
  return readLeadgenSubscription();
}

export async function readMessagingSubscription(): Promise<MetaPageSubscription> {
  const token = await resolveMetaPageAccessToken();
  const pageId = await resolveMetaPageId();
  if (!token || !pageId) {
    return { subscribed: false, fields: [], error: "Page ID or token is not configured" };
  }
  try {
    const json = await graphGet<{ data?: SubscribedApp[] }>(`${pageId}/subscribed_apps`, token, {
      fields: "id,name,subscribed_fields",
    });
    const fields = new Set<string>();
    for (const app of json.data ?? []) {
      for (const field of app.subscribed_fields ?? []) fields.add(field);
    }
    return { subscribed: fields.has("messages"), fields: Array.from(fields) };
  } catch (err) {
    return {
      subscribed: false,
      fields: [],
      error: err instanceof Error ? err.message : "Could not read Page subscriptions",
    };
  }
}

export async function subscribePageToMessaging(): Promise<MetaPageSubscription> {
  const token = await resolveMetaPageAccessToken();
  const pageId = await resolveMetaPageId();
  if (!token || !pageId) {
    throw new Error("Page ID and Page access token are required to subscribe messages");
  }
  const current = await readMessagingSubscription();
  const fields = new Set(current.fields);
  fields.add("messages");
  fields.add("messaging_postbacks");
  await graphPost(`${pageId}/subscribed_apps`, token, {
    subscribed_fields: Array.from(fields).join(","),
  });
  return readMessagingSubscription();
}
