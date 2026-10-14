import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dataDirectory = path.join(process.cwd(), "data");
const databasePath = path.join(dataDirectory, "quiz.sqlite");
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

const globalForQuizDatabase = globalThis as typeof globalThis & {
  quizDatabase?: Database.Database;
};

function getDatabase(): Database.Database {
  if (!globalForQuizDatabase.quizDatabase) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    const database = new Database(databasePath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        username_normalized TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        best_correct INTEGER,
        best_total INTEGER,
        best_elapsed_ms INTEGER,
        best_completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
      CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        question_count INTEGER NOT NULL,
        is_system INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS quiz_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        kind TEXT NOT NULL,
        question TEXT NOT NULL,
        answers_json TEXT,
        correct_index INTEGER,
        expected_answer TEXT,
        expected_number REAL,
        unit TEXT,
        expected_boolean INTEGER,
        UNIQUE (quiz_id, position)
      );
      CREATE TABLE IF NOT EXISTS quiz_scores (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        quiz_id TEXT NOT NULL,
        best_correct INTEGER NOT NULL,
        best_total INTEGER NOT NULL,
        best_elapsed_ms INTEGER NOT NULL,
        best_completed_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, quiz_id)
      );
      CREATE INDEX IF NOT EXISTS quiz_scores_quiz_idx ON quiz_scores(quiz_id, best_correct, best_elapsed_ms);
      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        quiz_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        correct INTEGER NOT NULL,
        total INTEGER NOT NULL,
        elapsed_ms INTEGER NOT NULL,
        completed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS quiz_attempts_user_quiz_idx ON quiz_attempts(user_id, quiz_id, correct, elapsed_ms);
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    try {
      database.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
    } catch {
      // Bestehende Datenbanken haben die Spalte bereits.
    }
    try {
      database.exec("ALTER TABLE quiz_scores ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1");
    } catch {
      // Bestehende Datenbanken haben die Versuchs-Spalte bereits.
    }
    try {
      database.exec("ALTER TABLE quiz_questions ADD COLUMN expected_boolean INTEGER");
    } catch {
      // Bestehende Datenbanken haben die Wahr/Falsch-Spalte bereits.
    }
    try {
      database.exec("ALTER TABLE quizzes ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0");
    } catch {
      // Bestehende Datenbanken haben die Löschmarkierung bereits.
    }
    // Übernimmt alte Quiz-1-Highscores und zählt sie als mindestens einen Durchlauf.
    database.exec(`
      INSERT OR IGNORE INTO quiz_scores (user_id, quiz_id, best_correct, best_total, best_elapsed_ms, best_completed_at, attempts)
      SELECT id, 'quiz1', best_correct, best_total, best_elapsed_ms, best_completed_at, 1
      FROM users
      WHERE best_correct IS NOT NULL AND best_total IS NOT NULL
        AND best_elapsed_ms IS NOT NULL AND best_completed_at IS NOT NULL;
      UPDATE quiz_scores SET attempts = 1 WHERE attempts < 1;
    `);
    // Systemquizze bleiben in der Datenbank bekannt, obwohl ihre Fragen im Frontend gepflegt werden.
    database.exec(`
      INSERT OR IGNORE INTO quizzes (id, title, description, question_count, is_system, created_at)
      VALUES
        ('quiz1', 'Roche entdecken', 'Geschichte, Forschung und das Roche-Geschäft', 7, 1, '2026-01-01T00:00:00.000Z'),
        ('quiz2', 'Compliance bei Roche', 'Integrität, Datenschutz und Speak-up im Arbeitsalltag', 4, 1, '2026-01-01T00:00:00.000Z');
    `);
    // Für alte Scores ist nur der damalige Bestwert sicher bekannt; daraus wird ein historischer Versuch.
    const legacyMigration = database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("attempt-history-v1");
    if (!legacyMigration) {
      const migrateLegacyAttempts = database.transaction(() => {
        database.exec(`
          INSERT INTO quiz_attempts (user_id, quiz_id, attempt_number, correct, total, elapsed_ms, completed_at)
          SELECT user_id, quiz_id, 1, best_correct, best_total, best_elapsed_ms, best_completed_at
          FROM quiz_scores;
        `);
        database.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("attempt-history-v1", new Date().toISOString());
      });
      migrateLegacyAttempts();
    }
    globalForQuizDatabase.quizDatabase = database;
  }

  return globalForQuizDatabase.quizDatabase;
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const SESSION_COOKIE = "roche_quiz_session";

export type QuizId = string;
export type QuizQuestionKind = "multiple-choice" | "text" | "number" | "true-false";

