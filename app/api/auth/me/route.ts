import { NextResponse } from "next/server";
import { findUserBySessionToken, SESSION_COOKIE } from "../../_lib/database";

export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`))?.[1];
  const user = findUserBySessionToken(token);
  return NextResponse.json({ user: user ?? null });
}
