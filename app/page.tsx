"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

// Jede Antwort kennt ihren Text und ob sie die richtige Lösung ist.
type Answer = { text: string; correct: boolean };
// Eine Frage besteht aus dem Fragetext und genau vier Antworten.
type Question = { question: string; answers: Answer[] };

// Die Fragen orientieren sich an den Informationen der offiziellen Roche-Website.
const questions: Question[] = [
  { question: "Wann und wo wurde Roche gegründet?", answers: [{ text: "1896 in der Schweiz", correct: true }, { text: "1925 in Deutschland", correct: false }, { text: "2001 in den USA", correct: false }, { text: "1880 in Frankreich", correct: false }] },
  { question: "Welche beiden Bereiche bilden das Roche-Geschäft?", answers: [{ text: "Diagnostik und Pharma", correct: true }, { text: "Tourismus und Logistik", correct: false }, { text: "Software und Bauwesen", correct: false }, { text: "Ernährung und Sport", correct: false }] },
  { question: "Was möchte Roche für Patient:innen erreichen?", answers: [{ text: "Krankheiten verhindern, stoppen und heilen", correct: true }, { text: "Nur bestehende Produkte verkaufen", correct: false }, { text: "Gesundheitsdaten sammeln, ohne sie auszuwerten", correct: false }, { text: "Ausschließlich Krankenhäuser bauen", correct: false }] },
  { question: "In welchen Bereichen forscht Roche unter anderem?", answers: [{ text: "Onkologie, Neurologie sowie Herz-Kreislauf- und Stoffwechselerkrankungen", correct: true }, { text: "Nur in der Raumfahrt", correct: false }, { text: "Ausschließlich in der Landwirtschaft", correct: false }, { text: "Nur in der Unterhaltungselektronik", correct: false }] },
  { question: "Warum sind Diagnostik und Früherkennung wichtig?", answers: [{ text: "Erkrankungen können früher verstanden und passende Behandlungen schneller gefunden werden", correct: true }, { text: "Damit Medikamente nicht geprüft werden müssen", correct: false }, { text: "Damit Forschung überflüssig wird", correct: false }, { text: "Nur um Papier zu sparen", correct: false }] },
  { question: "Was bedeutet der kombinierte Ansatz von Roche?", answers: [{ text: "Diagnostik, digitale Lösungen und Medikamente gemeinsam an den Bedürfnissen von Patient:innen auszurichten", correct: true }, { text: "Nur Medikamente ohne Tests zu entwickeln", correct: false }, { text: "Alle Produkte identisch zu machen", correct: false }, { text: "Forschung durch Werbung zu ersetzen", correct: false }] },
  { question: "Was unterstützt laut Roche den langfristigen Erfolg?", answers: [{ text: "Innovation, gute Abläufe, engagierte Mitarbeitende und Nachhaltigkeit", correct: true }, { text: "Stillstand und möglichst wenige Ideen", correct: false }, { text: "Arbeiten ohne Qualitätsstandards", correct: false }, { text: "Nur schnelle Entscheidungen ohne Prüfung", correct: false }] },
];

// Beim Start werden sowohl die Fragen als auch die Antworten gemischt.
function createQuiz() { return shuffle(questions).map((question) => ({ ...question, answers: shuffle(question.answers) })); }

// Die vier Farben und Buchstaben werden der Antwortposition zugeordnet.
const answerColors = ["blue", "coral", "yellow", "green"];
const answerLetters = ["A", "B", "C", "D"];
// Eine einfache Zufallsfunktion sorgt für eine neue Reihenfolge pro Quiz.
function shuffle<T>(items: T[]) { return [...items].sort(() => Math.random() - 0.5); }

