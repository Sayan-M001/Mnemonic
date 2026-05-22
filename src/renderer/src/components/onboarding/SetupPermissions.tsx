import type { CaptureSettings, PermissionSnapshot } from "../../../../shared/types";
import { PermissionsPanel } from "../PermissionsPanel";

export function SetupPermissions({
  actionError,
  actionMessage,
  permissions,
  settings,
  requestAccessibilityPermission,
  requestScreenPermission,
  next
}: {
  actionError: string | null;
  actionMessage: string | null;
  permissions: PermissionSnapshot | null;
  settings: CaptureSettings | null;
  updateSettings: (patch: Partial<CaptureSettings>) => Promise<void>;
  requestAccessibilityPermission: () => Promise<void>;
  requestScreenPermission: () => Promise<void>;
  next: () => void;
}) {
  if (!settings) {
    return <p className="text-xs text-[#766a5c] animate-pulse">Loading permissions configuration...</p>;
  }

  const allGranted = permissions?.accessibility === "granted" && permissions?.screen === "granted";

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <span className="text-[10px] font-extrabold text-[#8b3f22] uppercase tracking-[0.2em] self-start">
        System Access
      </span>
      <h2 className="text-2xl font-serif font-black tracking-tight text-[#1c1712] leading-tight">
        Enable App Permissions
      </h2>
      <p className="text-[11px] text-[#5b4e41] leading-relaxed max-w-[460px] mb-1">
        Grant accessibility and screen recording permissions. All data is processed and stored 100% locally on your computer.
      </p>

      <PermissionsPanel
        permissions={permissions}
        requestAccessibilityPermission={requestAccessibilityPermission}
        requestScreenPermission={requestScreenPermission}
      />

      <div className="flex items-center gap-3 mt-1">
        <button 
          type="button" 
          onClick={next}
          className={`px-5 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-98 cursor-pointer ${
            allGranted 
              ? "bg-[#39706f] hover:bg-[#285b58] text-white" 
              : "bg-[#1c1712] hover:bg-[#2e261e] text-[#faf6f0]"
          }`}
        >
          {allGranted ? "Continue to Dashboard" : "Continue"}
        </button>
      </div>

      {actionMessage && <p className="text-[10px] font-semibold text-emerald-700 leading-normal mt-1">{actionMessage}</p>}
      {actionError && <p className="text-[10px] font-semibold text-rose-700 leading-normal mt-1">{actionError}</p>}
    </div>
  );
}
