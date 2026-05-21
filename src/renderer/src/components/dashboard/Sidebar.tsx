import type { DebugSnapshot } from "../../../../shared/types";

export type TabId = "dashboard" | "stream" | "quiz" | "settings";

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  snapshot: DebugSnapshot | null;
}

export function Sidebar({ activeTab, onTabChange, snapshot }: SidebarProps) {
  const menuItems: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      id: "stream",
      label: "Activity Stream",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      )
    },
    {
      id: "quiz",
      label: "Quizzes",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    },
    {
      id: "settings",
      label: "Settings",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    }
  ];

  const quizReady = snapshot?.latestAttempt?.status === "quiz_ready";

  return (
    <aside className="w-[240px] flex-shrink-0 bg-[#1c1a18]/90 border-r border-white/5 flex flex-col justify-between select-none relative h-full">
      {/* Top Section: Branding (draggable background, no-drag contents) */}
      <div className="flex flex-col pt-16 px-5 drag-region">
        <div className="flex items-center gap-3 no-drag">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#eb7f4b] to-[#b76742] flex items-center justify-center shadow-lg shadow-[#eb7f4b]/20">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              <path d="M2 12h20" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-serif font-black tracking-wide text-white leading-none">
              Mnemonic
            </span>
            <span className="block text-[8px] font-black text-[#eb7f4b] uppercase tracking-[0.18em] mt-0.5">
              Secure Companion
            </span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="mt-8 flex flex-col gap-1 no-drag">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            const isQuizTab = item.id === "quiz";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {isQuizTab && quizReady && (
                  <span className="w-2 h-2 rounded-full bg-[#eb7f4b] shadow-[0_0_8px_rgba(235,127,75,0.7)] animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile and Status */}
      <div className="p-5 border-t border-white/5 flex items-center justify-between no-drag">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center font-bold text-xs text-neutral-300 shadow-inner">
            S
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-neutral-200 leading-none">Sayan</span>
            <span className="text-[10px] text-neutral-500 mt-1 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${snapshot?.daemon.running ? "bg-[#39706f]" : "bg-neutral-600"}`} />
              {snapshot?.daemon.running ? "Active" : "Offline"}
            </span>
          </div>
        </div>
        
        {/* Notification Bell */}
        <button
          type="button"
          className="relative w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          aria-label="Notifications"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {quizReady && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#eb7f4b]" />
          )}
        </button>
      </div>
    </aside>
  );
}
