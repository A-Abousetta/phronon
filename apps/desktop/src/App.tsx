import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { getReaderShortcutAction, isInteractiveElement, splitIntoParagraphs } from "./readerControls";

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
  fileType: "txt" | "pdf" | null;
  error: string | null;
  isLoading: boolean;
};

type PlaybackState = "idle" | "playing" | "paused";

type PlaybackRange = {
  startIndex: number;
  endIndex: number;
};

function ReaderScreen() {
  const [documentState, setDocumentState] = useState<ReaderDocumentState>({
    filePath: null,
    text: null,
    fileType: null,
    error: null,
    isLoading: false
  });
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackMessage, setPlaybackMessage] = useState(
    "Load a .txt or text-based .pdf file to start playback."
  );
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const readerPanelRef = useRef<HTMLDivElement | null>(null);
  const playbackRangeRef = useRef<PlaybackRange | null>(null);
  const playbackSessionRef = useRef(0);
  const playbackStateRef = useRef<PlaybackState>("idle");
  const playbackRateRef = useRef(1);
  const restartPausedParagraphRef = useRef(false);

  function clampPlaybackRate(value: number) {
    return Math.min(2, Math.max(0.5, Math.round(value * 10) / 10));
  }

  const paragraphs = splitIntoParagraphs(documentState.text);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  function stopPlayback(message: string, nextState: PlaybackState = "idle") {
    playbackSessionRef.current += 1;
    playbackRangeRef.current = null;
    utteranceRef.current = null;
    restartPausedParagraphRef.current = false;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setPlaybackState(nextState);
    setPlaybackMessage(message);
  }

  function playParagraphChunk(paragraphIndex: number, sessionId: number, startMessage: string) {
    if (!("speechSynthesis" in window)) {
      stopPlayback("Speech playback is not available in this version of the app.");
      return;
    }

    const playbackRange = playbackRangeRef.current;

    if (!playbackRange || sessionId !== playbackSessionRef.current) {
      return;
    }

    const paragraph = paragraphs[paragraphIndex];

    if (!paragraph) {
      stopPlayback("Playback finished.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(paragraph);
    utterance.rate = playbackRateRef.current;
    utterance.onstart = () => {
      if (sessionId !== playbackSessionRef.current) {
        return;
      }

      utteranceRef.current = utterance;
      setCurrentParagraphIndex(paragraphIndex);
      setPlaybackState("playing");
      setPlaybackMessage(
        paragraphIndex === playbackRange.startIndex
          ? startMessage
          : `Reading paragraph ${paragraphIndex + 1} of ${paragraphs.length}.`
      );
    };
    utterance.onend = () => {
      if (sessionId !== playbackSessionRef.current || utteranceRef.current !== utterance) {
        return;
      }

      utteranceRef.current = null;

      if (paragraphIndex >= playbackRange.endIndex) {
        stopPlayback("Playback finished.");
        return;
      }

      playParagraphChunk(paragraphIndex + 1, sessionId, startMessage);
    };
    utterance.onerror = () => {
      if (sessionId !== playbackSessionRef.current || utteranceRef.current !== utterance) {
        return;
      }

      stopPlayback("Phronon could not play the current text.");
    };

    window.speechSynthesis.speak(utterance);
  }

  function startChunkedPlayback(startIndex: number, endIndex: number, startMessage: string) {
    if (paragraphs.length === 0) {
      setPlaybackState("idle");
      setPlaybackMessage("Load a document with readable paragraphs before starting playback.");
      return;
    }

    if (!("speechSynthesis" in window)) {
      setPlaybackState("idle");
      setPlaybackMessage("Speech playback is not available in this version of the app.");
      return;
    }

    const safeStartIndex = Math.min(Math.max(startIndex, 0), paragraphs.length - 1);
    const safeEndIndex = Math.min(Math.max(endIndex, safeStartIndex), paragraphs.length - 1);
    const sessionId = playbackSessionRef.current + 1;

    playbackSessionRef.current = sessionId;
    playbackRangeRef.current = {
      startIndex: safeStartIndex,
      endIndex: safeEndIndex
    };
    restartPausedParagraphRef.current = false;
    utteranceRef.current = null;
    window.speechSynthesis.cancel();
    playParagraphChunk(safeStartIndex, sessionId, startMessage);
  }

  useEffect(() => {
    return () => {
      playbackSessionRef.current += 1;
      playbackRangeRef.current = null;
      utteranceRef.current = null;
      restartPausedParagraphRef.current = false;

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      utteranceRef.current = null;
      playbackRangeRef.current = null;
      restartPausedParagraphRef.current = false;
      setPlaybackState("idle");
      setPlaybackMessage("Speech playback is not available in this version of the app.");
      return;
    }

    playbackSessionRef.current += 1;
    playbackRangeRef.current = null;
    utteranceRef.current = null;
    restartPausedParagraphRef.current = false;
    window.speechSynthesis.cancel();
    setPlaybackState("idle");
    setPlaybackMessage(
      documentState.text
        ? "Text is ready to play."
        : "Load a .txt or text-based .pdf file to start playback."
    );
  }, [documentState.text]);

  useEffect(() => {
    setCurrentParagraphIndex(0);
  }, [documentState.text]);

  useEffect(() => {
    if (paragraphs.length === 0) {
      if (currentParagraphIndex !== 0) {
        setCurrentParagraphIndex(0);
      }
      return;
    }

    if (currentParagraphIndex > paragraphs.length - 1) {
      setCurrentParagraphIndex(paragraphs.length - 1);
    }
  }, [currentParagraphIndex, paragraphs.length]);

  useEffect(() => {
    const currentParagraph = paragraphRefs.current[currentParagraphIndex];

    currentParagraph?.scrollIntoView({
      block: "nearest"
    });
  }, [currentParagraphIndex]);

  useEffect(() => {
    readerPanelRef.current?.focus();
  }, []);

  async function handleOpenFile() {
    setDocumentState((current) => ({
      ...current,
      error: null,
      isLoading: true
    }));

    try {
      const result = await window.phronon.openReaderDocument();

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
        fileType: "fileType" in result ? result.fileType : null,
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
    if (!documentState.text?.trim()) {
      setPlaybackState("idle");
      setPlaybackMessage("Load a .txt or text-based .pdf file before starting playback.");
      return;
    }

    if (
      playbackStateRef.current === "paused" &&
      restartPausedParagraphRef.current &&
      playbackRangeRef.current
    ) {
      startChunkedPlayback(
        currentParagraphIndex,
        playbackRangeRef.current.endIndex,
        `Playback resumed from paragraph ${currentParagraphIndex + 1} of ${paragraphs.length} at ${playbackRateRef.current.toFixed(1)}x.`
      );
      return;
    }

    if ("speechSynthesis" in window && window.speechSynthesis.paused && window.speechSynthesis.speaking) {
      window.speechSynthesis.resume();
      setPlaybackState("playing");
      setPlaybackMessage("Playback resumed.");
      return;
    }

    startChunkedPlayback(
      currentParagraphIndex,
      paragraphs.length - 1,
      `Playback started from paragraph ${currentParagraphIndex + 1} of ${paragraphs.length}.`
    );
  }

  function handleRepeatCurrentParagraph() {
    const currentParagraph = paragraphs[currentParagraphIndex];

    if (!currentParagraph) {
      setPlaybackState("idle");
      setPlaybackMessage("Load a document with readable paragraphs before repeating a paragraph.");
      return;
    }

    startChunkedPlayback(
      currentParagraphIndex,
      currentParagraphIndex,
      `Repeating paragraph ${currentParagraphIndex + 1} of ${paragraphs.length}.`
    );
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

    stopPlayback("Playback stopped.");
  }

  function handlePlaybackRateChange(nextRate: number) {
    const safeNextRate = clampPlaybackRate(nextRate);

    setPlaybackRate(safeNextRate);

    if (!("speechSynthesis" in window)) {
      return;
    }

    playbackRateRef.current = safeNextRate;

    if (playbackStateRef.current === "playing" && playbackRangeRef.current) {
      setPlaybackMessage(
        `Reading speed set to ${safeNextRate.toFixed(1)}x. It will apply on the next paragraph.`
      );
      return;
    }

    if (playbackStateRef.current === "paused" && playbackRangeRef.current) {
      restartPausedParagraphRef.current = true;
      playbackSessionRef.current += 1;
      utteranceRef.current = null;
      window.speechSynthesis.cancel();
      setPlaybackState("paused");
      setPlaybackMessage(
        `Reading speed set to ${safeNextRate.toFixed(1)}x. Press Play to continue from paragraph ${currentParagraphIndex + 1} at the new speed.`
      );
      return;
    }

    setPlaybackMessage(`Reading speed set to ${safeNextRate.toFixed(1)}x.`);
  }

  function changePlaybackRate(step: number) {
    handlePlaybackRateChange(clampPlaybackRate(playbackRateRef.current + step));
  }

  useEffect(() => {
    function handleReaderKeydown(event: KeyboardEvent) {
      if (isInteractiveElement(event.target)) {
        return;
      }

      const action = getReaderShortcutAction(event);

      if (!action) {
        return;
      }

      event.preventDefault();

      switch (action) {
        case "open":
          void handleOpenFile();
          return;
        case "togglePlayPause":
          if (playbackStateRef.current === "playing") {
            handlePause();
          } else {
            handlePlay();
          }
          return;
        case "stop":
          handleStop();
          return;
        case "nextParagraph":
          setCurrentParagraphIndex((currentIndex) =>
            paragraphs.length === 0 ? 0 : Math.min(currentIndex + 1, paragraphs.length - 1)
          );
          return;
        case "previousParagraph":
          setCurrentParagraphIndex((currentIndex) => Math.max(currentIndex - 1, 0));
          return;
        case "repeatCurrentParagraph":
          handleRepeatCurrentParagraph();
          return;
        case "increaseSpeed":
          changePlaybackRate(0.1);
          return;
        case "decreaseSpeed":
          changePlaybackRate(-0.1);
          return;
      }
    }

    window.addEventListener("keydown", handleReaderKeydown);

    return () => {
      window.removeEventListener("keydown", handleReaderKeydown);
    };
  }, [paragraphs.length, documentState.text, currentParagraphIndex]);

  const statusMessage = documentState.error
    ? documentState.error
    : documentState.filePath
      ? `Loaded ${documentState.fileType === "pdf" ? "PDF" : "text"} file: ${documentState.filePath}. Paragraph ${Math.min(currentParagraphIndex + 1, Math.max(paragraphs.length, 1))} of ${paragraphs.length || 0}.`
      : "No document loaded. Paragraph 0 of 0.";

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
        title="Open a document"
        description="Choose a plain text file or a text-based PDF and read it directly in the accessible reader area."
      >
        <div className="stack">
          <button
            className="primary-button"
            type="button"
            onClick={handleOpenFile}
            disabled={documentState.isLoading}
          >
            {documentState.isLoading ? "Opening document..." : "Open .txt or .pdf file"}
          </button>
          <p className={documentState.error ? "status-message error-text" : "status-message"} aria-live="polite">
            {statusMessage}
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Document text"
        description="The extracted text from the selected document appears here, split into readable paragraphs."
      >
        <div ref={readerPanelRef} className="reader-panel" tabIndex={-1} aria-label="Document text area">
          {paragraphs.length > 0 ? (
            <div className="reader-text" role="list" aria-label="Document paragraphs">
              {paragraphs.map((paragraph, index) => (
                <p
                  key={`${index}-${paragraph.slice(0, 32)}`}
                  ref={(element) => {
                    paragraphRefs.current[index] = element;
                  }}
                  className={index === currentParagraphIndex ? "reader-paragraph current-paragraph" : "reader-paragraph"}
                  role="listitem"
                  aria-current={index === currentParagraphIndex ? "true" : undefined}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              No file is loaded. Use the &quot;Open .txt or .pdf file&quot; button to choose a readable document.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Playback controls"
        description="Use local device speech to read the loaded text aloud."
      >
        <div className="controls" role="group" aria-label="Playback controls">
          <p className="hint">
            Shortcuts: Ctrl+O opens a document, Space plays, pauses, or resumes from the current paragraph, S stops
            playback, J and K move between paragraphs, R repeats the current paragraph, and Alt+Up or Alt+Down adjust
            speed.
          </p>
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
              onChange={(event) => handlePlaybackRateChange(Number(event.target.value))}
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
          <p className="status-message" role="status" aria-live="polite" aria-atomic="true">
            {paragraphs.length > 0
              ? `Current paragraph: ${currentParagraphIndex + 1} of ${paragraphs.length}.`
              : "Current paragraph: no document loaded."}
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
