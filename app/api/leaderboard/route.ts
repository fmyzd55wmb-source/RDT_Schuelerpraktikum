import { NextResponse } from "next/server";
import { findUserBySessionToken, getBestResult, getLeaderboard, getQuiz, getUserAttempts, SESSION_COOKIE } from "../_lib/database";

function getSessionToken(request: Request): string | undefined {
  return request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`))?.[1];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedQuizId = url.searchParams.get("quizId") ?? "quiz1";
  const view = url.searchParams.get("view") === "mine" ? "mine" : "global";
  if (!getQuiz(requestedQuizId)) return NextResponse.json({ error: "Quiz nicht gefunden." }, { status: 404 });
  const user = findUserBySessionToken(getSessionToken(request));
  if (view === "mine" && !user) return NextResponse.json({ error: "Bitte melde dich für deine Ergebnisse an." }, { status: 401 });

  if (view === "mine" && user) {
    const results = getUserAttempts(user.id, requestedQuizId).map((result) => ({ ...result, percentage: Math.round((result.correct / result.total) * 100) }));
    return NextResponse.json({ quizId: requestedQuizId, view, results, myResult: null });
  }

  const results = getLeaderboard(requestedQuizId).map((result, index) => ({ ...result, percentage: Math.round((result.correct / result.total) * 100), rank: index + 1 }));
  const ownResult = user ? getBestResult(user.id, requestedQuizId) : undefined;
  return NextResponse.json({ quizId: requestedQuizId, view, results, myResult: ownResult ? { ...ownResult, percentage: Math.round((ownResult.correct / ownResult.total) * 100) } : null });
}
