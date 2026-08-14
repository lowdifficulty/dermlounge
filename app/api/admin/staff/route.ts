import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import {
  createStaffAccount,
  readStaffAccounts,
  toPublicStaffAccount,
} from "@/lib/staff/accounts";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await readStaffAccounts();
  return NextResponse.json({
    accounts: accounts.map(toPublicStaffAccount),
  });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      username?: string;
      email?: string;
      password?: string;
    };
    const account = await createStaffAccount({
      username: body.username || "",
      email: body.email || "",
      password: body.password || "",
    });
    return NextResponse.json({ ok: true, account: toPublicStaffAccount(account) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create login" },
      { status: 400 }
    );
  }
}
