import { useEffect, useState } from "react";
import type { DebugSnapshot, CaptureEvent } from "../../../../shared/types";
import type { TabId } from "./Sidebar";

import type { CaptureSettings } from "../../../../shared/types";

interface DashboardHomeProps {
  snapshot: DebugSnapshot | null;
  onTabChange: (tab: TabId) => void;
  updateSettings: (patch: Partial<CaptureSettings>) => Promise<void>;
  actionMessage: string | null;
  actionError: string | null;
}

export function DashboardHome({
  snapshot,
  onTabChange,
  updateSettings,
  actionMessage,
  actionError
}: DashboardHomeProps) {
  const attempt = snapshot?.latestAttempt ?? null;
  const events = snapshot?.events ?? [];
  const segments = snapshot?.segments ?? [];
  const isReady = attempt?.status === "quiz_ready";

  // Extract unique active apps from recent events for the timeline
  const timelineEvents = events
    .filter((e) => e.metadata?.appName)
    .reduce<CaptureEvent[]>((acc, current) => {
      const exists = acc.some(
        (e) => e.metadata?.appName?.toLowerCase() === current.metadata?.appName?.toLowerCase()
      );
      if (!exists && acc.length < 5) {
        acc.push(current);
      }
      return acc;
    }, [])
    // Sort chronologically (oldest to newest)
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

  // Render SVG icons for popular apps
  const renderAppIcon = (appName?: string) => {
    const name = appName?.toLowerCase() || "";
    if (name.includes("code") || name.includes("cursor") || name.includes("developer")) {
      return (
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
        </div>
      );
    }
    if (name.includes("chrome") || name.includes("safari") || name.includes("browser") || name.includes("arc")) {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10" />
          </svg>
        </div>
      );
    }
    if (name.includes("slack") || name.includes("discord") || name.includes("chat") || name.includes("teams")) {
      return (
        <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
      );
    }
    if (name.includes("figma") || name.includes("sketch") || name.includes("design") || name.includes("photoshop")) {
      return (
        <div className="w-8 h-8 rounded-lg bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      );
    }
    if (name.includes("notes") || name.includes("notion") || name.includes("document") || name.includes("pages")) {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      );
    }
    // Default fallback icon
    return (
      <div className="w-8 h-8 rounded-lg bg-neutral-500/20 border border-neutral-500/30 flex items-center justify-center text-neutral-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
    );
  };

  const getRelativeTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Calculate event count proportions for captured donut chart
  const clipboardCount = events.filter((e) => e.source === "clipboard").length;
  const windowCount = events.filter((e) => e.source === "active_window").length;
  const totalCount = events.length;
  const windowPercentage = totalCount > 0 ? (windowCount / totalCount) * 100 : 0;
  // Circumference for r=24 is ~150.8
  const dashOffset = 150.8 - (150.8 * windowPercentage) / 100;

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto max-h-full">
      {/* Top Header Row */}
      <header className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-serif font-black tracking-tight text-white leading-tight">
            Good morning, Sayan.
          </h2>
          <p className="text-neutral-400 text-xs font-semibold mt-1">
            {isReady
              ? "You have a new memory quiz ready to review."
              : "Mnemonic is actively collecting local context for your next quiz."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {(() => {
            const hasPermissions = snapshot?.permissions.accessibility === "granted" && snapshot?.permissions.screen === "granted";
            const isPaused = snapshot?.settings.capturePaused;

            if (!hasPermissions) {
              return (
                <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg text-rose-400 text-xs font-bold shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  <span>Permissions Missing</span>
                </div>
              );
            }

            return (
              <div className="flex items-center gap-3">
                {isPaused ? (
                  <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg text-amber-400 text-xs font-bold shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>Capture Paused</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-emerald-400 text-xs font-bold shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Capturing Active</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => updateSettings({ capturePaused: !isPaused })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer shadow-sm border ${
                    isPaused
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/25"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/25"
                  }`}
                >
                  {isPaused ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                      </svg>
                      <span>Resume Capture</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                      </svg>
                      <span>Pause Capture</span>
                    </>
                  )}
                </button>
              </div>
            );
          })()}
        </div>
      </header>

      {/* Messages */}
      {actionMessage && (
        <div className="mb-6 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="mb-6 px-4 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-xl">
          {actionError}
        </div>
      )}

      {/* Grid: 3 Stats Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Quiz Readiness */}
        <article className={`relative p-5 rounded-3xl border flex flex-col justify-between transition-all duration-300 min-h-[170px] ${
          isReady
            ? "bg-[#eb7f4b]/10 border-[#eb7f4b]/30 shadow-lg shadow-[#eb7f4b]/5 hover:border-[#eb7f4b]/50"
            : "bg-white/[0.02] border-white/5 hover:border-white/10"
        }`}>
          {isReady && (
            <div className="absolute top-4 right-4 flex items-center gap-1 bg-[#eb7f4b]/20 px-2 py-0.5 rounded-full border border-[#eb7f4b]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#eb7f4b] animate-pulse" />
              <span className="text-[9px] font-black text-[#eb7f4b] uppercase">Ready</span>
            </div>
          )}
          
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#eb7f4b]">
              Start Daily Quiz
            </span>
            <h3 className="text-base font-serif font-bold text-white mt-1.5">
              Daily Memory Refresh
            </h3>
            <p className="text-[11px] text-neutral-400 font-medium leading-relaxed mt-2.5">
              {isReady
                ? `Test your recall on ${attempt?.questions.length} topics captured yesterday.`
                : attempt?.reason || "Daemon is currently gathering segments to prepare your first review."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onTabChange("quiz")}
            className={`w-full py-2 px-4 rounded-xl text-xs font-black transition-all cursor-pointer text-center mt-4 ${
              isReady
                ? "bg-gradient-to-r from-[#eb7f4b] to-[#b76742] text-white hover:opacity-95 shadow-md shadow-[#eb7f4b]/20"
                : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
            }`}
            disabled={!isReady}
          >
            {isReady ? "Start Quiz" : "Quiz Not Ready"}
          </button>
        </article>

        {/* Card 2: Time / Items Captured */}
        <article className="p-5 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all duration-300 flex justify-between min-h-[170px]">
          <div className="flex flex-col justify-between flex-1 pr-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">
                Time Captured
              </span>
              <h3 className="text-xl font-serif font-black text-white mt-1">
                {totalCount > 0 ? `${(totalCount * 0.15).toFixed(1)} hrs` : "0.0 hrs"}
              </h3>
              <p className="text-[10px] text-neutral-400 mt-1.5 font-semibold">
                Captured locally today
              </p>
            </div>
            
            <div className="text-[10px] text-neutral-400 font-semibold space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#39706f]" />
                <span>{windowCount} Active Window checks</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                <span>{clipboardCount} Clipboard items</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center relative">
            <svg className="w-16 h-16 transform -rotate-90">
              <circle cx="32" cy="32" r="24" className="stroke-neutral-800" strokeWidth="6" fill="transparent" />
              {totalCount > 0 && (
                <circle
                  cx="32"
                  cy="32"
                  r="24"
                  className="stroke-[#39706f]"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray="150.8"
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                />
              )}
            </svg>
            <div className="absolute text-[10px] font-black text-white">
              {totalCount}
            </div>
            <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider mt-2">
              Total items
            </span>
          </div>
        </article>

        {/* Card 3: Memory Index */}
        <article className="p-5 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all duration-300 flex flex-col justify-between min-h-[170px]">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">
              Memory Index
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <h3 className="text-xl font-serif font-black text-white">
                {totalCount > 0 ? "84%" : "0%"}
              </h3>
              <span className="text-[9px] font-extrabold text-emerald-400">
                {totalCount > 0 ? "+4% increase" : "--"}
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 font-semibold mt-1">
              Recall score based on data density
            </p>
          </div>

          {/* Sparkline chart */}
          <div className="h-10 w-full mt-4 flex items-end">
            <svg className="w-full h-full" viewBox="0 0 160 40">
              <defs>
                <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#eb7f4b" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#eb7f4b" stopOpacity="0" />
                </linearGradient>
              </defs>
              {totalCount > 0 ? (
                <>
                  <path
                    d="M 0 35 Q 20 20 40 28 T 80 15 T 120 22 T 160 8"
                    fill="none"
                    stroke="#eb7f4b"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 0 35 Q 20 20 40 28 T 80 15 T 120 22 T 160 8 L 160 40 L 0 40 Z"
                    fill="url(#glow)"
                  />
                  <circle cx="160" cy="8" r="3" fill="#eb7f4b" />
                </>
              ) : (
                <line x1="0" y1="20" x2="160" y2="20" stroke="#333" strokeDasharray="4 4" strokeWidth="1.5" />
              )}
            </svg>
          </div>
        </article>
      </section>

      {/* Active Apps Timeline */}
      <section className="mt-auto bg-white/[0.01] border border-white/5 rounded-3xl p-5 relative overflow-hidden flex flex-col">
        <h3 className="text-xs font-bold text-neutral-200 tracking-wide mb-1 flex items-center gap-2">
          <span>Active apps activity timeline</span>
          <span className="text-[9px] text-[#eb7f4b] font-black uppercase bg-[#eb7f4b]/10 border border-[#eb7f4b]/20 px-2 py-0.5 rounded-full">
            {timelineEvents.length} distinct sources
          </span>
        </h3>
        <p className="text-[10px] text-neutral-400 font-semibold mb-6">
          App events captured during active desktop cycles.
        </p>

        {timelineEvents.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-center bg-white/[0.01] rounded-2xl border border-dashed border-white/5 py-8">
            <svg className="w-6 h-6 text-neutral-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              No Timeline Data
            </span>
            <p className="text-[10px] text-neutral-600 max-w-sm mt-1 px-4">
              Enable capture sources and perform some activity to populate the timeline.
            </p>
          </div>
        ) : (
          <div className="relative w-full py-20 flex flex-col justify-center min-h-[220px]">
            {/* Horizontal timeline bar */}
            <div className="absolute left-4 right-4 h-1 bg-gradient-to-r from-neutral-800 via-neutral-700 to-neutral-800 rounded-full top-[110px]" />

            {/* Timeline Events grid */}
            <div className="flex justify-between items-center relative z-10 w-full px-4">
              {timelineEvents.map((event, index) => {
                const isEven = index % 2 === 0;
                return (
                  <div
                    key={event.id}
                    className={`flex flex-col items-center w-1/5 absolute`}
                    style={{
                      left: `${(index / (timelineEvents.length - 1)) * 80 + 10}%`,
                      transform: "translateX(-50%)"
                    }}
                  >
                    {/* Event detail bubble */}
                    <div
                      className={`flex flex-col items-center bg-neutral-900 border border-white/10 rounded-2xl p-2.5 shadow-xl w-[130px] text-center absolute transition-all duration-300 hover:scale-105 hover:border-[#eb7f4b]/30 ${
                        isEven ? "bottom-[42px]" : "top-[42px]"
                      }`}
                    >
                      {renderAppIcon(event.metadata?.appName)}
                      <strong className="text-[10px] font-black text-white mt-1.5 truncate max-w-full">
                        {event.metadata?.appName || "Application"}
                      </strong>
                      <span className="text-[8px] text-neutral-400 font-medium truncate max-w-full mt-0.5 leading-snug">
                        {event.metadata?.windowTitle || event.content || "Active State"}
                      </span>
                      <small className="text-[8px] font-extrabold text-[#eb7f4b] tracking-wider uppercase mt-1.5 bg-[#eb7f4b]/5 border border-[#eb7f4b]/15 px-1.5 py-0.5 rounded-md">
                        {getRelativeTime(event.capturedAt)}
                      </small>
                    </div>

                    {/* Connecting vertical tick */}
                    <div
                      className={`w-0.5 h-10 border-l border-dashed border-neutral-600 absolute ${
                        isEven ? "bottom-0" : "top-0"
                      }`}
                      style={{
                        height: "40px",
                        [isEven ? "bottom" : "top"]: "2px"
                      }}
                    />

                    {/* Dot on the timeline */}
                    <div className="w-3.5 h-3.5 rounded-full bg-neutral-900 border-2 border-[#eb7f4b] shadow-[0_0_8px_rgba(235,127,75,0.4)] absolute top-[103px]" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
