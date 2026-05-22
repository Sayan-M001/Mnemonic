import { useState, useEffect } from "react";
import type { DebugSnapshot, QuizAttempt, QuizQuestion, CaptureEvent, ActivitySegment } from "../../../../shared/types";

interface QuizViewProps {
  snapshot: DebugSnapshot | null;
}

export function QuizView({ snapshot }: QuizViewProps) {
  const attempt = snapshot?.latestAttempt ?? null;

  if (!attempt || attempt.status === "blocked") {
    return <QuizBlockedView attempt={attempt} snapshot={snapshot} />;
  }

  return <ActiveQuizSession attempt={attempt} snapshot={snapshot} />;
}

// Blocked screen when not enough segments or generation fails
function QuizBlockedView({ attempt, snapshot }: { attempt: QuizAttempt | null; snapshot: DebugSnapshot | null }) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const events = attempt?.sourceEvents ?? [];
  const segments = attempt?.sourceSegments ?? [];

  const handleForceGenerate = async () => {
    setIsRegenerating(true);
    setErrorMsg(null);
    try {
      await window.mnemonic.forceQuizCycle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to force quiz generation");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto max-h-full items-center justify-center select-text">
      <div className="max-w-xl w-full bg-white/[0.02] border border-white/5 rounded-3xl p-8 shadow-xl text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-serif font-black text-white">Quiz is not ready yet</h2>
          <p className="text-neutral-400 text-xs font-semibold mt-2.5 leading-relaxed">
            {attempt?.reason || "Daemon is processing captured event streams. Complete a few more activity cycles to trigger a quiz."}
          </p>
        </div>

        {attempt?.generation && (
          <div className="bg-neutral-900/50 border border-white/5 rounded-2xl p-3.5 text-left text-[11px] font-semibold text-neutral-400 space-y-1">
            <div className="flex justify-between">
              <span>Generator Engine:</span>
              <span className="text-neutral-200">{attempt.generation.source} ({attempt.generation.model || "Local heuristic"})</span>
            </div>
            <div className="flex justify-between">
              <span>Engine Status:</span>
              <span className="text-rose-400">Blocked</span>
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={isRegenerating}
          onClick={handleForceGenerate}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-black cursor-pointer text-center bg-[#eb7f4b] text-white hover:opacity-95 shadow-md shadow-[#eb7f4b]/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isRegenerating ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Generating Quiz...</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span>Generate Quiz Now</span>
            </>
          )}
        </button>

        {errorMsg && (
          <p className="text-rose-400 text-[10px] font-bold mt-1 text-center">
            {errorMsg}
          </p>
        )}

        {(segments.length > 0 || events.length > 0) && (
          <div className="text-left space-y-3.5 pt-4 border-t border-white/5">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">
              Evaluated timeline context
            </h4>
            
            {segments.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[9px] text-neutral-400 font-bold block">Activity Segments analyzed:</span>
                <div className="flex flex-wrap gap-1.5">
                  {segments.map((seg) => (
                    <span key={seg.id} className="bg-neutral-900 border border-white/5 text-neutral-300 px-2 py-0.5 rounded text-[10px] font-bold">
                      {seg.title || seg.surfaceType}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {events.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[9px] text-neutral-400 font-bold block">Recent Raw events:</span>
                <div className="flex flex-wrap gap-1.5">
                  {events.map((e) => (
                    <span key={e.id} className="bg-neutral-900 border border-[#39706f]/20 text-[#39706f] px-2 py-0.5 rounded text-[10px] font-bold">
                      {e.metadata?.appName || e.source}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Active quiz taking flow
function ActiveQuizSession({ attempt, snapshot }: { attempt: QuizAttempt; snapshot: DebugSnapshot | null }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answersState, setAnswersState] = useState<Record<string, { selectedOption: string | null; correct: boolean }>>({});
  const [showDrawer, setShowDrawer] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);

  const questions = attempt.questions;
  const currentQuestion = questions[currentIdx];

  // Reset quiz state when attempt ID changes
  useEffect(() => {
    setCurrentIdx(0);
    setAnswersState({});
    setShowDrawer(false);
    setQuizFinished(false);
  }, [attempt.id]);

  const handleSelectOption = (option: string) => {
    const qId = currentQuestion.id;
    if (answersState[qId]) return;

    const correct = option.trim() === currentQuestion.answer.trim();
    setAnswersState((prev) => ({
      ...prev,
      [qId]: { selectedOption: option, correct }
    }));
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setQuizFinished(true);
    }
  };

  const currentAnswerState = answersState[currentQuestion.id] || null;
  const hasSelected = currentAnswerState !== null;

  const currentOptions = currentQuestion.options || [
    currentQuestion.answer,
    "Alternative choice A",
    "Alternative choice B",
    "Alternative choice C"
  ];

  // Calculate overall performance
  const correctCount = Object.values(answersState).filter((a) => a.correct === true).length;

  if (quizFinished) {
    return (
      <div className="flex-1 flex flex-col p-8 overflow-y-auto max-h-full items-center justify-center select-text">
        <div className="max-w-md w-full bg-white/[0.02] border border-white/5 rounded-3xl p-8 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-md">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-serif font-black text-white">Quiz completed!</h2>
            <p className="text-neutral-400 text-xs font-semibold mt-2.5">
              Nice work reviewing your memory cards today.
            </p>
          </div>

          <div className="bg-neutral-900 border border-white/5 rounded-2xl p-5 grid grid-cols-2 gap-4">
            <div className="text-center">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-bold">Accuracy</span>
              <strong className="text-2xl font-serif text-white block mt-1">
                {Math.round((correctCount / questions.length) * 100)}%
              </strong>
            </div>
            <div className="text-center border-l border-white/5">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-bold">Grade</span>
              <strong className="text-2xl font-serif text-[#eb7f4b] block mt-1">
                {correctCount} / {questions.length}
              </strong>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setCurrentIdx(0);
              setAnswersState({});
              setQuizFinished(false);
            }}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-black cursor-pointer text-center bg-[#eb7f4b] text-white hover:opacity-95 shadow-md shadow-[#eb7f4b]/20"
          >
            Review Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden relative max-h-full">
      {/* Quiz Board Area */}
      <div className="flex-1 flex flex-col p-8 overflow-y-auto max-h-full">
        {/* Session header */}
        <header className="flex justify-between items-center mb-6">
          <div>
            <span className="text-[10px] text-[#eb7f4b] font-black uppercase tracking-wider">
              Active Review Session
            </span>
            <div className="flex items-center gap-2 mt-1">
              <h2 className="text-xl font-serif font-black text-white leading-none">
                Private Context Quiz
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDrawer(!showDrawer)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
              showDrawer
                ? "bg-[#39706f]/20 border-[#39706f]/30 text-white"
                : "bg-white/[0.02] border-white/5 text-neutral-400 hover:text-white"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>{showDrawer ? "Hide captured hints" : "Show captured hints"}</span>
          </button>
        </header>

        {/* Progress meter */}
        <div className="w-full bg-neutral-900 border border-white/5 rounded-full h-2 mb-8 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#eb7f4b] to-[#b76742] transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Question card */}
        <section className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between flex-1 min-h-[300px]">
          <div>
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-black block">
              Question {currentIdx + 1} of {questions.length}
            </span>
            <h3 className="text-lg font-serif font-bold text-white leading-snug mt-3 select-text">
              {currentQuestion.question}
            </h3>

            {/* MCQ Options grid */}
            <div className="mt-8 space-y-3">
              <span className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider block mb-1">
                Choose the correct answer
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {currentOptions.map((option) => {
                  const isSelected = currentAnswerState?.selectedOption === option;
                  const isCorrectAnswer = option.trim() === currentQuestion.answer.trim();
                  
                  let btnStyle = "w-full bg-white/[0.015] border border-white/5 hover:border-white/15 hover:bg-white/[0.04] text-neutral-300 hover:text-white";
                  let icon = null;

                  if (hasSelected) {
                    if (isCorrectAnswer) {
                      btnStyle = "w-full bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold";
                      icon = (
                        <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      );
                    } else if (isSelected) {
                      btnStyle = "w-full bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold";
                      icon = (
                        <svg className="w-4 h-4 text-rose-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      );
                    } else {
                      btnStyle = "w-full bg-neutral-900/30 border-white/[0.02] text-neutral-500 opacity-40 cursor-not-allowed";
                    }
                  }

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={hasSelected}
                      onClick={() => handleSelectOption(option)}
                      className={`p-4 rounded-2xl text-left text-xs font-semibold transition-all flex items-center justify-between gap-3 text-wrap select-text cursor-pointer min-h-[58px] ${btnStyle}`}
                    >
                      <span>{option}</span>
                      {icon}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-8 flex justify-end border-t border-white/5 pt-4 min-h-[44px]">
            {hasSelected && (
              <button
                type="button"
                onClick={handleNext}
                className="py-2.5 px-5 rounded-xl text-xs font-black cursor-pointer bg-[#eb7f4b] text-white hover:opacity-95 shadow-md shadow-[#eb7f4b]/20 flex items-center gap-1.5 animate-fade-in"
              >
                <span>{currentIdx < questions.length - 1 ? "Next Question" : "Finish Quiz"}</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Slide-out Context Drawer */}
      {showDrawer && (
        <ContextHintDrawer
          question={currentQuestion}
          snapshot={snapshot}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </div>
  );
}

// Side drawer that renders related events or segments to aid memory
function ContextHintDrawer({
  question,
  snapshot,
  onClose
}: {
  question: QuizQuestion;
  snapshot: DebugSnapshot | null;
  onClose: () => void;
}) {
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [loadingImg, setLoadingImg] = useState(false);

  const matchedSegments: ActivitySegment[] = [];
  const matchedEvents: CaptureEvent[] = [];

  // Parse source IDs
  if (snapshot) {
    if (question.sourceSegmentIds) {
      question.sourceSegmentIds.forEach((id) => {
        const seg = snapshot.segments.find((s) => s.id === id);
        if (seg) matchedSegments.push(seg);
      });
    }

    if (question.sourceEventIds) {
      question.sourceEventIds.forEach((id) => {
        const ev = snapshot.events.find((e) => e.id === id);
        if (ev) matchedEvents.push(ev);
      });
    }
  }

  // Load screenshot if there's one in matched events
  const screenshotPath = matchedEvents.find((e) => e.metadata?.screenshotPath)?.metadata?.screenshotPath;

  useEffect(() => {
    if (!screenshotPath) {
      setScreenshotSrc(null);
      return;
    }

    let active = true;
    setLoadingImg(true);
    setScreenshotSrc(null);

    window.mnemonic
      .readImageAsset(screenshotPath)
      .then((src) => {
        if (active) {
          setScreenshotSrc(src);
          setLoadingImg(false);
        }
      })
      .catch(() => {
        if (active) setLoadingImg(false);
      });

    return () => {
      active = false;
    };
  }, [screenshotPath]);

  return (
    <aside className="w-[320px] flex-shrink-0 bg-[#1c1a18] border-l border-white/5 flex flex-col select-text relative h-full animate-fade-in z-20">
      <header className="flex justify-between items-center p-5 border-b border-white/5">
        <h4 className="text-xs font-black text-white uppercase tracking-wider">
          Captured Context Hint
        </h4>
        <button
          onClick={onClose}
          type="button"
          className="text-neutral-500 hover:text-white transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {matchedSegments.length === 0 && matchedEvents.length === 0 ? (
          <p className="text-[10px] text-neutral-500 font-bold text-center mt-8 uppercase">
            No hints linked to this card
          </p>
        ) : (
          <>
            {/* Segments summary hints */}
            {matchedSegments.map((seg) => (
              <div key={seg.id} className="space-y-1.5">
                <span className="text-[9px] text-[#eb7f4b] font-black uppercase tracking-wider block">
                  Source Activity
                </span>
                <div className="bg-neutral-900 border border-white/5 p-3 rounded-xl space-y-1">
                  <strong className="text-[11px] text-white block">{seg.title || "Grouped Cycle"}</strong>
                  <p className="text-[10px] text-neutral-400 leading-normal font-medium">{seg.summary}</p>
                </div>
              </div>
            ))}

            {/* Events raw content hints */}
            {matchedEvents.map((ev) => (
              <div key={ev.id} className="space-y-1.5">
                <span className="text-[9px] text-blue-400 font-black uppercase tracking-wider block">
                  Original Source Snippet
                </span>
                <div className="bg-neutral-900 border border-white/5 p-3 rounded-xl space-y-2">
                  <div className="flex justify-between text-[8px] font-black text-neutral-400">
                    <span>{ev.metadata?.appName || ev.source}</span>
                    <span>{new Date(ev.capturedAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-[10px] text-neutral-300 font-medium leading-relaxed break-words whitespace-pre-wrap max-h-[100px] overflow-y-auto bg-neutral-950/40 p-2 rounded">
                    {ev.content}
                  </p>
                </div>
              </div>
            ))}

            {/* Image screenshot if available */}
            {screenshotPath && (
              <div className="space-y-1.5">
                <span className="text-[9px] text-neutral-500 font-black uppercase tracking-wider block">
                  Original Screenshot
                </span>
                <div className="bg-neutral-900/50 border border-white/5 p-2 rounded-xl">
                  {loadingImg && (
                    <div className="h-28 flex items-center justify-center">
                      <svg className="animate-spin h-4.5 w-4.5 text-neutral-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  )}
                  {screenshotSrc && (
                    <img
                      src={screenshotSrc}
                      alt="Contextual clue screenshot"
                      className="w-full h-auto rounded border border-white/10 max-h-[140px] object-cover cursor-pointer hover:opacity-90"
                      onClick={() => void window.mnemonic.openImageAsset(screenshotPath)}
                    />
                  )}
                  <button
                    onClick={() => void window.mnemonic.openImageAsset(screenshotPath)}
                    type="button"
                    className="text-[9px] font-extrabold text-[#39706f] hover:underline mt-1.5 flex items-center gap-1 cursor-pointer"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>Zoom preview native window</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
