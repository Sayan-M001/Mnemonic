import { useEffect, useMemo, useState } from "react";
import type { DebugSnapshot, QuizAttempt } from "../../../../shared/types";

interface QuizPopupProps {
  snapshot: DebugSnapshot | null;
}

export function QuizPopup({ snapshot }: QuizPopupProps) {
  const attempt = snapshot?.latestAttempt ?? null;

  useEffect(() => {
    // Override body and document styling for transparent frameless overlay sidebar
    const origBodyBg = document.body.style.background;
    const origHtmlBg = document.documentElement.style.background;
    const origBodyMinHeight = document.body.style.minHeight;

    document.body.style.setProperty("background", "transparent", "important");
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.body.style.setProperty("min-height", "auto", "important");

    return () => {
      document.body.style.background = origBodyBg;
      document.documentElement.style.background = origHtmlBg;
      document.body.style.minHeight = origBodyMinHeight;
    };
  }, []);

  if (!attempt || attempt.status !== "quiz_ready") {
    return (
      <EmptyPopup
        onClose={() => void window.mnemonic.closeCurrentWindow()}
      />
    );
  }

  return (
    <CompactQuizPopup
      attempt={attempt}
      onSnooze={() => void window.mnemonic.snoozeQuizPopup(attempt.id)}
      onComplete={() => void window.mnemonic.completeQuizPopup(attempt.id)}
      onClose={() => void window.mnemonic.closeCurrentWindow()}
    />
  );
}

function EmptyPopup({ onClose }: { onClose: () => void }) {
  return (
    <main className="min-h-screen w-full bg-transparent flex justify-end overflow-hidden select-none">
      <div
        className="w-full h-screen bg-[#1c1c1e]/20 border-l border-white/10 shadow-2xl flex flex-col justify-between px-6 py-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] font-bold text-white/90 uppercase tracking-wider">Mnemonic</div>
            <div className="text-[11px] text-white/50 mt-1">No quiz ready</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/[0.12] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </main>
  );
}

