import { NextResponse } from "next/server";
import { getSession, loginAdmin } from "@/lib/scheduling/auth";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { username, password } = body;

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

  return NextResponse.json({ success: true, user });
}
