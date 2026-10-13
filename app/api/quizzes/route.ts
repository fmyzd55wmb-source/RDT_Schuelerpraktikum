import { NextResponse } from "next/server";
import {
  createQuiz,
  deleteQuiz,
  findUserBySessionToken,
  getQuiz,
  getQuizzes,
  SESSION_COOKIE,
  updateQuiz,
  type NewQuizQuestion,
  type QuizQuestionKind,
} from "../_lib/database";

function getSessionToken(request: Request): string | undefined {
  return request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`))?.[1];
}

function isQuestionKind(value: unknown): value is QuizQuestionKind {
  return value === "multiple-choice" || value === "text" || value === "number" || value === "true-false";
}

function readQuestions(value: unknown): { questions?: NewQuizQuestion[]; error?: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return { error: "Ein Quiz braucht 1 bis 50 Fragen." };
  const questions: NewQuizQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return { error: "Jede Frage braucht gültige Angaben." };
    const question = item as Record<string, unknown>;
    const kind = question.kind;
    const text = typeof question.question === "string" ? question.question.trim() : "";
    if (!isQuestionKind(kind) || !text || text.length > 500) return { error: "Jede Frage braucht Text und einen gültigen Fragetyp." };
    if (kind === "multiple-choice") {
      const answers = Array.isArray(question.answers) && question.answers.every((answer) => typeof answer === "string")
        ? question.answers.map((answer) => answer.trim())
        : [];
      const correctIndex = question.correctIndex;
      if (answers.length !== 4 || answers.some((answer) => !answer || answer.length > 300) || !Number.isInteger(correctIndex) || Number(correctIndex) < 0 || Number(correctIndex) > 3) {
        return { error: "Multiple-Choice-Fragen brauchen genau vier Antworten und eine richtige Antwort." };
      }
      questions.push({ kind, question: text, answers, correctIndex: Number(correctIndex) });
    } else if (kind === "text") {
      const expectedAnswer = typeof question.expectedAnswer === "string" ? question.expectedAnswer.trim() : "";
      if (!expectedAnswer || expectedAnswer.length > 300) return { error: "Lückentext-Fragen brauchen eine erwartete Antwort." };
      questions.push({ kind, question: text, expectedAnswer });
    } else if (kind === "true-false") {
      if (typeof question.expectedBoolean !== "boolean") return { error: "Wahr/Falsch-Fragen brauchen die Lösung Wahr oder Falsch." };
      questions.push({ kind, question: text, expectedBoolean: question.expectedBoolean });
    } else {
      const expectedNumber = question.expectedNumber;
      const unit = typeof question.unit === "string" ? question.unit.trim() : "";
      if (typeof expectedNumber !== "number" || !Number.isFinite(expectedNumber) || !unit || unit.length > 50) return { error: "Zahlfragen brauchen eine gültige Zahl und Einheit." };
      questions.push({ kind, question: text, expectedNumber, unit });
    }
  }
  return { questions };
}

function toClientQuiz(quiz: ReturnType<typeof getQuizzes>[number]) {
  if (!quiz.questions) return quiz;
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    questionCount: quiz.questionCount,
    isSystem: false,
    questions: quiz.questions.map((question) => {
      if (question.kind === "multiple-choice") {
        return {
          id: String(question.id),
          kind: question.kind,
          question: question.question,
          answers: (question.answers ?? []).map((text, index) => ({ text, correct: index === question.correctIndex })),
        };
      }
      if (question.kind === "text") {
        return {
          id: String(question.id),
          kind: question.kind,
          question: question.question,
          placeholder: "Deine Antwort",
          expectedAnswers: [question.expectedAnswer ?? ""],
          feedbackAnswer: question.expectedAnswer ?? "",
        };
      }
      if (question.kind === "true-false") {
        return {
          id: String(question.id),
          kind: question.kind,
          question: question.question,
          expectedBoolean: question.expectedBoolean ?? false,
        };
      }
      return {
        id: String(question.id),
        kind: question.kind,
        question: question.question,
        placeholder: "Zahl eingeben",
        expectedNumber: question.expectedNumber ?? 0,
        unit: question.unit ?? "",
        feedbackAnswer: `${question.expectedNumber ?? 0} ${question.unit ?? ""}`.trim(),
      };
    }),
  };
}

export async function GET() {
  return NextResponse.json({ quizzes: getQuizzes().map(toClientQuiz) });
}

export async function POST(request: Request) {
  const user = findUserBySessionToken(getSessionToken(request));
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Adminrechte erforderlich." }, { status: 403 });

  const body = await request.json().catch(() => null) as { title?: unknown; description?: unknown; questions?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!title || title.length > 100 || !description || description.length > 300) {
    return NextResponse.json({ error: "Titel und Beschreibung sind erforderlich (maximal 100 bzw. 300 Zeichen)." }, { status: 400 });
  }
  const parsed = readQuestions(body?.questions);
  if (!parsed.questions) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const quiz = createQuiz(title, description, parsed.questions, user.id);
    return NextResponse.json({ quiz: toClientQuiz(quiz) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Das Quiz konnte nicht gespeichert werden." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = findUserBySessionToken(getSessionToken(request));
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Adminrechte erforderlich." }, { status: 403 });

  const body = await request.json().catch(() => null) as { quizId?: unknown; title?: unknown; description?: unknown; questions?: unknown } | null;
  const quizId = typeof body?.quizId === "string" ? body.quizId : "";
  const current = quizId ? getQuiz(quizId) : undefined;
  if (!current) return NextResponse.json({ error: "Quiz nicht gefunden." }, { status: 404 });

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!title || title.length > 100 || !description || description.length > 300) {
    return NextResponse.json({ error: "Titel und Beschreibung sind erforderlich (maximal 100 bzw. 300 Zeichen)." }, { status: 400 });
  }
  const parsed = readQuestions(body?.questions);
  if (!parsed.questions) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const quiz = updateQuiz(quizId, title, description, parsed.questions);
    return quiz ? NextResponse.json({ quiz: toClientQuiz(quiz) }) : NextResponse.json({ error: "Quiz nicht gefunden." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Das Quiz konnte nicht gespeichert werden." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = findUserBySessionToken(getSessionToken(request));
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Adminrechte erforderlich." }, { status: 403 });

  const body = await request.json().catch(() => null) as { quizId?: unknown } | null;
  const quizIdFromBody = typeof body?.quizId === "string" ? body.quizId : "";
  const quizId = quizIdFromBody || new URL(request.url).searchParams.get("quizId") || "";
  const current = quizId ? getQuiz(quizId) : undefined;
  if (!current) return NextResponse.json({ error: "Quiz nicht gefunden." }, { status: 404 });
  if (!deleteQuiz(quizId)) return NextResponse.json({ error: "Das Quiz konnte nicht gelöscht werden." }, { status: 500 });
  return NextResponse.json({ ok: true, quizId });
}
