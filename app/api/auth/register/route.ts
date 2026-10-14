import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  createSession,
  createUser,
  findUserByUsername,
  getSessionCookieOptions,
  SESSION_COOKIE,
} from "../../_lib/database";

const passwordPattern = /^(?=.*\d)(?=.*[A-Z])(?=.*[a-z])(?=.*[^A-Za-z0-9]).{12,}$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || username.length > 25) {
    return NextResponse.json({ error: "Der Benutzername muss 1 bis 25 Zeichen lang sein." }, { status: 400 });
  }
  if (!passwordPattern.test(password)) {
    return NextResponse.json({ error: "Das Passwort braucht mindestens 12 Zeichen, eine Zahl, einen Groß- und Kleinbuchstaben sowie ein Sonderzeichen." }, { status: 400 });
  }

  const usernameNormalized = username.toLocaleLowerCase("de-DE");
  if (findUserByUsername(usernameNormalized)) {
    return NextResponse.json({ error: "Dieser Benutzername ist bereits vergeben." }, { status: 409 });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = createUser(username, usernameNormalized, passwordHash);
    const response = NextResponse.json({ user: { ...user, role: "user" } }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, createSession(user.id), getSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: "Die Registrierung konnte nicht abgeschlossen werden." }, { status: 500 });
  }
}
