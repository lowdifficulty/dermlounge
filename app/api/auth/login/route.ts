import { NextResponse } from "next/server";
import { getSession, loginAdmin } from "@/lib/scheduling/auth";
import { appendStaffLoginLog } from "@/lib/staff/login-log";

export async function POST(request: Request) {
  const body = await request.json();
  const { username, password } = body as {
    username?: string;
    password?: string;
  };

  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }
  if (!username?.trim()) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  const user = await loginAdmin(username, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await getSession();
  session.user = user;
  await session.save();

  appendStaffLoginLog({
    user,
    loginIdentifier: username.trim().toLowerCase(),
    request,
  }).catch((err) => {
    console.error("Staff login log failed:", err);
  });

  return NextResponse.json({ success: true, user });
}
