import type { DebugSnapshot } from "../../../../shared/types";

export function SetupDone({
  snapshot,
  openDashboard,
  onBack
}: {
  snapshot: DebugSnapshot | null;
  openDashboard: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <div className="relative w-16 h-16 rounded-[16px] bg-[#1c1712] flex items-center justify-center shadow-xl shadow-black/10 mb-0.5 self-start">
        <div className="absolute inset-1.5 rounded-[12px] border border-white/20" />
        <div className="w-7 h-7 rounded-full bg-[#39706f] flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>

      <span className="text-[10px] font-extrabold text-[#8b3f22] uppercase tracking-[0.2em] self-start">
        All Set
      </span>
      <h2 className="text-2xl font-serif font-black tracking-tight text-[#1c1712] leading-tight">
        Mnemonic is ready.
      </h2>
      <p className="text-[11px] text-[#5b4e41] leading-relaxed max-w-[460px] mb-1">
        The app will keep running from the menu bar and notify you when your saved context is strong enough for a quiz.
      </p>

      {/* Mini Stats Info Box */}
      <div className="flex items-stretch gap-4 max-w-[460px] p-3 rounded-2xl bg-[#faf6f0]/80 border border-[#1c1712]/5 shadow-sm">
        <div className="flex-1 flex flex-col justify-center">
          <span className="text-[9px] font-bold text-[#766a5c] uppercase tracking-wide">Background Daemon</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-[#1c1712]">Active & Monitoring</span>
          </div>
        </div>
        <div className="w-px bg-[#1c1712]/5" />
        <div className="px-2 flex flex-col justify-center items-center text-center">
          <span className="text-xl font-serif font-black text-[#1c1712]">
            {snapshot?.events.length ?? 0}
          </span>
          <span className="text-[9px] font-bold text-[#766a5c] uppercase tracking-wide mt-0.5">
            Events Captured
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-1">
        <button 
          className="px-4 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-[#1c1712] text-xs font-bold transition-all active:scale-98 cursor-pointer" 
          type="button" 
          onClick={onBack}
        >
          Back
        </button>
        <button 
          type="button" 
          onClick={openDashboard}
          className="px-5 py-2 rounded-xl bg-[#39706f] hover:bg-[#285b58] text-white text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-98 cursor-pointer"
        >
          Open Dashboard
        </button>
      </div>
    </div>
  );
}