export type StoredQuizQuestion = {
  id: number;
  kind: QuizQuestionKind;
  question: string;
  answers?: string[];
  correctIndex?: number;
  expectedAnswer?: string;
  expectedNumber?: number;
  unit?: string;
  expectedBoolean?: boolean;
};

export type QuizSummary = {
  id: QuizId;
  title: string;
  description: string;
  questionCount: number;
  isSystem: boolean;
  questions?: StoredQuizQuestion[];
};

export type BestResult = {
  id: number;
  username: string;
  quizId: QuizId;
  correct: number;
  total: number;
  elapsedMs: number;
  completedAt: string;
  attempts: number;
};

export type AttemptResult = {
  id: number;
  username: string;
  quizId: QuizId;
  correct: number;
  total: number;
  elapsedMs: number;
  completedAt: string;
  attemptNumber: number;
};

export function findUserByUsername(usernameNormalized: string): (User & { passwordHash: string }) | undefined {
  const row = getDatabase()
    .prepare("SELECT id, username, role, password_hash AS passwordHash FROM users WHERE username_normalized = ?")
    .get(usernameNormalized) as (User & { passwordHash: string }) | undefined;
  return row;
}

export type User = {
  id: number;
  username: string;
  role: "user" | "admin";
};

export function createUser(username: string, usernameNormalized: string, passwordHash: string): User {
  const result = getDatabase()
    .prepare("INSERT INTO users (username, username_normalized, password_hash) VALUES (?, ?, ?)")
    .run(username, usernameNormalized, passwordHash);
  return { id: Number(result.lastInsertRowid), username, role: "user" };
}

