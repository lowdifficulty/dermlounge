import "server-only";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import { isVercelServerless } from "@/lib/scheduling/persistence";
import { ADMIN_EMAIL, ADMIN_USERNAME } from "@/lib/scheduling/groomers";

const FILE_PATH = path.join(process.cwd(), "data", "staff-accounts.json");
const REDIS_KEY = "dl:staff-accounts";

export interface StaffAccount {
  id: string;
  usernames: string[];
  name: string;
  email: string;
  password: string;
  enabled: boolean;
  protected: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PublicStaffAccount = Omit<StaffAccount, "password">;

function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function uniqueUsernames(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeUsername).filter(Boolean)));
}

export function seededStaffAccounts(): StaffAccount[] {
  const ts = nowIso();
  const sharedPassword = process.env.STAFF_PASSWORD ?? "1";
  return [
    {
      id: "staff-admin",
      usernames: [normalizeUsername(ADMIN_USERNAME)],
      name: "Admin",
      email: ADMIN_EMAIL,
      password: sharedPassword,
      enabled: true,
      protected: true,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "staff-maeve",
      usernames: ["maeve", "meave"],
      name: "Maeve",
      email: ADMIN_EMAIL,
      password: "1",
      enabled: true,
      protected: false,
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

function normalizeAccount(raw: Partial<StaffAccount>, fallbackId?: string): StaffAccount | null {
  const usernames = uniqueUsernames(raw.usernames || []);
  const name = (raw.name || "").trim();
  const password = typeof raw.password === "string" ? raw.password : "";
  if (!usernames.length || !name || !password) return null;
  const ts = nowIso();
  const protectedAccount =
    raw.protected === true || usernames.includes(normalizeUsername(ADMIN_USERNAME));
  return {
    id: raw.id || fallbackId || `staff-${randomUUID()}`,
    usernames,
    name,
    email: (raw.email || ADMIN_EMAIL).trim() || ADMIN_EMAIL,
    password,
    enabled: raw.enabled !== false,
    protected: protectedAccount,
    createdAt: raw.createdAt || ts,
    updatedAt: raw.updatedAt || ts,
  };
}

function normalizeList(input: unknown): StaffAccount[] {
  const rows = Array.isArray(input) ? input : [];
  const out: StaffAccount[] = [];
  for (const row of rows) {
    const account = normalizeAccount(row as Partial<StaffAccount>);
    if (account) out.push(account);
  }
  return out;
}

function mergeSeeded(existing: StaffAccount[]): StaffAccount[] {
  if (existing.length === 0) return seededStaffAccounts();
  const accounts = [...existing];
  const adminUser = normalizeUsername(ADMIN_USERNAME);
  if (!accounts.some((a) => a.usernames.includes(adminUser))) {
    accounts.unshift(seededStaffAccounts()[0]);
  }
  return accounts;
}

async function readFromLocalFile(): Promise<StaffAccount[]> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return normalizeList(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeToLocalFile(accounts: StaffAccount[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(accounts, null, 2) + "\n", "utf8");
}

async function persist(accounts: StaffAccount[]): Promise<StaffAccount[]> {
  const redis = getRedisClient();
  if (redis) {
    await redis.set(REDIS_KEY, accounts);
    return accounts;
  }
  if (isVercelServerless()) {
    throw new Error("Staff accounts require Redis in production");
  }
  await writeToLocalFile(accounts);
  return accounts;
}

export async function readStaffAccounts(): Promise<StaffAccount[]> {
  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<StaffAccount[]>(REDIS_KEY);
    const current = mergeSeeded(normalizeList(data));
    if (!data || current.length !== (Array.isArray(data) ? data.length : 0)) {
      await redis.set(REDIS_KEY, current);
    }
    return current;
  }
  if (isVercelServerless()) {
    return mergeSeeded([]);
  }
  const fromFile = mergeSeeded(await readFromLocalFile());
  if (fromFile.length) await writeToLocalFile(fromFile);
  return fromFile;
}

export function toPublicStaffAccount(account: StaffAccount): PublicStaffAccount {
  const { password: _password, ...rest } = account;
  return rest;
}

export async function findStaffAccountByUsername(
  username: string
): Promise<StaffAccount | null> {
  const key = normalizeUsername(username);
  if (!key) return null;
  const accounts = await readStaffAccounts();
  return (
    accounts.find((account) => account.enabled && account.usernames.includes(key)) ||
    null
  );
}

export async function createStaffAccount(input: {
  username: string;
  aliases?: string[];
  name?: string;
  email: string;
  password: string;
}): Promise<StaffAccount> {
  const rawUsername = input.username.trim();
  const usernames = uniqueUsernames([rawUsername, ...(input.aliases || [])]);
  const username = usernames[0] || "";
  const name = (input.name || "").trim() || rawUsername;
  const email = (input.email || "").trim();
  const password = input.password;
  if (!username) throw new Error("Username is required");
  if (!email) throw new Error("Email is required");
  if (!password.trim()) throw new Error("Password is required");

  const accounts = await readStaffAccounts();
  const taken = new Set(accounts.flatMap((a) => a.usernames));
  const clash = usernames.find((u) => taken.has(u));
  if (clash) throw new Error(`Username "${clash}" is already in use`);

  const ts = nowIso();
  const account: StaffAccount = {
    id: `staff-${randomUUID()}`,
    usernames,
    name,
    email,
    password,
    enabled: true,
    protected: usernames.includes(normalizeUsername(ADMIN_USERNAME)),
    createdAt: ts,
    updatedAt: ts,
  };
  accounts.push(account);
  await persist(accounts);
  return account;
}

export async function updateStaffAccount(
  id: string,
  patch: {
    name?: string;
    email?: string;
    password?: string;
    enabled?: boolean;
    aliases?: string[];
  }
): Promise<StaffAccount | null> {
  const accounts = await readStaffAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const current = accounts[idx];

  if (current.protected && patch.enabled === false) {
    throw new Error("The primary admin account cannot be disabled");
  }

  let usernames = current.usernames;
  if (patch.aliases) {
    usernames = uniqueUsernames([current.usernames[0], ...patch.aliases]);
    if (current.protected && !usernames.includes(normalizeUsername(ADMIN_USERNAME))) {
      usernames = [normalizeUsername(ADMIN_USERNAME), ...usernames];
    }
    const taken = new Set(
      accounts.filter((a) => a.id !== id).flatMap((a) => a.usernames)
    );
    const clash = usernames.find((u) => taken.has(u));
    if (clash) throw new Error(`Username "${clash}" is already in use`);
  }

  const next: StaffAccount = {
    ...current,
    usernames,
    name: patch.name?.trim() || current.name,
    email: patch.email?.trim() || current.email,
    password:
      typeof patch.password === "string" && patch.password.trim()
        ? patch.password
        : current.password,
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    updatedAt: nowIso(),
  };
  accounts[idx] = next;
  await persist(accounts);
  return next;
}

export async function deleteStaffAccount(id: string): Promise<boolean> {
  const accounts = await readStaffAccounts();
  const current = accounts.find((a) => a.id === id);
  if (!current) return false;
  if (current.protected) throw new Error("The primary admin account cannot be deleted");
  await persist(accounts.filter((a) => a.id !== id));
  return true;
}
