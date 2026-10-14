import { NextResponse } from "next/server";
import {
  findUserBySessionToken,
  getLeaderboard,
  getQuiz,
  saveBestResult,
  SESSION_COOKIE,
} from "../../_lib/database";

function getSessionToken(request: Request): string | undefined {
  return request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`))?.[1];
}

export async function POST(request: Request) {
  const user = findUserBySessionToken(getSessionToken(request));
  if (!user) return NextResponse.json({ error: "Bitte melde dich zuerst an." }, { status: 401 });

  const body = await request.json().catch(() => null) as { quizId?: unknown; correct?: unknown; total?: unknown; elapsedMs?: unknown } | null;
  const quizId = typeof body?.quizId === "string" ? body.quizId : "";
  const quiz = quizId ? getQuiz(quizId) : undefined;
  const correct = body?.correct;
  const total = body?.total;
  const elapsedMs = body?.elapsedMs;
  if (
    !quiz
    || total !== quiz.questionCount
    || !Number.isInteger(correct)
    || !Number.isInteger(elapsedMs)
    || Number(correct) < 0
    || Number(correct) > quiz.questionCount
    || Number(elapsedMs) < 0
    || Number(elapsedMs) > 24 * 60 * 60 * 1000
  ) {
    return NextResponse.json({ error: "Ungültiges Ergebnis." }, { status: 400 });
  }

  try {
    const saved = saveBestResult(user.id, quizId, Number(correct), quiz.questionCount, Number(elapsedMs));
    const ranking = getLeaderboard(quizId).map((result, index) => ({ ...result, percentage: Math.round((result.correct / result.total) * 100), rank: index + 1 }));
    const currentRanking = ranking.find((result) => result.id === user.id);
    return NextResponse.json({ isNewBest: saved.isNewBest, result: saved.result, rank: currentRanking?.rank ?? null, leaderboard: ranking });
  } catch {
    return NextResponse.json({ error: "Das Ergebnis konnte nicht gespeichert werden." }, { status: 500 });
  }
}
