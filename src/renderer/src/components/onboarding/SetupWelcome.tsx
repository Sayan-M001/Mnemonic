import type { DebugSnapshot } from "../../../../shared/types";

export function SetupWelcome({ snapshot, next }: { snapshot: DebugSnapshot | null; next: () => void }) {
  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <div className="relative w-18 h-18 rounded-[20px] bg-gradient-to-tr from-[#39706f] to-[#5a9c9b] flex items-center justify-center shadow-xl shadow-[#39706f]/25 mb-0.5 self-start">
        <div className="absolute inset-2 rounded-[14px] border border-white/25" />
        <div className="w-8 h-8 rounded-full bg-[#fdfbf9] opacity-90 shadow-inner flex items-center justify-center">
          <svg className="w-4 h-4 text-[#39706f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div className="absolute w-3 h-3 rounded-full bg-[#ffb000] bottom-3 right-3 shadow border border-white/50" />
      </div>
      
      <span className="text-[10px] font-extrabold text-[#8b3f22] uppercase tracking-[0.2em] self-start">
        Passive Recall
      </span>
      <h2 className="text-2xl font-serif font-black tracking-tight text-[#1c1712] leading-tight">
        Build knowledge from your everyday screen and browser activity.
      </h2>
      <p className="text-[11px] text-[#5b4e41] leading-relaxed max-w-[460px]">
        Mnemonic runs a secure local background daemon that captures browser state and screen elements, helping you review what you saw through automatic interactive quizzes.
      </p>
      
      <button 
        type="button" 
        onClick={next}
        className="mt-1 w-fit px-5 py-2.5 rounded-xl bg-[#1c1712] hover:bg-[#2e261e] text-[#faf6f0] text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-98 cursor-pointer"
      >
        Get started
      </button>
    </div>
  );
}
