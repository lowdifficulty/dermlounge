import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/scheduling/auth";
import {
  deleteStaffAccount,
  toPublicStaffAccount,
  updateStaffAccount,
} from "@/lib/staff/accounts";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      enabled?: boolean;
      aliases?: string;
    };
    const aliases =
      typeof body.aliases === "string"
        ? body.aliases
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        : undefined;
    const account = await updateStaffAccount(id, {
      name: body.name,
      email: body.email,
      password: body.password,
      enabled: body.enabled,
      aliases,
    });
    if (!account) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, account: toPublicStaffAccount(account) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update login" },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const ok = await deleteStaffAccount(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete login" },
      { status: 400 }
    );
  }
}
