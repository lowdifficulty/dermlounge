import "server-only";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionUser } from "./types";
import { ADMIN_EMAIL, ADMIN_USERNAME } from "./groomers";

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

export async function verifyPassword(password: string): Promise<boolean> {
  const plain = process.env.STAFF_PASSWORD ?? "1";
  return password === plain;
}

export async function loginAdmin(
  username: string,
  password: string
): Promise<SessionUser | null> {
  if (username.trim().toLowerCase() !== ADMIN_USERNAME.toLowerCase()) return null;
  if (!(await verifyPassword(password))) return null;
  return {
    role: "admin",
    email: ADMIN_EMAIL,
    name: "Admin",
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
