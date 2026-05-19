import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type CaptureEvent = {
  id: string;
  capturedAt: string;
  source: string;
  content: string;
  sensitivity: string;
};

type QuizQuestion = {
  id: string;
  question: string;
  answer: string;
  sourceEventIds: string[];
};

type QuizAttempt = {
  id: string;
  status: "quiz_ready" | "blocked";
  createdAt: string;
  reason: string;
  sourceEvents: CaptureEvent[];
  questions: QuizQuestion[];
};

type DebugSnapshot = {
  latestAttempt: QuizAttempt | null;
  events: CaptureEvent[];
  daemon: {
    running: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
    intervalMs: number;
  };
};

function App() {
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null);
  const [preloadError, setPreloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.mnemonic) {
      setPreloadError("Electron preload API is unavailable. Restart the app after rebuilding the preload script.");
      return;
    }

    window.mnemonic.getSnapshot().then(setSnapshot);
    return window.mnemonic.onSnapshotUpdated(setSnapshot);
  }, []);

  const attempt = snapshot?.latestAttempt ?? null;

  if (preloadError) {
    return (
      <main className="shell">
        <section className="panel preload-error">
          <p className="eyebrow">Startup issue</p>
          <h1>Preload did not load</h1>
          <p>{preloadError}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Mnemonic POC</p>
          <h1>Personal-context quiz daemon</h1>
          <p className="lede">
            Background capture, quiz readiness checks, generation reasoning, and native notifications in one
            inspectable loop.
          </p>
        </div>
        <DaemonCard snapshot={snapshot} />
      </section>

      <section className="grid">
        <article className="panel primary-panel">
          <div className="panel-heading">
            <p className="eyebrow">Latest attempt</p>
            <StatusBadge status={attempt?.status} />
          </div>
          {attempt ? <AttemptView attempt={attempt} /> : <EmptyState />}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Captured data</p>
            <span className="muted">{snapshot?.events.length ?? 0} snippets</span>
          </div>
          <EventList events={snapshot?.events ?? []} />
        </article>
      </section>
    </main>
  );
}

function DaemonCard({ snapshot }: { snapshot: DebugSnapshot | null }) {
  return (
    <aside className="daemon-card">
      <span className={snapshot?.daemon.running ? "pulse online" : "pulse"} />
      <div>
        <strong>{snapshot?.daemon.running ? "Daemon running" : "Daemon booting"}</strong>
        <p>Last run: {formatDate(snapshot?.daemon.lastRunAt)}</p>
        <p>Next run: {formatDate(snapshot?.daemon.nextRunAt)}</p>
      </div>
    </aside>
  );
}

function AttemptView({ attempt }: { attempt: QuizAttempt }) {
  if (attempt.status === "blocked") {
    return (
      <div className="blocked">
        <h2>Quiz not ready yet</h2>
        <p>{attempt.reason}</p>
        <SourceChips events={attempt.sourceEvents} />
      </div>
    );
  }

  return (
    <div className="questions">
      <p className="reason">{attempt.reason}</p>
      {attempt.questions.map((question, index) => (
        <div className="question-card" key={question.id}>
          <span>Question {index + 1}</span>
          <h2>{question.question}</h2>
          <p>{question.answer}</p>
        </div>
      ))}
    </div>
  );
}

function EventList({ events }: { events: CaptureEvent[] }) {
  if (events.length === 0) {
    return <p className="muted">Waiting for the first capture cycle.</p>;
  }

  return (
    <div className="event-list">
      {events.map((event) => (
        <div className="event-card" key={event.id}>
          <div>
            <strong>{event.source}</strong>
            <span>{formatDate(event.capturedAt)}</span>
          </div>
          <p>{event.content}</p>
          <small>Sensitivity: {event.sensitivity}</small>
        </div>
      ))}
    </div>
  );
}

function SourceChips({ events }: { events: CaptureEvent[] }) {
  if (events.length === 0) {
    return <p className="muted">No usable source snippets passed the current filters.</p>;
  }

  return (
    <div className="chips">
      {events.map((event) => (
        <span key={event.id}>{event.source}</span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status?: QuizAttempt["status"] }) {
  const label = status === "quiz_ready" ? "Quiz ready" : status === "blocked" ? "Blocked" : "Waiting";
  return <span className={`status ${status ?? "waiting"}`}>{label}</span>;
}

function EmptyState() {
  return (
    <div className="empty">
      <h2>Waiting for first daemon run</h2>
      <p>The background scheduler will collect mock context and attempt quiz generation shortly.</p>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return "not yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

createRoot(document.getElementById("root")!).render(<App />);
