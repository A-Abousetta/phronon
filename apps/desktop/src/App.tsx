import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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

type PlaybackState = "idle" | "playing" | "paused";

function isInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="slider"]'
    )
  );
}

function ReaderScreen() {
  const [documentState, setDocumentState] = useState<ReaderDocumentState>({
    filePath: null,
    text: null,
    error: null,
    isLoading: false
  });
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackMessage, setPlaybackMessage] = useState("Load a text file to start playback.");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      utteranceRef.current = null;
      setPlaybackState("idle");
      setPlaybackMessage("Speech playback is not available in this version of the app.");
      return;
    }

    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setPlaybackState("idle");
    setPlaybackMessage(
      documentState.text
        ? "Text is ready to play."
        : "Load a text file to start playback."
    );
  }, [documentState.text]);

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

  function handlePlay() {
    const textToRead = documentState.text?.trim();

    if (!textToRead) {
      setPlaybackState("idle");
      setPlaybackMessage("Load a text file before starting playback.");
      return;
    }

    if (!("speechSynthesis" in window)) {
      setPlaybackState("idle");
      setPlaybackMessage("Speech playback is not available in this version of the app.");
      return;
    }

    if (window.speechSynthesis.paused && window.speechSynthesis.speaking) {
      window.speechSynthesis.resume();
      setPlaybackState("playing");
      setPlaybackMessage("Playback resumed.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.rate = playbackRate;
    utterance.onstart = () => {
      setPlaybackState("playing");
      setPlaybackMessage("Playback started.");
    };
    utterance.onend = () => {
      if (utteranceRef.current !== utterance) {
        return;
      }

      utteranceRef.current = null;
      setPlaybackState("idle");
      setPlaybackMessage("Playback finished.");
    };
    utterance.onerror = () => {
      if (utteranceRef.current !== utterance) {
        return;
      }

      utteranceRef.current = null;
      setPlaybackState("idle");
      setPlaybackMessage("Phronon could not play the current text.");
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function handlePause() {
    if (!("speechSynthesis" in window) || !window.speechSynthesis.speaking || window.speechSynthesis.paused) {
      return;
    }

    window.speechSynthesis.pause();
    setPlaybackState("paused");
    setPlaybackMessage("Playback paused.");
  }

  function handleStop() {
    if (!("speechSynthesis" in window)) {
      setPlaybackState("idle");
      setPlaybackMessage("Speech playback is not available in this version of the app.");
      return;
    }

    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setPlaybackState("idle");
    setPlaybackMessage("Playback stopped.");
  }

  useEffect(() => {
    function handleReaderKeydown(event: KeyboardEvent) {
      if (isInteractiveElement(event.target)) {
        return;
      }

      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void handleOpenFile();
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();

        if (playbackState === "playing") {
          handlePause();
        } else {
          handlePlay();
        }
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleStop();
      }
    }

    window.addEventListener("keydown", handleReaderKeydown);

    return () => {
      window.removeEventListener("keydown", handleReaderKeydown);
    };
  }, [playbackState, playbackRate, documentState.text]);

  const statusMessage = documentState.error
    ? documentState.error
    : documentState.filePath
      ? `Loaded file: ${documentState.filePath}`
      : "No text file loaded yet.";

  const hasText = Boolean(documentState.text?.trim());
  const speechSynthesisAvailable = "speechSynthesis" in window;
  const speedValueId = useId();
  const statusToneClass = documentState.error || !speechSynthesisAvailable ? "status-message error-text" : "status-message";
  const playbackStatusLabel = !documentState.text
    ? "waiting for a file"
    : playbackState === "playing"
      ? "playing"
      : playbackState === "paused"
        ? "paused"
        : playbackMessage === "Playback stopped."
          ? "stopped"
          : "ready";

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
        description="Use local device speech to read the loaded text aloud."
      >
        <div className="controls" role="group" aria-label="Playback controls">
          <p className="hint">Shortcuts: Ctrl+O opens a text file, Space plays or pauses, and S stops playback.</p>
          <button type="button" onClick={handlePlay} aria-describedby="playback-status">
            {playbackState === "paused" ? "Resume" : "Play"}
          </button>
          <button
            type="button"
            onClick={handlePause}
            disabled={!speechSynthesisAvailable || playbackState !== "playing"}
          >
            Pause
          </button>
          <button
            type="button"
            onClick={handleStop}
            disabled={!speechSynthesisAvailable || playbackState === "idle"}
          >
            Stop
          </button>
          <label className="field">
            <span>Reading speed</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={playbackRate}
              onChange={(event) => setPlaybackRate(Number(event.target.value))}
              aria-describedby={speedValueId}
            />
            <span id={speedValueId} className="hint">
              Current speed: {playbackRate.toFixed(1)}x
            </span>
          </label>
          <p
            id="playback-status"
            className={statusToneClass}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <strong>Playback status:</strong> {playbackStatusLabel}. {playbackMessage}
          </p>
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
