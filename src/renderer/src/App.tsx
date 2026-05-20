import { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CaptureEvent, CaptureSettings, DebugSnapshot, PermissionSnapshot, QuizAttempt } from "../../shared/types";
import "./styles.css";

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

    window.mnemonic.getSnapshot().then(setSnapshot);
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
    const nextSettings = { ...snapshot.settings, ...patch, capturePaused: false };
    setSnapshot({ ...snapshot, settings: nextSettings });
    await window.mnemonic.updateSettings(nextSettings);
  }

  async function requestAccessibilityPermission() {
    setActionError(null);
    setActionMessage(null);
    const permissions = await window.mnemonic.requestAccessibilityPermission();
    setSnapshot((current) => (current ? { ...current, permissions } : current));
  }

  async function clearLocalData() {
    setActionError(null);
    setActionMessage(null);
    await window.mnemonic.clearLocalData();
  }

  async function runCaptureNow() {
    setActionError(null);
    setActionMessage(null);

    try {
      const beforeIds = new Set((snapshot?.events ?? []).map((event) => event.id));
      const nextSnapshot = await window.mnemonic.runNow();
      setSnapshot(nextSnapshot);
      const capturedCount = nextSnapshot.events.filter((event) => !beforeIds.has(event.id)).length;

      setActionMessage(
        capturedCount > 0
          ? `Captured ${capturedCount} new item${capturedCount === 1 ? "" : "s"}.`
          : "Capture ran, but no new non-duplicate data was found."
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Capture failed.");
    }
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
        runCaptureNow={runCaptureNow}
        openDashboard={() => setView("dashboard")}
      />
    );
  }

  return (
    <Dashboard
      actionError={actionError}
      actionMessage={actionMessage}
      attempt={attempt}
      clearLocalData={clearLocalData}
      settings={settings}
      snapshot={snapshot}
      updateSettings={updateSettings}
      requestAccessibilityPermission={requestAccessibilityPermission}
      runCaptureNow={runCaptureNow}
      openSetup={() => setView("setup")}
    />
  );
}

function SetupFlow({
  snapshot,
  settings,
  step,
  actionError,
  actionMessage,
  setStep,
  updateSettings,
  requestAccessibilityPermission,
  runCaptureNow,
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
  runCaptureNow: () => Promise<void>;
  openDashboard: () => void;
}) {
  const steps = ["Hello", "Consent", "Done"];

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <div className="onboarding-topbar">
          <div className="brand-lockup">
            <span className="brand-orb">M</span>
            <div>
              <strong>Mnemonic</strong>
              <small>Private memory quizzes</small>
            </div>
          </div>
          <div className="tray-chip">
            <span className={snapshot?.daemon.running ? "pulse online" : "pulse"} />
            <span>{snapshot?.daemon.running ? "Running in tray" : "Starting"}</span>
          </div>
        </div>

        <div className="progress-dots" aria-label="Setup progress">
          {steps.map((label, index) => (
            <button
              aria-label={`Go to ${label}`}
              className={index === step ? "progress-dot active" : "progress-dot"}
              key={label}
              type="button"
              onClick={() => setStep(index)}
            />
          ))}
        </div>

        <div className="onboarding-stage">
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
              runCaptureNow={runCaptureNow}
              next={() => setStep(2)}
            />
          ) : (
            <SetupDone snapshot={snapshot} openDashboard={openDashboard} onBack={() => setStep(1)} />
          )}
        </div>

        <div className="step-caption">
          <span>
            Step {step + 1} of {steps.length}
          </span>
          <strong>{steps[step]}</strong>
        </div>
      </section>
    </main>
  );
}

function SetupWelcome({ snapshot, next }: { snapshot: DebugSnapshot | null; next: () => void }) {
  return (
    <div className="setup-step">
      <div className="hero-illustration" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">Passive Recall</p>
      <h2>Build knowledge from your everyday screen and browser activity.</h2>
      <p>
        Mnemonic runs a secure local background daemon that captures browser state and screen elements, helping you review
        what you saw through automatic interactive quizzes.
      </p>
      <div className="button-row">
        <button type="button" onClick={next}>
          Get started
        </button>
      </div>
    </div>
  );
}

