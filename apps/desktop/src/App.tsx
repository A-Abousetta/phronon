import { useId, useState, type ReactNode } from "react";

type ScreenId = "home" | "reader" | "settings";

type Screen = {
  id: ScreenId;
  label: string;
  title: string;
  description: string;
};

const screens: Screen[] = [
  {
    id: "home",
    label: "Home",
    title: "Study material at a glance",
    description: "Import study files, review recent items, and start reading quickly."
  },
  {
    id: "reader",
    label: "Reader",
    title: "Accessible reading workspace",
    description: "Read extracted text and control playback from a predictable keyboard-first layout."
  },
  {
    id: "settings",
    label: "Settings",
    title: "Preferences",
    description: "Adjust language, reading voice placeholders, and interface defaults."
  }
];

function SectionCard(props: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const headingId = useId();

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-header">
        <h2 id={headingId}>{props.title}</h2>
        <p>{props.description}</p>
      </div>
      {props.children}
    </section>
  );
}

function HomeScreen() {
  return (
    <div className="screen-grid">
      <SectionCard
        title="Import study material"
        description="Placeholder area for document import. Keyboard action comes first."
      >
        <div className="stack">
          <button className="primary-button" type="button">
            Import File
          </button>
          <p className="hint">Planned support: TXT, PDF, and image files.</p>
        </div>
      </SectionCard>

      <SectionCard
        title="Recent documents"
        description="Placeholder list for recently opened study material."
      >
        <ul className="plain-list" aria-label="Recent documents">
          <li>Biology Chapter 3.txt</li>
          <li>Arabic Literature Notes.pdf</li>
          <li>World History Scan.jpg</li>
        </ul>
      </SectionCard>
    </div>
  );
}

type ReaderDocumentState = {
  filePath: string | null;
  text: string | null;
  error: string | null;
  isLoading: boolean;
};

function ReaderScreen() {
  const [documentState, setDocumentState] = useState<ReaderDocumentState>({
    filePath: null,
    text: null,
    error: null,
    isLoading: false
  });

  async function handleOpenFile() {
    setDocumentState((current) => ({
      ...current,
      error: null,
      isLoading: true
    }));

    try {
      const result = await window.phronon.openTextDocument();

      if (result.canceled) {
        setDocumentState((current) => ({
          ...current,
          error: null,
          isLoading: false
        }));
        return;
      }

      if (result.error) {
        setDocumentState((current) => ({
          ...current,
          error: result.error,
          isLoading: false
        }));
        return;
      }

      setDocumentState({
        filePath: result.filePath ?? null,
        text: result.text ?? null,
        error: null,
        isLoading: false
      });
    } catch {
      setDocumentState((current) => ({
        ...current,
        error: "Phronon could not open the selected file.",
        isLoading: false
      }));
    }
  }

  const statusMessage = documentState.error
    ? documentState.error
    : documentState.filePath
      ? `Loaded file: ${documentState.filePath}`
      : "No text file loaded yet.";

  return (
    <div className="screen-grid">
      <SectionCard
        title="Open a text document"
        description="Choose a plain text file and read it directly in the accessible reader area."
      >
        <div className="stack">
          <button
            className="primary-button"
            type="button"
            onClick={handleOpenFile}
            disabled={documentState.isLoading}
          >
            {documentState.isLoading ? "Opening text file..." : "Open .txt file"}
          </button>
          <p className={documentState.error ? "status-message error-text" : "status-message"} aria-live="polite">
            {statusMessage}
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Document text"
        description="The full contents of the selected .txt file appear here."
      >
        <div className="reader-panel" tabIndex={0} aria-label="Document text area">
          {documentState.text ? (
            <pre className="reader-text">{documentState.text}</pre>
          ) : (
            <p className="empty-state">
              No file is loaded. Use the &quot;Open .txt file&quot; button to choose a plain text document.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Playback controls"
        description="Placeholder controls for text-to-speech playback."
      >
        <div className="controls" role="group" aria-label="Playback controls">
          <button type="button">Play</button>
          <button type="button">Pause</button>
          <button type="button">Stop</button>
          <label className="field">
            <span>Reading speed</span>
            <input type="range" min="0.5" max="2" step="0.1" defaultValue="1" />
          </label>
        </div>
      </SectionCard>
    </div>
  );
}

function SettingsScreen() {
  const languageId = useId();
  const startupId = useId();

  return (
    <div className="screen-grid">
      <SectionCard
        title="Interface settings"
        description="Minimal preferences placeholders with clear labels."
      >
        <div className="form-grid">
          <label className="field" htmlFor={languageId}>
            <span>Interface language</span>
            <select id={languageId} defaultValue="en">
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </label>

          <label className="field" htmlFor={startupId}>
            <span>Open on startup</span>
            <select id={startupId} defaultValue="home">
              <option value="home">Home</option>
              <option value="reader">Reader</option>
              <option value="settings">Settings</option>
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        title="Accessibility notes"
        description="Accessibility commitments for the first version."
      >
        <ul className="plain-list">
          <li>Keyboard navigation is available for every main action.</li>
          <li>Focus states stay visible.</li>
          <li>Screen labels remain explicit and simple.</li>
        </ul>
      </SectionCard>
    </div>
  );
}

export function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>("home");
  const currentScreen = screens.find((screen) => screen.id === activeScreen)!;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="app-header">
        <div>
          <p className="eyebrow">Phronon</p>
          <h1>{currentScreen.title}</h1>
          <p>{currentScreen.description}</p>
        </div>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label="Primary">
          <ul className="nav-list">
            {screens.map((screen) => (
              <li key={screen.id}>
                <button
                  type="button"
                  className={screen.id === activeScreen ? "nav-button active" : "nav-button"}
                  aria-current={screen.id === activeScreen ? "page" : undefined}
                  onClick={() => setActiveScreen(screen.id)}
                >
                  {screen.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main-content" className="main-panel" tabIndex={-1}>
          {activeScreen === "home" && <HomeScreen />}
          {activeScreen === "reader" && <ReaderScreen />}
          {activeScreen === "settings" && <SettingsScreen />}
        </main>
      </div>
    </div>
  );
}
