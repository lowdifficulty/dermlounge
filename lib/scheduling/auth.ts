import "server-only";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionUser } from "./types";
import { ADMIN_EMAIL, ADMIN_USERNAME } from "./groomers";

type StaffAccount = {
  usernames: string[];
  name: string;
  email: string;
  password: string;
};

function staffAccounts(): StaffAccount[] {
  const sharedPassword = process.env.STAFF_PASSWORD ?? "1";
  return [
    {
      usernames: [ADMIN_USERNAME.toLowerCase()],
      name: "Admin",
      email: ADMIN_EMAIL,
      password: sharedPassword,
    },
    {
      usernames: ["maeve", "meave"],
      name: "Maeve",
      email: ADMIN_EMAIL,
      password: "1",
    },
  ];
}

export interface SessionData {
  user?: SessionUser;
}

export function getSessionOptions() {
  const password =
    process.env.STAFF_SESSION_SECRET ??
    "dermlounge-staff-dev-secret-change-in-production";

  return {
    password,
    cookieName: "dl_staff_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 14,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

export async function loginAdmin(
  username: string,
  password: string
): Promise<SessionUser | null> {
  const key = username.trim().toLowerCase();
  const account = staffAccounts().find((entry) => entry.usernames.includes(key));
  if (!account || password !== account.password) return null;
  return {
    role: "admin",
    email: account.email,
    name: account.name,
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session.user || session.user.role !== "admin") {
    throw new Error("Unauthorized");
  }
  return session.user;
}

export async function requireStaff(): Promise<SessionUser> {
  return requireAdmin();
}
