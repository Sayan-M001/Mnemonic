import { useState } from "react";
import type { DebugSnapshot, CaptureSettings, QuizAttempt } from "../../../../shared/types";
import { Sidebar, TabId } from "./Sidebar";
import { DashboardHome } from "./DashboardHome";
import { ActivityStream } from "./ActivityStream";
import { QuizView } from "./QuizView";
import { SettingsView } from "./SettingsView";

interface DashboardLayoutProps {
  snapshot: DebugSnapshot | null;
  settings: CaptureSettings | null;
  attempt: QuizAttempt | null;
  updateSettings: (patch: Partial<CaptureSettings>) => Promise<void>;
  requestAccessibilityPermission: () => Promise<void>;
  requestScreenPermission: () => Promise<void>;
  clearLocalData: () => Promise<void>;
  actionMessage: string | null;
  actionError: string | null;
  openSetup: () => void;
}

export function DashboardLayout({
  snapshot,
  settings,
  attempt,
  updateSettings,
  requestAccessibilityPermission,
  requestScreenPermission,
  clearLocalData,
  actionMessage,
  actionError,
  openSetup
}: DashboardLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  // Custom callback to switch tab (e.g. from Home Widget to Quiz tab)
  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
  };

  return (
    <main className="h-screen w-screen bg-[#131110] flex antialiased font-sans select-none relative overflow-hidden">
      {/* Top drag handle strip for macOS frameless window */}
      <div className="absolute top-0 left-0 right-0 h-14 drag-region z-10" />

      {/* Left Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} snapshot={snapshot} />

      {/* Main Content Area */}
      <section className="flex-1 bg-[#131110] relative flex flex-col min-w-0 h-full no-drag">
        {/* Radial ambient glow gradients behind contents */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-[200px] -left-[200px] w-[600px] h-[600px] rounded-full bg-[#eb7f4b]/[0.08] blur-[120px]" />
          <div className="absolute -bottom-[200px] -right-[200px] w-[500px] h-[500px] rounded-full bg-[#39706f]/[0.06] blur-[100px]" />
        </div>

        {/* Dynamic Inner Tab View */}
        <div className="flex-1 relative z-10 min-h-0 h-full">
          {activeTab === "dashboard" && (
            <DashboardHome
              snapshot={snapshot}
              onTabChange={handleTabChange}
              updateSettings={updateSettings}
              actionMessage={actionMessage}
              actionError={actionError}
            />
          )}

          {activeTab === "stream" && <ActivityStream snapshot={snapshot} />}

          {activeTab === "quiz" && <QuizView snapshot={snapshot} />}

          {activeTab === "settings" && (
            <SettingsView
              snapshot={snapshot}
              settings={settings}
              updateSettings={updateSettings}
              requestAccessibilityPermission={requestAccessibilityPermission}
              requestScreenPermission={requestScreenPermission}
              clearLocalData={clearLocalData}
              openSetup={openSetup}
            />
          )}
        </div>
      </section>
    </main>
  );
}
