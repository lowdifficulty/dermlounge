import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { Redis } from "@upstash/redis";

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, i).trim()] = value;
  }
  return env;
}

const env = loadEnv(".env.production.pull");
const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("No Redis credentials in production env");
  process.exit(1);
}

const redis = new Redis({ url, token });
const crm = await redis.get("dl:crm");
if (!crm || typeof crm !== "object") {
  console.error("Production dl:crm is empty");
  process.exit(1);
}

mkdirSync("data", { recursive: true });
writeFileSync("data/crm.json", `${JSON.stringify(crm, null, 2)}\n`);
const contacts = Array.isArray(crm.contacts) ? crm.contacts.length : 0;
const interactions = Array.isArray(crm.interactions) ? crm.interactions.length : 0;
console.log(`Wrote data/crm.json — ${contacts} contacts, ${interactions} interactions`);

const leads = await redis.get("dl:leads");
if (leads && typeof leads === "object") {
  writeFileSync("data/leads.json", `${JSON.stringify(leads, null, 2)}\n`);
  const leadCount = Array.isArray(leads.leads)
    ? leads.leads.length
    : Array.isArray(leads)
      ? leads.length
      : 0;
  console.log(`Wrote data/leads.json — ${leadCount} leads`);
}

try {
  unlinkSync(".env.production.pull");
} catch {
  /* ignore */
}
