import { NextResponse } from "next/server";
import { deleteSession, getSessionCookieOptions, SESSION_COOKIE } from "../../_lib/database";

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`))?.[1];
  deleteSession(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...getSessionCookieOptions(), maxAge: 0 });
  return response;
}