function SetupPermissions({
  actionError,
  actionMessage,
  permissions,
  settings,
  updateSettings,
  requestAccessibilityPermission,
  runCaptureNow,
  next
}: {
  actionError: string | null;
  actionMessage: string | null;
  permissions: PermissionSnapshot | null;
  settings: CaptureSettings | null;
  updateSettings: (patch: Partial<CaptureSettings>) => Promise<void>;
  requestAccessibilityPermission: () => Promise<void>;
  runCaptureNow: () => Promise<void>;
  next: () => void;
}) {
  if (!settings) {
    return <p>Loading permissions...</p>;
  }

  const hasEnabledSource = hasAnyEnabledSource(settings);

  return (
    <div className="setup-step">
      <p className="eyebrow">Consent</p>
      <h2>Choose what Mnemonic can remember.</h2>
      <p>
        Clipboard, frontmost app/window, and screen elements are opt-in. Microphone is hidden until audio transcription
        is actually implemented.
      </p>
      <PermissionsPanel
        permissions={permissions}
        settings={settings}
        updateSettings={updateSettings}
        requestAccessibilityPermission={requestAccessibilityPermission}
      />
      <div className="button-row full-width-row">
        <button className="secondary-button" disabled={!hasEnabledSource} type="button" onClick={runCaptureNow}>
          Run capture now
        </button>
        <button disabled={!hasEnabledSource} type="button" onClick={next}>
          Continue
        </button>
      </div>
      {actionMessage ? <p className="success-text">{actionMessage}</p> : null}
      {actionError ? <p className="error-text">{actionError}</p> : null}
      {!hasEnabledSource ? <p className="helper-text">Enable at least one source to continue.</p> : null}
    </div>
  );
}

function SetupDone({
  snapshot,
  openDashboard,
  onBack
}: {
  snapshot: DebugSnapshot | null;
  openDashboard: () => void;
  onBack: () => void;
}) {
  return (
    <div className="setup-step">
      <div className="hero-illustration done" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">All set</p>
      <h2>Mnemonic is ready.</h2>
      <p>The app will keep running from the tray and notify you when your saved context is strong enough for a quiz.</p>
      <div className="ready-grid">
        <DaemonCard snapshot={snapshot} />
        <div className="mini-stat">
          <strong>{snapshot?.events.length ?? 0}</strong>
          <span>saved context notes</span>
        </div>
      </div>
      <div className="button-row">
        <button className="secondary-button" type="button" onClick={onBack}>
          Back
        </button>
        <button type="button" onClick={openDashboard}>
          Open dashboard
        </button>
      </div>
    </div>
  );
}

function Dashboard({
  actionError,
  actionMessage,
  attempt,
  clearLocalData,
  settings,
  snapshot,
  updateSettings,
  requestAccessibilityPermission,
  runCaptureNow,
  openSetup
}: {
  actionError: string | null;
  actionMessage: string | null;
  attempt: QuizAttempt | null;
  clearLocalData: () => Promise<void>;
  settings: CaptureSettings | null;
  snapshot: DebugSnapshot | null;
  updateSettings: (patch: Partial<CaptureSettings>) => Promise<void>;
  requestAccessibilityPermission: () => Promise<void>;
  runCaptureNow: () => Promise<void>;
  openSetup: () => void;
}) {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Mnemonic Desktop</p>
          <h1>Private quiz daemon</h1>
          <p className="lede">
            Mnemonic runs quietly in the tray, stores context locally, and only captures sources that you explicitly
            enable.
          </p>
        </div>
        <DaemonCard snapshot={snapshot} />
      </section>

      <div className="dashboard-actions">
        <button className="secondary-button" type="button" onClick={openSetup}>
          Open setup
        </button>
        <button type="button" onClick={runCaptureNow}>
          Run capture now
        </button>
      </div>
      {actionMessage ? <p className="success-text">{actionMessage}</p> : null}
      {actionError ? <p className="error-text">{actionError}</p> : null}

      <section className="grid">
        <div className="column-left" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <article className="panel primary-panel" style={{ minHeight: "auto" }}>
            <div className="panel-heading">
              <p className="eyebrow">Capture permissions</p>
              <span className="muted">Local-first</span>
            </div>
            {settings ? (
              <PermissionsPanel
                permissions={snapshot?.permissions ?? null}
                settings={settings}
                updateSettings={updateSettings}
                requestAccessibilityPermission={requestAccessibilityPermission}
              />
            ) : (
              <p>Loading...</p>
            )}
          </article>

          <article className="panel" style={{ minHeight: "auto", flex: 1 }}>
            <div className="panel-heading">
              <p className="eyebrow">Latest readiness check</p>
              <StatusBadge status={attempt?.status} />
            </div>
            {attempt ? <AttemptView attempt={attempt} /> : <EmptyState />}
          </article>
        </div>

        <article className="panel" style={{ display: "flex", flexDirection: "column" }}>
          <div className="panel-heading">
            <p className="eyebrow">Raw activity timeline</p>
            <span className="muted">{snapshot?.events.length ?? 0} events</span>
          </div>
          <EventList events={snapshot?.events ?? []} />
          <div className="data-footer">
            <p>Store: {snapshot?.daemon.dataPath ?? "loading..."}</p>
            <button className="danger-button" type="button" onClick={clearLocalData}>
              Delete local data
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}

