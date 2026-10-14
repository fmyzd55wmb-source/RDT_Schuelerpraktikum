import { NextResponse } from "next/server";
import { deleteUser, findUserBySessionToken, getAdminUsers, SESSION_COOKIE } from "../../_lib/database";

function getCurrentUser(request: Request) {
  const token = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`))?.[1];
  return findUserBySessionToken(token);
}

export async function GET(request: Request) {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Adminrechte erforderlich." }, { status: 403 });
  return NextResponse.json({ users: getAdminUsers() });
}

export async function DELETE(request: Request) {
  const user = getCurrentUser(request);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Adminrechte erforderlich." }, { status: 403 });
  const body = await request.json().catch(() => null) as { userId?: unknown } | null;
  const userId = typeof body?.userId === "number" ? body.userId : Number(body?.userId);
  if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: "Ungültige Benutzer-ID." }, { status: 400 });
  deleteUser(userId);
  return NextResponse.json({ ok: true });
}
