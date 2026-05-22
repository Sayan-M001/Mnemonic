import type { CaptureSettings, DebugSnapshot } from "../../../../shared/types";
import { SetupWelcome } from "./SetupWelcome";
import { SetupPermissions } from "./SetupPermissions";
import { SetupDone } from "./SetupDone";

export function SetupFlow({
  snapshot,
  settings,
  step,
  actionError,
  actionMessage,
  setStep,
  updateSettings,
  requestAccessibilityPermission,
  requestScreenPermission,
  openDashboard
}: {
  snapshot: DebugSnapshot | null;
  settings: CaptureSettings | null;
  step: number;
  actionError: string | null;
  actionMessage: string | null;
  setStep: (step: number) => void;
  updateSettings: (patch: Partial<CaptureSettings>) => Promise<void>;
  requestAccessibilityPermission: () => Promise<void>;
  requestScreenPermission: () => Promise<void>;
  openDashboard: () => void;
}) {
  const steps = ["Hello", "Consent", "Done"];

  return (
    <main className="h-screen w-screen bg-gradient-to-br from-[#faf6f0] via-[#f5efe6] to-[#eaddcd] flex antialiased font-sans select-none relative overflow-hidden">
      {/* Top drag handle for the window */}
      <div className="absolute top-0 left-0 right-0 h-14 drag-region z-10" />

      <section className="relative w-full h-full bg-[#fdfbf9]/95 flex backdrop-blur-xl">
        
        {/* Left Column: Branding Pane (draggable background) */}
        <div className="w-[320px] bg-[#faf6f0] px-8 pb-6 pt-12 flex flex-col justify-between border-r border-[#1c1712]/5 drag-region">
          <div className="flex flex-col gap-6 no-drag">
            <div className="w-14 h-14 rounded-[20px] bg-[#1c1712] flex items-center justify-center shadow-lg shadow-[#1c1712]/20">
              <svg className="w-8 h-8 text-[#faf6f0]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-serif font-black tracking-tight text-[#1c1712] leading-[1.1]">
                Mnemonic
              </h1>
              <p className="text-[10px] font-extrabold text-[#8b3f22] uppercase tracking-[0.18em] mt-1.5">
                Private memory quizzes
              </p>
            </div>
            <p className="text-xs font-semibold text-[#766a5c] leading-relaxed">
              Unlock your memory potential securely. Capture context locally to review what you saw through interactive quizzes.
            </p>
          </div>
          
          <div className="flex items-center gap-3 bg-white/60 border border-black/5 rounded-full px-4 py-2 w-fit shadow-sm no-drag">
            <span className={`w-2.5 h-2.5 rounded-full ${snapshot?.daemon.running ? "bg-[#39706f] shadow-[0_0_8px_rgba(57,112,111,0.5)] animate-pulse" : "bg-[#b76742]"}`} />
            <span className="text-[10px] font-bold text-[#766a5c]">
              {snapshot?.daemon.running ? "Daemon active in tray" : "Initializing..."}
            </span>
          </div>
        </div>

        {/* Right Column: Setup Stage Content */}
        <div className="flex-1 px-8 pb-6 pt-12 flex flex-col justify-between bg-white/40">
          {/* Top Row: Progress Indicator & Dots */}
          <div className="flex justify-between items-center relative z-20 no-drag">
            <div className="flex items-center gap-1.5">
              {steps.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  aria-label={`Go to ${label}`}
                  onClick={() => setStep(index)}
                  className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                    index === step ? "w-8 bg-[#39706f]" : "w-2 bg-black/10 hover:bg-black/20"
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] font-bold text-[#766a5c] uppercase tracking-widest">
              Step {step + 1} of {steps.length}
            </span>
          </div>

          {/* Center Stage: Welcome / Permissions / Done */}
          <div className="flex-1 flex flex-col justify-center my-2 relative z-20 no-drag">
            {step === 0 ? (
              <SetupWelcome snapshot={snapshot} next={() => setStep(1)} />
            ) : step === 1 ? (
              <SetupPermissions
                actionError={actionError}
                actionMessage={actionMessage}
                permissions={snapshot?.permissions ?? null}
                settings={settings}
                updateSettings={updateSettings}
                requestAccessibilityPermission={requestAccessibilityPermission}
                requestScreenPermission={requestScreenPermission}
                next={() => setStep(2)}
              />
            ) : (
              <SetupDone snapshot={snapshot} openDashboard={openDashboard} onBack={() => setStep(1)} />
            )}
          </div>

          {/* Bottom Bar Caption */}
          <div className="border-t border-[#1c1712]/5 pt-4 flex justify-between items-center relative z-20 no-drag">
            <span className="text-[10px] text-[#766a5c] font-bold uppercase tracking-wider">
              Mnemonic Setup Flow
            </span>
            <span className="text-xs font-bold text-[#1c1712]">
              {steps[step] === "Hello" ? "Introduction" : steps[step] === "Consent" ? "Permissions" : "Completed"}
            </span>
          </div>
        </div>

      </section>
    </main>
  );
}
