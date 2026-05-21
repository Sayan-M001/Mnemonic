import { useState } from "react";
import type { DebugSnapshot, CaptureSettings } from "../../../../shared/types";

interface SettingsViewProps {
  snapshot: DebugSnapshot | null;
  settings: CaptureSettings | null;
  updateSettings: (patch: Partial<CaptureSettings>) => Promise<void>;
  requestAccessibilityPermission: () => Promise<void>;
  requestScreenPermission: () => Promise<void>;
  clearLocalData: () => Promise<void>;
  openSetup?: () => void;
}

export function SettingsView({
  snapshot,
  settings,
  updateSettings,
  requestAccessibilityPermission,
  requestScreenPermission,
  clearLocalData,
  openSetup
}: SettingsViewProps) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggleClipboard = (checked: boolean) => {
    void updateSettings({ clipboardEnabled: checked });
  };

  const handleToggleWindow = (checked: boolean) => {
    void updateSettings({ activeWindowEnabled: checked });
  };

  const handleTogglePause = (checked: boolean) => {
    void updateSettings({ capturePaused: checked });
  };

  const handleDeleteData = async () => {
    setIsDeleting(true);
    try {
      await clearLocalData();
      setShowConfirmDelete(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatPermissionStatus = (status?: string) => {
    if (status === "granted") return "Granted";
    if (status === "denied") return "Denied (System settings)";
    if (status === "not-determined") return "Not Requested";
    return status || "Unknown";
  };

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto max-h-full select-text relative">
      {/* View Header */}
      <header className="flex-shrink-0 mb-6">
        <h2 className="text-2xl font-serif font-black tracking-tight text-white leading-tight">
          Settings
        </h2>
        <p className="text-neutral-400 text-xs font-semibold mt-1">
          Configure local recording rules, privacy permissions, and database operations.
        </p>
      </header>

      <div className="space-y-6 max-w-2xl">
        {/* Section 1: Capture Controls */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">
            Recording Preferences
          </h3>

          <div className="space-y-3">
            {/* Pause Capture Toggle */}
            <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-4 rounded-2xl transition-all hover:border-white/10">
              <div>
                <strong className="text-xs font-bold text-white block">Pause All Capture</strong>
                <span className="text-[10px] text-neutral-400 font-semibold leading-normal">
                  Temporarily disable daemon capture checks without losing settings.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings?.capturePaused || false}
                  onChange={(e) => handleTogglePause(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#eb7f4b]" />
              </label>
            </div>

            {/* Active Window Toggle */}
            <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-4 rounded-2xl transition-all hover:border-white/10">
              <div>
                <strong className="text-xs font-bold text-white block">Active Window Tracking</strong>
                <span className="text-[10px] text-neutral-400 font-semibold leading-normal">
                  Logs active application changes, titles, and text context.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings?.activeWindowEnabled || false}
                  onChange={(e) => handleToggleWindow(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#eb7f4b]" />
              </label>
            </div>

            {/* Clipboard Toggle */}
            <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-4 rounded-2xl transition-all hover:border-white/10">
              <div>
                <strong className="text-xs font-bold text-white block">Clipboard Inspector</strong>
                <span className="text-[10px] text-neutral-400 font-semibold leading-normal">
                  Logs text segments copied to the system pasteboard.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings?.clipboardEnabled || false}
                  onChange={(e) => handleToggleClipboard(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#eb7f4b]" />
              </label>
            </div>
          </div>
        </section>

        {/* Section 2: Privacy permissions */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">
            macOS Privacy Permissions
          </h3>

          <div className="space-y-3">
            {/* Accessibility permissions */}
            <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-4 rounded-2xl transition-all hover:border-white/10">
              <div>
                <strong className="text-xs font-bold text-white block">Accessibility Services</strong>
                <span className="text-[10px] text-neutral-400 font-semibold leading-normal block">
                  Enables frontmost window title sniffing and UI mapping.
                </span>
                <span className={`inline-block text-[9px] font-extrabold uppercase mt-1.5 px-2 py-0.5 rounded ${
                  snapshot?.permissions.accessibility === "granted" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                }`}>
                  Status: {formatPermissionStatus(snapshot?.permissions.accessibility)}
                </span>
              </div>

              {snapshot?.permissions.accessibility !== "granted" && (
                <button
                  onClick={requestAccessibilityPermission}
                  className="px-3.5 py-1.5 rounded-lg bg-[#eb7f4b] hover:bg-[#b76742] text-white text-xs font-extrabold cursor-pointer transition-all active:scale-95 shadow-md"
                >
                  Grant Access
                </button>
              )}
            </div>

            {/* Screen recording permissions */}
            <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-4 rounded-2xl transition-all hover:border-white/10">
              <div>
                <strong className="text-xs font-bold text-white block">Screen Recording Authorization</strong>
                <span className="text-[10px] text-neutral-400 font-semibold leading-normal block">
                  Enables window preview screenshot snapshots for OCR text indexing.
                </span>
                <span className={`inline-block text-[9px] font-extrabold uppercase mt-1.5 px-2 py-0.5 rounded ${
                  snapshot?.permissions.screen === "granted" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                }`}>
                  Status: {formatPermissionStatus(snapshot?.permissions.screen)}
                </span>
              </div>

              {snapshot?.permissions.screen !== "granted" && (
                <button
                  onClick={requestScreenPermission}
                  className="px-3.5 py-1.5 rounded-lg bg-[#eb7f4b] hover:bg-[#b76742] text-white text-xs font-extrabold cursor-pointer transition-all active:scale-95 shadow-md"
                >
                  Grant Access
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Section 3: Storage */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">
            Database & System Info
          </h3>

          <div className="bg-neutral-900 border border-white/5 rounded-2xl p-4 space-y-2.5 text-[11px] font-semibold text-neutral-400">
            <div className="flex justify-between">
              <span>Database Data Path:</span>
              <span className="text-neutral-200 truncate max-w-[280px]" title={snapshot?.daemon.dataPath}>
                {snapshot?.daemon.dataPath || "Loading store..."}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Sync Check Interval:</span>
              <span className="text-neutral-200">
                {snapshot ? `${(snapshot.daemon.intervalMs / 1000).toFixed(0)} seconds` : "--"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Quiz generation span:</span>
              <span className="text-neutral-200">
                {snapshot ? `${(snapshot.daemon.quizIntervalMs / 60000).toFixed(0)} minutes` : "--"}
              </span>
            </div>
          </div>
        </section>

        {/* Section 4: App Setup Onboarding */}
        {openSetup && (
          <section className="space-y-3">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">
              Application Setup
            </h3>
            <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-4 rounded-2xl transition-all hover:border-white/10">
              <div>
                <strong className="text-xs font-bold text-white block">Re-run Onboarding</strong>
                <span className="text-[10px] text-neutral-400 font-semibold leading-normal">
                  Go back to the welcome screen and permission setup wizard.
                </span>
              </div>
              <button
                type="button"
                onClick={openSetup}
                className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700/80 border border-white/5 text-neutral-200 text-xs font-black cursor-pointer transition-all"
              >
                Open Setup
              </button>
            </div>
          </section>
        )}

        {/* Section 5: Danger zone */}
        <section className="space-y-3 border-t border-white/5 pt-6">
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-rose-500">
            Danger Zone
          </h3>

          <div className="border border-rose-500/20 bg-rose-500/[0.02] p-4 rounded-2xl flex justify-between items-center">
            <div>
              <strong className="text-xs font-bold text-white block">Wipe Local Database</strong>
              <p className="text-[10px] text-neutral-400 font-semibold leading-normal max-w-sm mt-0.5">
                Permanently delete all captured SQLite event databases and screenshot folders on disk. This cannot be undone.
              </p>
            </div>

            <button
              onClick={() => setShowConfirmDelete(true)}
              className="px-3.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-xs font-black cursor-pointer transition-all"
            >
              Wipe Data
            </button>
          </div>
        </section>
      </div>

      {/* Confirmation delete modal */}
      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1c1a18] border border-white/10 rounded-3xl p-6 max-w-md w-full text-center space-y-6 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div>
              <h3 className="text-base font-serif font-black text-white">Wipe all local data?</h3>
              <p className="text-neutral-400 text-xs font-semibold mt-2.5 leading-relaxed">
                This will delete your database database history and visual memory snapshots. This action is final.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                disabled={isDeleting}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-black bg-neutral-800 text-neutral-400 hover:text-white border border-white/5 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteData}
                disabled={isDeleting}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? "Wiping..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