function CompactQuizPopup({
  attempt,
  onSnooze,
  onComplete,
  onClose
}: {
  attempt: QuizAttempt;
  onSnooze: () => void;
  onComplete: () => void;
  onClose: () => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { selected: string; correct: boolean }>>({});
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    setCurrentIdx(0);
    setAnswers({});
    setFinished(false);
  }, [attempt.id]);

  const currentQuestion = attempt.questions[currentIdx];
  const currentOptions = useMemo(() => {
    const options = currentQuestion?.options?.filter(Boolean) ?? [];
    if (currentQuestion && !options.includes(currentQuestion.answer)) {
      options.push(currentQuestion.answer);
    }
    while (options.length < 4 && currentQuestion) {
      options.push(`Choice ${options.length + 1}`);
    }
    return options.slice(0, 4);
  }, [currentQuestion]);

  const answerState = currentQuestion ? answers[currentQuestion.id] : undefined;
  const correctCount = Object.values(answers).filter((entry) => entry.correct).length;

  const onSelect = (option: string) => {
    if (!currentQuestion || answerState) {
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        selected: option,
        correct: option.trim() === currentQuestion.answer.trim()
      }
    }));
  };

  const onNext = () => {
    if (currentIdx < attempt.questions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setFinished(true);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSnooze();
        return;
      }

      if (!answerState) {
        const digit = Number.parseInt(event.key, 10);
        if (Number.isInteger(digit) && digit >= 1 && digit <= currentOptions.length) {
          event.preventDefault();
          onSelect(currentOptions[digit - 1]);
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [answerState, currentOptions, attempt.id]);

  if (!currentQuestion) {
    return <EmptyPopup onClose={onClose} />;
  }

  if (finished) {
    return (
      <main className="min-h-screen w-full bg-transparent flex justify-end overflow-hidden select-none">
        <div
          className="w-full h-screen bg-[#1c1c1e]/20 border-l border-white/10 shadow-2xl flex flex-col justify-between px-6 py-6"
        >
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Mnemonic Quiz</div>
              <button
                type="button"
                onClick={onComplete}
                className="rounded-lg bg-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-white/75 hover:bg-white/[0.12] transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
            
            <div className="mt-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-[20px] font-bold text-white/95">Quiz Completed</h2>
              <p className="text-[12px] text-white/55 mt-2">
                You got <span className="font-semibold text-emerald-400">{correctCount}</span> out of{" "}
                <span className="font-semibold text-white/80">{attempt.questions.length}</span> correct!
              </p>
              
              <div className="mt-8 w-full bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                <div className="text-[28px] font-extrabold text-white/95 tracking-tight">
                  {Math.round((correctCount / attempt.questions.length) * 100)}%
                </div>
                <div className="text-[10px] text-white/40 uppercase font-black tracking-wider mt-1">Accuracy Score</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={() => {
                void window.mnemonic.openDashboardWindow();
                onComplete();
              }}
              className="text-[11px] font-medium text-white/50 hover:text-white/80 transition-colors cursor-pointer"
            >
              View history
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="rounded-lg bg-white text-[#1c1c1e] px-4 py-2 text-[11px] font-bold hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-transparent flex justify-end overflow-hidden select-none">
      <div
        className="w-full h-screen bg-[#1c1c1e]/20 border-l border-white/10 shadow-2xl flex flex-col px-6 py-6"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
            Question {currentIdx + 1} of {attempt.questions.length}
          </div>
          <button
            type="button"
            onClick={onSnooze}
            className="rounded-lg bg-white/[0.08] px-2.5 py-1 text-[10px] font-semibold text-white/75 hover:bg-white/[0.12] transition-colors cursor-pointer"
          >
            Later
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mt-3.5 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#eb7f4b] transition-all duration-300 rounded-full"
            style={{ width: `${((currentIdx + 1) / attempt.questions.length) * 100}%` }}
          />
        </div>

        {/* Question Text */}
        <div className="mt-8 text-[15px] leading-relaxed font-semibold text-white/95 select-text">
          {currentQuestion.question}
        </div>

        {/* Options */}
        <div className="mt-8 flex-grow flex flex-col gap-3">
          {currentOptions.map((option, index) => {
            const isSelected = answerState?.selected === option;
            const isCorrect = option.trim() === currentQuestion.answer.trim();

            let classes =
              "w-full rounded-2xl px-4 py-4 text-left text-[12px] font-semibold transition-all cursor-pointer bg-white/[0.03] border border-white/5 text-white/80 hover:bg-white/[0.06] hover:border-white/10 active:scale-[0.99] flex items-center justify-between gap-3 min-h-[58px]";

            let feedbackIcon = null;

            if (answerState) {
              if (isCorrect) {
                classes =
                  "w-full rounded-2xl px-4 py-4 text-left text-[12px] font-bold transition-all bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-between gap-3 min-h-[58px]";
                feedbackIcon = (
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                );
              } else if (isSelected) {
                classes =
                  "w-full rounded-2xl px-4 py-4 text-left text-[12px] font-bold transition-all bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-between gap-3 min-h-[58px]";
                feedbackIcon = (
                  <svg className="w-4 h-4 text-rose-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                );
              } else {
                classes =
                  "w-full rounded-2xl px-4 py-4 text-left text-[12px] font-medium transition-all bg-neutral-900/30 border border-white/[0.02] text-neutral-500 opacity-40 flex items-center justify-between gap-3 min-h-[58px] cursor-not-allowed";
              }
            }

            return (
              <button
                key={option}
                type="button"
                disabled={Boolean(answerState)}
                onClick={() => onSelect(option)}
                className={classes}
              >
                <span className="flex-grow select-text text-wrap text-left leading-normal">{option}</span>
                {feedbackIcon}
                {!answerState && (
                  <span className="text-[10px] text-white/30 font-bold px-1.5 py-0.5 rounded bg-white/5 border border-white/5 flex-shrink-0">
                    {index + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between gap-3">
          <div className="text-[10px] font-bold text-white/30 tracking-wider">
            {!answerState ? "Press 1-4 to select" : "Press Enter for next"}
          </div>
          <button
            type="button"
            disabled={!answerState}
            onClick={onNext}
            className="rounded-xl bg-[#eb7f4b] text-white px-5 py-2.5 text-[11px] font-black hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shadow-md shadow-[#eb7f4b]/20 flex items-center gap-1.5"
          >
            <span>{currentIdx === attempt.questions.length - 1 ? "Finish" : "Next"}</span>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </main>
  );
}
