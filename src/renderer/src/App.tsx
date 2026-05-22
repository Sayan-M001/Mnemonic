import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CaptureSettings, DebugSnapshot } from "../../shared/types";
import "./styles.css";
import { SetupFlow } from "./components/onboarding/SetupFlow";
import { DashboardLayout } from "./components/dashboard/DashboardLayout";

function App() {
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null);
  const [preloadError, setPreloadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [view, setView] = useState<"setup" | "dashboard">("setup");
  const [setupStep, setSetupStep] = useState(0);

  useEffect(() => {
    if (!window.mnemonic) {
      setPreloadError("Electron preload API is unavailable. Restart the app after rebuilding the preload script.");
      return;
    }

    window.mnemonic.getSnapshot().then((initialSnapshot) => {
      setSnapshot(initialSnapshot);
      const allGranted = initialSnapshot.permissions.accessibility === "granted" && initialSnapshot.permissions.screen === "granted";
      if (allGranted) {
        setView("dashboard");
      }
    });
    return window.mnemonic.onSnapshotUpdated(setSnapshot);
  }, []);

  useEffect(() => {
    if (!window.mnemonic || view !== "setup") {
      return;
    }

    const timer = window.setInterval(() => {
      window.mnemonic.getPermissions().then((permissions) => {
        setSnapshot((current) => (current ? { ...current, permissions } : current));
      });
    }, 1500);

    return () => window.clearInterval(timer);
  }, [view]);

  async function updateSettings(patch: Partial<CaptureSettings>) {
    if (!snapshot) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    const nextSettings = { ...snapshot.settings, ...patch };
    setSnapshot({ ...snapshot, settings: nextSettings });
    await window.mnemonic.updateSettings(nextSettings);
  }

  async function requestAccessibilityPermission() {
    setActionError(null);
    setActionMessage(null);
    const permissions = await window.mnemonic.requestAccessibilityPermission();
    setSnapshot((current) => (current ? { ...current, permissions } : current));
  }

  async function requestScreenPermission() {
    setActionError(null);
    setActionMessage(null);
    const permissions = await window.mnemonic.requestScreenPermission();
    setSnapshot((current) => (current ? { ...current, permissions } : current));
  }

  async function clearLocalData() {
    setActionError(null);
    setActionMessage(null);
    await window.mnemonic.clearLocalData();
  }


  const attempt = snapshot?.latestAttempt ?? null;
  const settings = snapshot?.settings ?? null;

  if (preloadError) {
    return (
      <main className="shell">
        <section className="panel preload-error">
          <p className="eyebrow">Startup issue</p>
          <h1>Preload did not load</h1>
          <p>{preloadError}</p>
        </section>
      </main>
    );
  }

  if (view === "setup") {
    return (
      <SetupFlow
        snapshot={snapshot}
        settings={settings}
        step={setupStep}
        actionError={actionError}
        actionMessage={actionMessage}
        setStep={setSetupStep}
        updateSettings={updateSettings}
        requestAccessibilityPermission={requestAccessibilityPermission}
        requestScreenPermission={requestScreenPermission}
        openDashboard={() => setView("dashboard")}
      />
    );
  }

  return (
    <DashboardLayout
      snapshot={snapshot}
      settings={settings}
      attempt={attempt}
      updateSettings={updateSettings}
      requestAccessibilityPermission={requestAccessibilityPermission}
      requestScreenPermission={requestScreenPermission}
      clearLocalData={clearLocalData}
      actionMessage={actionMessage}
      actionError={actionError}
      openSetup={() => setView("setup")}
    />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
