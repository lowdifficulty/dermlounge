import "server-only";
import { Redis } from "@upstash/redis";
import { getRedisCredentials } from "./persistence";

export function getRedisClient(): Redis | null {
  const creds = getRedisCredentials();
  if (!creds) return null;
  return new Redis(creds);
}
