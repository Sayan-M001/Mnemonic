import type { PermissionSnapshot } from "../../../shared/types";

export function statusLabel(status?: string) {
  if (status === "granted") {
    return "already granted";
  }

  if (status === "denied") {
    return "denied, open System Settings";
  }

  if (status === "not-determined") {
    return "not requested yet";
  }

  return status ?? "unknown";
}

export function PermissionActionRow({
  title,
  description,
  status,
  disabled = false,
  onRequest
}: {
  title: string;
  description: string;
  status?: string;
  checked: boolean;
  disabled?: boolean;
  onRequest?: () => Promise<void>;
  onChange: (checked: boolean) => void;
}) {
  const isGranted = status === "granted";

  return (
    <div className={`flex items-center justify-between gap-4 py-3 px-4 rounded-2xl bg-[#faf6f0]/80 border border-[#1c1712]/5 shadow-sm transition-all duration-200 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex-1 flex flex-col gap-0.5 select-none">
        <div className="flex items-center gap-2">
          <strong className="text-sm font-bold text-[#1c1712]">{title}</strong>
          {isGranted && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
              ✓
            </span>
          )}
        </div>
        <span className="text-[11px] text-[#766a5c] leading-normal">{description}</span>
        <span className="text-[10px] font-bold text-[#8b3f22] uppercase tracking-wide mt-0.5">
          Status: {statusLabel(status)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {onRequest && !isGranted ? (
          <button 
            className="px-3 py-1.5 rounded-lg bg-[#007aff] hover:bg-[#0062cc] text-white text-xs font-bold shadow-md cursor-pointer transition-all active:scale-95" 
            type="button" 
            onClick={() => void onRequest()}
          >
            {status === "denied" || status === "restricted" ? "Open Settings" : "Grant Access"}
          </button>
        ) : isGranted ? (
          <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
            <span className="text-[11px] text-emerald-700 font-bold whitespace-nowrap">Granted</span>
            <div className="w-8 h-4 rounded-full bg-[#39706f] relative flex items-center justify-end p-0.5">
              <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PermissionsPanel({
  permissions,
  requestAccessibilityPermission,
  requestScreenPermission
}: {
  permissions?: PermissionSnapshot | null;
  requestAccessibilityPermission?: () => Promise<void>;
  requestScreenPermission?: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <PermissionActionRow
        title="Accessibility API Access"
        description="Required for accurate active app detection, browser tab URL logging, and active window capturing."
        status={permissions?.accessibility}
        checked={permissions?.accessibility === "granted"}
        onRequest={requestAccessibilityPermission}
        onChange={() => undefined}
      />
      <PermissionActionRow
        title="Screen Recording Permission"
        description="Required for visual window previews and high-fidelity OCR text extraction."
        status={permissions?.screen}
        checked={permissions?.screen === "granted"}
        onRequest={requestScreenPermission}
        onChange={() => undefined}
      />
    </div>
  );
}
