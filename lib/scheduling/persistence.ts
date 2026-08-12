import "server-only";

export type PersistenceMode = "redis" | "file" | "ephemeral";

export class PersistenceNotConfiguredError extends Error {
  readonly code = "PERSISTENCE_NOT_CONFIGURED";

  constructor(message?: string) {
    super(
      message ??
        "Groomer schedules are not persisted on this server. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN on Vercel."
    );
    this.name = "PersistenceNotConfiguredError";
  }
}

export function hasRedisEnv(): boolean {
  return getRedisCredentials() !== null;
}

/** Upstash REST credentials from either Upstash or Vercel KV env var names. */
export function getRedisCredentials(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

/** True on Vercel's serverless runtime — not local dev with pulled Vercel env vars. */
export function isVercelServerless(): boolean {
  return process.env.VERCEL === "1" && Boolean(process.env.VERCEL_REGION);
}

/** Where availability + appointments are stored for this process. */
export function getPersistenceMode(): PersistenceMode {
  if (hasRedisEnv()) return "redis";
  if (isVercelServerless()) return "ephemeral";
  return "file";
}

export function assertWritablePersistence(): void {
  const mode = getPersistenceMode();
  if (mode === "ephemeral") {
    throw new PersistenceNotConfiguredError();
  }
}

export function persistenceStatus(): {
  mode: PersistenceMode;
  writable: boolean;
  message: string;
} {
  const mode = getPersistenceMode();
  if (mode === "redis") {
    return {
      mode,
      writable: true,
      message: "Schedules are stored in Upstash Redis (persistent).",
    };
  }
  if (mode === "file") {
    return {
      mode,
      writable: true,
      message: "Schedules are stored in data/scheduling.json (local dev).",
    };
  }
  return {
    mode,
    writable: false,
    message:
      "Production has no Redis — schedules are lost on redeploy. Add Upstash Redis in Vercel env vars.",
  };
}