function DaemonCard({ snapshot }: { snapshot: DebugSnapshot | null }) {
  return (
    <aside className="daemon-card">
      <span className={snapshot?.daemon.running ? "pulse online" : "pulse"} />
      <div>
        <strong>{snapshot?.daemon.running ? "Running in tray" : "Starting daemon"}</strong>
        <p>Last check: {formatDate(snapshot?.daemon.lastRunAt)}</p>
        <p>Next check: {formatDate(snapshot?.daemon.nextRunAt)}</p>
      </div>
    </aside>
  );
}

function PermissionsPanel({
  permissions,
  settings,
  updateSettings,
  requestAccessibilityPermission
}: {
  permissions?: PermissionSnapshot | null;
  settings: CaptureSettings;
  updateSettings: (patch: Partial<CaptureSettings>) => Promise<void>;
  requestAccessibilityPermission?: () => Promise<void>;
}) {
  return (
    <div className="permission-list">
      <ToggleRow
        title="Clipboard"
        description="Reads clipboard text periodically. Sensitive-looking values are redacted before storage."
        checked={settings.clipboardEnabled}
        onChange={(checked) => updateSettings({ clipboardEnabled: checked })}
      />
      <PermissionActionRow
        title="Accessibility"
        description="Required for accurate frontmost app/window detection."
        status={permissions?.accessibility}
        checked={permissions?.accessibility === "granted"}
        onRequest={requestAccessibilityPermission}
        onChange={() => undefined}
      />
      <ToggleRow
        title="Frontmost window"
        description="Captures the active app and focused window title when Accessibility is granted."
        checked={settings.activeWindowEnabled}
        disabled={permissions?.accessibility !== "granted"}
        onChange={(checked) => updateSettings({ activeWindowEnabled: checked })}
      />
    </div>
  );
}

function PermissionActionRow({
  title,
  description,
  status,
  checked,
  disabled = false,
  onRequest,
  onChange
}: {
  title: string;
  description: string;
  status?: string;
  checked: boolean;
  disabled?: boolean;
  onRequest?: () => Promise<void>;
  onChange: (checked: boolean) => void;
}) {
  const canToggle = !disabled && status === "granted";
  const isGranted = status === "granted";

  return (
    <div className={`toggle-row permission-action ${disabled ? "disabled" : ""}`}>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
        <em>Status: {statusLabel(status)}</em>
      </span>
      <div className="permission-controls">
        {onRequest && !isGranted ? (
          <button className="secondary-button compact-button" type="button" onClick={() => void onRequest()}>
            {status === "denied" || status === "restricted" ? "Open Settings" : "Request"}
          </button>
        ) : isGranted ? (
          <span className="granted-pill">Already granted</span>
        ) : null}
        <input disabled={!canToggle} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  disabled = false,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`toggle-row ${disabled ? "disabled" : ""}`}>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input disabled={disabled} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}



function AttemptView({ attempt }: { attempt: QuizAttempt }) {
  if (attempt.status === "blocked") {
    return (
      <div className="blocked">
        <h2>Quiz not ready yet</h2>
        <p>{attempt.reason}</p>
        <SourceChips events={attempt.sourceEvents} />
      </div>
    );
  }

  return (
    <div className="questions">
      <p className="reason">{attempt.reason}</p>
      {attempt.questions.map((question, index) => (
        <div className="question-card" key={question.id}>
          <span>Question {index + 1}</span>
          <h2>{question.question}</h2>
          <p>{question.answer}</p>
        </div>
      ))}
    </div>
  );
}

function EventList({ events }: { events: CaptureEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="muted">
        No raw activity captured yet. Enable frontmost window and screen previews, then click Run capture now or wait for
        the next daemon check.
      </p>
    );
  }

  return (
    <div className="event-list">
      {events.map((event) => (
        <div className="event-card" key={event.id}>
          <div>
            <strong>{event.source}</strong>
            <span>{formatDate(event.capturedAt)}</span>
          </div>
          <p>{event.content}</p>
          {event.metadata ? <MetadataView event={event} /> : null}
          <small>Sensitivity: {event.sensitivity}</small>
        </div>
      ))}
    </div>
  );
}

