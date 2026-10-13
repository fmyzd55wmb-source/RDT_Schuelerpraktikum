import { NextResponse } from "next/server";
import { deleteSession, deleteUser, findUserBySessionToken, SESSION_COOKIE } from "../../_lib/database";

export async function DELETE(request: Request) {
  const token = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`))?.[1];
  const user = findUserBySessionToken(token);
  if (!user) return NextResponse.json({ error: "Bitte melde dich zuerst an." }, { status: 401 });

  deleteUser(user.id);
  deleteSession(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