export default function Home() {
  const [name, setName] = useState("");
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  // Diese Werte steuern den aktuellen Stand des Quiz.
  const [quizQuestions, setQuizQuestions] = useState(() => createQuiz());
  const progress = useMemo(() => ((current + (selected !== null ? 1 : 0)) / quizQuestions.length) * 100, [current, selected, quizQuestions.length]);
  const finished = started && current >= quizQuestions.length;

  // Startet ein neues Quiz nur, wenn ein Name eingegeben wurde.
  function startQuiz(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setQuizQuestions(createQuiz()); setCurrent(0); setScore(0); setSelected(null); setStarted(true);
  }
  // Nach einer Auswahl wird die Antwort gesperrt und der Punkt gezählt.
  function chooseAnswer(answerIndex: number) {
    if (selected !== null) return;
    setSelected(answerIndex);
    if (quizQuestions[current].answers[answerIndex].correct) setScore((value) => value + 1);
  }
  function nextQuestion() { setSelected(null); setCurrent((value) => value + 1); }
  function restart() { setStarted(false); setName(""); setSelected(null); setCurrent(0); setScore(0); }

  const question = quizQuestions[current];
  // Je nach Status wird Startseite, Frage oder Ergebnis angezeigt.
  return (
    <main className="site-shell">
      <header className="topbar">
        <div className="brand" aria-label="Roche"><Image className="roche-logo" src="/roche-logo.png" alt="Roche" width={150} height={43} priority /><span className="brand-divider" /><span className="brand-subtitle">DIAGNOSTICS &amp; PHARMA</span></div>
        <div className="header-note">Wissenstest <span className="status-dot" /></div>
      </header>
      <section className="content-wrap">
        {!started && <section className="intro-card">
          <div className="intro-copy"><p className="eyebrow">Roche Wissenstest</p><h1>Doing now what patients <em>need next.</em></h1><p className="intro-text">Wie gut kennst du Roche? Entdecke die Geschichte, Forschung und Ideen hinter einem weltweit tätigen Gesundheitsunternehmen.</p><div className="intro-meta"><span>07 Fragen</span><span>·</span><span>ca. 1 Minute</span></div></div>
          <form className="start-form" onSubmit={startQuiz}><label htmlFor="name">Wie heißt du?</label><input id="name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Dein Vorname" maxLength={40} autoComplete="given-name" required /><button className="primary-button" type="submit">Test starten <span aria-hidden="true">→</span></button><small>Keine Anmeldung nötig.</small></form>
          <div className="accent-shape accent-one" aria-hidden="true" /><div className="accent-shape accent-two" aria-hidden="true" /><div className="accent-shape accent-three" aria-hidden="true" />
        </section>}
        {started && !finished && <section className="quiz-card">
          <div className="quiz-heading"><div><p className="eyebrow">Roche Wissenstest · {name.trim()}</p><h1>Deine nächste Frage</h1></div><div className="question-count"><strong>{String(current + 1).padStart(2, "0")}</strong><span>/ {String(quizQuestions.length).padStart(2, "0")}</span></div></div>
          <div className="progress-track" aria-label={`Fortschritt: ${Math.round(progress)} Prozent`}><span style={{ width: `${progress}%` }} /></div><p className="question-text">{question.question}</p>
          <div className="answers" role="group" aria-label="Antwortmöglichkeiten">{question.answers.map((answer, index) => { const isSelected = selected === index; const isCorrect = question.answers[index].correct; const stateClass = selected === null ? "" : isCorrect ? "correct" : isSelected ? "wrong" : "muted"; return <button key={answer.text} className={`answer answer-${answerColors[index]} ${stateClass}`} onClick={() => chooseAnswer(index)} disabled={selected !== null}><span className="answer-letter">{answerLetters[index]}</span><span>{answer.text}</span>{selected !== null && isCorrect && <span className="answer-icon">✓</span>}{selected !== null && isSelected && !isCorrect && <span className="answer-icon">×</span>}</button>; })}</div>
          <div className="quiz-footer"><span>{selected === null ? "Wähle eine Antwort aus" : question.answers[selected].correct ? "Richtig! Stark gemacht." : "Nicht ganz – die markierte Antwort ist richtig."}</span>{selected !== null && <button className="next-button" onClick={nextQuestion}>{current === quizQuestions.length - 1 ? "Ergebnis ansehen" : "Nächste Frage"} <span>→</span></button>}</div>
        </section>}
        {finished && <section className="result-card"><p className="eyebrow">Wissenstest abgeschlossen</p><div className="score-summary"><strong>{score}<small>/ {quizQuestions.length}</small></strong><span>richtige Antworten</span></div><h1>Danke, {name.trim()}!</h1><p className="result-copy">Du hast {score} von {quizQuestions.length} Roche-Fragen richtig beantwortet.</p><div className="score-dots" aria-label={`${score} von ${quizQuestions.length} Fragen richtig`}>{quizQuestions.map((item, index) => <span key={item.question} className={index < score ? "filled" : ""} />)}</div><button className="primary-button" onClick={restart}>Nochmal starten <span>↻</span></button></section>}
      </section>
      <footer className="page-footer"><span>Roche Wissenstest</span><a href="https://www.roche.com" target="_blank" rel="noreferrer">roche.com ↗</a><span>Doing now what patients need next.</span></footer>
    </main>
  );
}