function MetadataView({ event }: { event: CaptureEvent }) {
  const metadata = event.metadata;

  if (!metadata) {
    return null;
  }

  return (
    <dl className="metadata-list">
      {metadata.appName ? (
        <>
          <dt>App</dt>
          <dd>{metadata.appName}</dd>
        </>
      ) : null}
      {metadata.windowTitle ? (
        <>
          <dt>Window</dt>
          <dd>{metadata.windowTitle}</dd>
        </>
      ) : null}
      {metadata.url ? (
        <>
          <dt>URL</dt>
          <dd>
            <a href={metadata.url} target="_blank" rel="noopener noreferrer" style={{ color: "#39706f", textDecoration: "underline" }}>
              {metadata.url}
            </a>
          </dd>
        </>
      ) : null}
      {metadata.tabTitle ? (
        <>
          <dt>Tab</dt>
          <dd>{metadata.tabTitle}</dd>
        </>
      ) : null}
      {metadata.uiText ? (
        <>
          <dt>Visible Text</dt>
          <dd style={{ maxHeight: "120px", overflowY: "auto", whiteSpace: "pre-wrap", background: "rgba(28, 23, 18, 0.02)", padding: "6px", borderRadius: "6px", fontSize: "0.78rem" }}>
            {metadata.uiText}
          </dd>
        </>
      ) : null}
      {metadata.ocrText ? (
        <>
          <dt>OCR Text</dt>
          <dd style={{ display: "grid", gap: "6px" }}>
            <div style={{ maxHeight: "140px", overflowY: "auto", whiteSpace: "pre-wrap", background: "rgba(57, 112, 111, 0.08)", padding: "6px", borderRadius: "6px", fontSize: "0.78rem" }}>
              {metadata.ocrText}
            </div>
            {metadata.ocrAverageConfidence !== undefined || metadata.ocrImageSize ? (
              <small className="muted">
                {metadata.ocrAverageConfidence !== undefined ? `Confidence ${Math.round(metadata.ocrAverageConfidence * 100)}%` : null}
                {metadata.ocrAverageConfidence !== undefined && metadata.ocrImageSize ? " • " : null}
                {metadata.ocrImageSize ? `${metadata.ocrImageSize.width}x${metadata.ocrImageSize.height}` : null}
              </small>
            ) : null}
          </dd>
        </>
      ) : null}
      {metadata.displayName ? (
        <>
          <dt>Display</dt>
          <dd>{metadata.displayName}</dd>
        </>
      ) : null}
      {metadata.screenshotPath ? (
        <>
          <dt>Screenshot</dt>
          <dd className="metadata-screenshot">
            <ImageAssetPreview imagePath={metadata.screenshotPath} source={event.source} />
          </dd>
        </>
      ) : null}
    </dl>
  );
}

function ImageAssetPreview({ imagePath, source }: { imagePath: string; source: CaptureEvent["source"] }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setImageSrc(null);
    setLoadError(null);

    window.mnemonic
      .readImageAsset(imagePath)
      .then((src) => {
        if (active) {
          setImageSrc(src);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Preview unavailable");
        }
      });

    return () => {
      active = false;
    };
  }, [imagePath]);

  return (
    <>
      <button
        className="link-button"
        type="button"
        onClick={() => {
          void window.mnemonic.openImageAsset(imagePath);
        }}
      >
        Open captured preview
      </button>
      {imageSrc ? <img alt={`Captured preview for ${source}`} src={imageSrc} /> : null}
      {loadError ? <small className="error-text">{loadError}</small> : null}
    </>
  );
}

function SourceChips({ events }: { events: CaptureEvent[] }) {
  if (events.length === 0) {
    return <p className="muted">No usable source notes passed the current filters.</p>;
  }

  return (
    <div className="chips">
      {events.map((event) => (
        <span key={event.id}>{event.source}</span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status?: QuizAttempt["status"] }) {
  const label = status === "quiz_ready" ? "Quiz ready" : status === "blocked" ? "Blocked" : "Waiting";
  return <span className={`status ${status ?? "waiting"}`}>{label}</span>;
}

function EmptyState() {
  return (
    <div className="empty">
      <h2>Waiting for first real context</h2>
      <p>Enable a source, save a few useful notes, and Mnemonic will check whether a quiz can be generated.</p>
    </div>
  );
}

function statusLabel(status?: string) {
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

function hasAnyEnabledSource(settings: CaptureSettings) {
  return (
    settings.clipboardEnabled ||
    settings.activeWindowEnabled
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return "not yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

createRoot(document.getElementById("root")!).render(<App />);
