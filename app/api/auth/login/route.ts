import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  createSession,
  findUserByUsername,
  getSessionCookieOptions,
  SESSION_COOKIE,
} from "../../_lib/database";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const user = findUserByUsername(username.toLocaleLowerCase("de-DE"));

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "Benutzername oder Passwort ist nicht korrekt." }, { status: 401 });
  }

  const response = NextResponse.json({ user: { id: user.id, username: user.username, role: user.role } });
  response.cookies.set(SESSION_COOKIE, createSession(user.id), getSessionCookieOptions());
  return response;
}