export function deleteUser(userId: number): void {
  getDatabase().prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export type AdminUser = {
  id: number;
  username: string;
  role: "user" | "admin";
  bestCorrect: number | null;
  bestTotal: number | null;
  bestElapsedMs: number | null;
  bestCompletedAt: string | null;
  attempts: number;
};

export function getAdminUsers(): AdminUser[] {
  return getDatabase().prepare(`
    SELECT users.id, users.username, users.role, score.best_correct AS bestCorrect,
      score.best_total AS bestTotal, score.best_elapsed_ms AS bestElapsedMs,
      score.best_completed_at AS bestCompletedAt, COALESCE(score.attempts, 0) AS attempts
    FROM users LEFT JOIN quiz_scores score
      ON score.user_id = users.id AND score.quiz_id = 'quiz1'
    ORDER BY users.username_normalized ASC
  `).all() as AdminUser[];
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString("hex");
  getDatabase()
    .prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
    .run(userId, hashSessionToken(token), Date.now() + sessionDurationMs);
  return token;
}

export function deleteSession(token?: string): void {
  if (!token) return;
  getDatabase().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
}

export function findUserBySessionToken(token?: string): User | undefined {
  if (!token) return undefined;
  const database = getDatabase();
  const row = database
    .prepare(`
      SELECT users.id, users.username, users.role, sessions.expires_at AS expiresAt
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
    `)
    .get(hashSessionToken(token)) as (User & { expiresAt: number }) | undefined;

  if (!row) return undefined;
  if (row.expiresAt <= Date.now()) {
    deleteSession(token);
    return undefined;
  }
  return { id: row.id, username: row.username, role: row.role };
}

function rowToQuestion(row: { id: number; kind: QuizQuestionKind; question: string; answersJson: string | null; correctIndex: number | null; expectedAnswer: string | null; expectedNumber: number | null; unit: string | null; expectedBoolean: number | null }): StoredQuizQuestion {
  return {
    id: row.id,
    kind: row.kind,
    question: row.question,
    ...(row.answersJson ? { answers: JSON.parse(row.answersJson) as string[], correctIndex: row.correctIndex ?? 0 } : {}),
    ...(row.expectedAnswer !== null ? { expectedAnswer: row.expectedAnswer } : {}),
    ...(row.expectedNumber !== null ? { expectedNumber: row.expectedNumber, unit: row.unit ?? "" } : {}),
    ...(row.expectedBoolean !== null ? { expectedBoolean: row.expectedBoolean === 1 } : {}),
  };
}

function getQuestionRows(quizId: QuizId) {
  return getDatabase().prepare(`
    SELECT id, kind, question, answers_json AS answersJson, correct_index AS correctIndex,
      expected_answer AS expectedAnswer, expected_number AS expectedNumber, unit, expected_boolean AS expectedBoolean
    FROM quiz_questions WHERE quiz_id = ? ORDER BY position ASC
  `).all(quizId) as Array<{ id: number; kind: QuizQuestionKind; question: string; answersJson: string | null; correctIndex: number | null; expectedAnswer: string | null; expectedNumber: number | null; unit: string | null; expectedBoolean: number | null }>;
}

export function getQuiz(quizId: QuizId): QuizSummary | undefined {
  const row = getDatabase().prepare(`
    SELECT id, title, description, question_count AS questionCount, is_system AS isSystem, is_deleted AS isDeleted
    FROM quizzes WHERE id = ?
  `).get(quizId) as { id: string; title: string; description: string; questionCount: number; isSystem: number; isDeleted: number } | undefined;
  if (!row || row.isDeleted === 1) return undefined;
  const storedQuestions = getQuestionRows(quizId).map(rowToQuestion);
  const questions = storedQuestions.length > 0 ? storedQuestions : undefined;
  return { id: row.id, title: row.title, description: row.description, questionCount: row.questionCount, isSystem: row.isSystem === 1, ...(questions ? { questions } : {}) };
}

export function getQuizzes(): QuizSummary[] {
  return getDatabase().prepare("SELECT id FROM quizzes WHERE is_deleted = 0 ORDER BY is_system DESC, created_at ASC, title COLLATE NOCASE ASC").all()
    .map((row) => getQuiz((row as { id: string }).id))
    .filter((quiz): quiz is QuizSummary => Boolean(quiz));
}

export type NewQuizQuestion = {
  kind: QuizQuestionKind;
  question: string;
  answers?: string[];
  correctIndex?: number;
  expectedAnswer?: string;
  expectedNumber?: number;
  unit?: string;
  expectedBoolean?: boolean;
};

function replaceQuizQuestions(database: Database.Database, quizId: QuizId, questions: NewQuizQuestion[]) {
  database.prepare("DELETE FROM quiz_questions WHERE quiz_id = ?").run(quizId);
  const insertQuestion = database.prepare(`
    INSERT INTO quiz_questions (quiz_id, position, kind, question, answers_json, correct_index, expected_answer, expected_number, unit, expected_boolean)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  questions.forEach((item, index) => insertQuestion.run(
    quizId,
    index,
    item.kind,
    item.question,
    item.answers ? JSON.stringify(item.answers) : null,
    item.correctIndex ?? null,
    item.expectedAnswer ?? null,
    item.expectedNumber ?? null,
    item.unit ?? null,
    typeof item.expectedBoolean === "boolean" ? (item.expectedBoolean ? 1 : 0) : null,
  ));
}

export function createQuiz(title: string, description: string, questions: NewQuizQuestion[], createdBy: number): QuizSummary {
  const database = getDatabase();
  const id = `quiz-${randomBytes(8).toString("hex")}`;
  const createdAt = new Date().toISOString();
  const transaction = database.transaction(() => {
    database.prepare(`
      INSERT INTO quizzes (id, title, description, question_count, is_system, created_by, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(id, title, description, questions.length, createdBy, createdAt);
    replaceQuizQuestions(database, id, questions);
  });
  transaction();
  const quiz = getQuiz(id);
  if (!quiz) throw new Error("QUIZ_NOT_FOUND");
  return quiz;
}

export function updateQuiz(quizId: QuizId, title: string, description: string, questions: NewQuizQuestion[]): QuizSummary | undefined {
  const database = getDatabase();
  const current = getQuiz(quizId);
  if (!current) return undefined;
  const transaction = database.transaction(() => {
    database.prepare("UPDATE quizzes SET title = ?, description = ?, question_count = ? WHERE id = ? AND is_deleted = 0")
      .run(title, description, questions.length, quizId);
    replaceQuizQuestions(database, quizId, questions);
  });
  transaction();
  return getQuiz(quizId);
}

export function deleteQuiz(quizId: QuizId): boolean {
  const database = getDatabase();
  const current = getQuiz(quizId);
  if (!current) return false;
  const transaction = database.transaction(() => {
    database.prepare("DELETE FROM quiz_attempts WHERE quiz_id = ?").run(quizId);
    database.prepare("DELETE FROM quiz_scores WHERE quiz_id = ?").run(quizId);
    if (current.isSystem) {
      database.prepare("DELETE FROM quiz_questions WHERE quiz_id = ?").run(quizId);
      database.prepare("UPDATE quizzes SET is_deleted = 1 WHERE id = ?").run(quizId);
    } else {
      database.prepare("DELETE FROM quizzes WHERE id = ? AND is_deleted = 0").run(quizId);
    }
  });
  transaction();
  return !getQuiz(quizId);
}

function readBestResult(userId: number, quizId: QuizId): BestResult | undefined {
  return getDatabase().prepare(`
    SELECT users.id, users.username, scores.quiz_id AS quizId, scores.best_correct AS correct,
      scores.best_total AS total, scores.best_elapsed_ms AS elapsedMs,
      scores.best_completed_at AS completedAt, scores.attempts AS attempts
    FROM quiz_scores scores JOIN users ON users.id = scores.user_id
    WHERE scores.user_id = ? AND scores.quiz_id = ?
  `).get(userId, quizId) as BestResult | undefined;
}

export function getBestResult(userId: number, quizId: QuizId): BestResult | undefined {
  return readBestResult(userId, quizId);
}

export function getUserAttempts(userId: number, quizId: QuizId): AttemptResult[] {
  return getDatabase().prepare(`
    SELECT attempts.id, users.username, attempts.quiz_id AS quizId, attempts.correct,
      attempts.total, attempts.elapsed_ms AS elapsedMs, attempts.completed_at AS completedAt,
      attempts.attempt_number AS attemptNumber
    FROM quiz_attempts attempts JOIN users ON users.id = attempts.user_id
    WHERE attempts.user_id = ? AND attempts.quiz_id = ?
    ORDER BY attempts.correct DESC, attempts.elapsed_ms ASC, attempts.attempt_number ASC
  `).all(userId, quizId) as AttemptResult[];
}

export function saveBestResult(userId: number, quizId: QuizId, correct: number, total: number, elapsedMs: number): { result: BestResult; isNewBest: boolean } {
  const database = getDatabase();
  const user = database.prepare("SELECT id FROM users WHERE id = ?").get(userId) as { id: number } | undefined;
  if (!user) throw new Error("USER_NOT_FOUND");

  const existing = readBestResult(userId, quizId);
  const isNewBest = !existing || correct > existing.correct || (correct === existing.correct && elapsedMs < existing.elapsedMs);
  const completedAt = new Date().toISOString();
  const transaction = database.transaction(() => {
    const nextAttempt = database.prepare("SELECT COALESCE(MAX(attempt_number), 0) + 1 AS nextAttempt FROM quiz_attempts WHERE user_id = ? AND quiz_id = ?").get(userId, quizId) as { nextAttempt: number };
    database.prepare(`
      INSERT INTO quiz_attempts (user_id, quiz_id, attempt_number, correct, total, elapsed_ms, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, quizId, nextAttempt.nextAttempt, correct, total, elapsedMs, completedAt);
    if (!existing) {
      database.prepare(`
        INSERT INTO quiz_scores (user_id, quiz_id, best_correct, best_total, best_elapsed_ms, best_completed_at, attempts)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(userId, quizId, correct, total, elapsedMs, completedAt);
    } else if (isNewBest) {
      database.prepare(`
        UPDATE quiz_scores SET best_correct = ?, best_total = ?, best_elapsed_ms = ?, best_completed_at = ?, attempts = attempts + 1
        WHERE user_id = ? AND quiz_id = ?
      `).run(correct, total, elapsedMs, completedAt, userId, quizId);
    } else {
      database.prepare("UPDATE quiz_scores SET attempts = attempts + 1 WHERE user_id = ? AND quiz_id = ?").run(userId, quizId);
    }
    // Die alten Spalten bleiben für bestehende Admin-Ansichten von Quiz 1 synchron.
    if (quizId === "quiz1" && isNewBest) {
      database.prepare(`
        UPDATE users SET best_correct = ?, best_total = ?, best_elapsed_ms = ?, best_completed_at = ?
        WHERE id = ?
      `).run(correct, total, elapsedMs, completedAt, userId);
    }
  });
  transaction();

  const result = readBestResult(userId, quizId);
  if (!result) throw new Error("RESULT_NOT_FOUND");
  return { result, isNewBest };
}

export function getLeaderboard(quizId: QuizId): BestResult[] {
  return getDatabase()
    .prepare(`
      SELECT users.id, users.username, scores.quiz_id AS quizId, scores.best_correct AS correct,
        scores.best_total AS total, scores.best_elapsed_ms AS elapsedMs,
        scores.best_completed_at AS completedAt, scores.attempts AS attempts
      FROM quiz_scores scores JOIN users ON users.id = scores.user_id
      WHERE scores.quiz_id = ?
      ORDER BY scores.best_correct DESC, scores.best_elapsed_ms ASC, users.username_normalized ASC
      LIMIT 100
    `)
    .all(quizId) as BestResult[];
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(sessionDurationMs / 1000),
  };
}
