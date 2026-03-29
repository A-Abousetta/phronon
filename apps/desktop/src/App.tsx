import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  getAppShortcutAction,
  getReaderShortcutAction,
  isInteractiveElement,
  splitIntoParagraphs,
  splitParagraphIntoSpeechChunks
} from "./readerControls";
import {
  buildDocumentOpenFailureMessage,
  clampParagraphIndex,
  clampReadingSpeed,
  createLoadedDocumentState,
  defaultReaderPersistenceState,
  emptyReaderDocumentState,
  getDocumentFileName,
  readReaderPersistenceState,
  type ReaderDocumentState,
  type RecentDocument,
  upsertRecentDocument,
  writeReaderPersistenceState
} from "./documentWorkflow";
import {
  chooseSpeechVoice,
  findArabicVoice,
  type SpeechVoicePreference
} from "./speechVoices";

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

type PlaybackState = "idle" | "playing" | "paused";

type PlaybackRange = {
  startIndex: number;
  endIndex: number;
};

type PlaybackPosition = {
  paragraphIndex: number;
  chunkIndex: number;
};

type OpenDocumentResult =
  | {
      canceled: true;
    }
  | {
      canceled: false;
      filePath: string;
      text: string;
      fileType: "txt" | "pdf";
      error?: undefined;
    }
  | {
      canceled: false;
      error: string;
      filePath?: string | undefined;
      text?: undefined;
      fileType?: undefined;
    };

type OpenDocumentSuccessResult = Extract<
  OpenDocumentResult,
  {
    canceled: false;
    filePath: string;
    text: string;
    fileType: "txt" | "pdf";
  }
>;

function HomeScreen(props: {
  documentState: ReaderDocumentState;
  recentDocuments: RecentDocument[];
  onImportFile: () => Promise<void>;
  onOpenRecentDocument: (filePath: string) => Promise<void>;
}) {
  return (
    <section className="page-workspace" aria-label="Home workspace">
      <div className="page-banner">
        <div>
          <p className="page-banner-label">Home</p>
          <h2>Start studying without extra clutter</h2>
          <p className="page-banner-text">
            Keep import and recent material close at hand in a simple, keyboard-first workspace.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={() => void props.onImportFile()} disabled={props.documentState.isLoading}>
          {props.documentState.isLoading ? "Opening document..." : "Import File"}
        </button>
      </div>

      <div className="page-columns">
        <section className="panel-section" aria-labelledby="home-import-title">
          <div className="panel-section-header">
            <p className="panel-kicker">Quick start</p>
            <h3 id="home-import-title">Import study material</h3>
            <p>Bring in a file and move into reading with as few steps as possible.</p>
          </div>
          <div className="stack">
            <p className={props.documentState.error ? "status-message error-text compact-status" : "status-message compact-status"}>
              {props.documentState.error
                ? props.documentState.error
                : props.documentState.filePath
                  ? `Current document: ${getDocumentFileName(props.documentState.filePath)}.`
                  : "No document is loaded yet."}
            </p>
            <p className="hint">Planned support: TXT, PDF, and image files.</p>
          </div>
        </section>

        <section className="panel-section" aria-labelledby="home-recent-title">
          <div className="panel-section-header">
            <p className="panel-kicker">Recent</p>
            <h3 id="home-recent-title">Continue where you left off</h3>
            <p>Recent study material stays visible without taking over the screen.</p>
          </div>
          {props.recentDocuments.length > 0 ? (
            <ul className="simple-list" aria-label="Recent documents">
              {props.recentDocuments.map((document) => (
                <li key={document.filePath}>
                  <button
                    type="button"
                    className="recent-document-button"
                    onClick={() => void props.onOpenRecentDocument(document.filePath)}
                  >
                    <span className="recent-document-name">{document.fileName}</span>
                    <span className="recent-document-meta">
                      {document.fileType.toUpperCase()} file
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No recent documents yet. Import a TXT or PDF file to see it here.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function isOpenDocumentSuccessResult(result: OpenDocumentResult): result is OpenDocumentSuccessResult {
  return (
    result.canceled === false &&
    "filePath" in result &&
    "text" in result &&
    "fileType" in result
  );
}

function ReaderScreen(props: {
  documentState: ReaderDocumentState;
  currentParagraphIndex: number;
  onCurrentParagraphIndexChange: (nextIndex: number) => void;
  onOpenDocument: () => Promise<void>;
  availableVoices: SpeechSynthesisVoice[];
  voicesInitialized: boolean;
  playbackRate: number;
  onPlaybackRateChange: (nextRate: number) => void;
  speechVoicePreference: SpeechVoicePreference;
}) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackMessage, setPlaybackMessage] = useState(
    "Load a .txt or .pdf file to start playback."
  );
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const readerPanelRef = useRef<HTMLDivElement | null>(null);
  const playbackRangeRef = useRef<PlaybackRange | null>(null);
  const playbackPositionRef = useRef<PlaybackPosition | null>(null);
  const playbackSessionRef = useRef(0);
  const playbackStateRef = useRef<PlaybackState>("idle");
  const playbackRateRef = useRef(props.playbackRate);
  const restartPausedParagraphRef = useRef(false);
  const paragraphs = splitIntoParagraphs(props.documentState.text);

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    playbackRateRef.current = props.playbackRate;
  }, [props.playbackRate]);

  function stopPlayback(message: string, nextState: PlaybackState = "idle") {
    playbackSessionRef.current += 1;
    playbackRangeRef.current = null;
    playbackPositionRef.current = null;
    utteranceRef.current = null;
    restartPausedParagraphRef.current = false;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setPlaybackState(nextState);
    setPlaybackMessage(message);
  }

  function playSpeechChunk(paragraphIndex: number, chunkIndex: number, sessionId: number, startMessage: string) {
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

    const speechChunks = splitParagraphIntoSpeechChunks(paragraph);
    const currentChunk = speechChunks[chunkIndex];

    if (!currentChunk) {
      if (paragraphIndex >= playbackRange.endIndex) {
        stopPlayback("Playback finished.");
        return;
      }

      playSpeechChunk(paragraphIndex + 1, 0, sessionId, startMessage);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(currentChunk);
    const voiceChoice = chooseSpeechVoice({
      voices: props.availableVoices,
      text: currentChunk,
      preference: props.speechVoicePreference
    });

    if (voiceChoice.voice) {
      utterance.voice = voiceChoice.voice;

      if (voiceChoice.voice.lang.trim()) {
        utterance.lang = voiceChoice.voice.lang;
      }
    }

    utterance.rate = playbackRateRef.current;
    utterance.onstart = () => {
      if (sessionId !== playbackSessionRef.current) {
        return;
      }

      playbackPositionRef.current = {
        paragraphIndex,
        chunkIndex
      };
      utteranceRef.current = utterance;
      props.onCurrentParagraphIndexChange(paragraphIndex);
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
      playbackPositionRef.current = {
        paragraphIndex,
        chunkIndex: chunkIndex + 1
      };

      if (chunkIndex < speechChunks.length - 1) {
        playSpeechChunk(paragraphIndex, chunkIndex + 1, sessionId, startMessage);
        return;
      }

      if (paragraphIndex >= playbackRange.endIndex) {
        stopPlayback("Playback finished.");
        return;
      }

      playSpeechChunk(paragraphIndex + 1, 0, sessionId, startMessage);
    };
    utterance.onerror = () => {
      if (sessionId !== playbackSessionRef.current || utteranceRef.current !== utterance) {
        return;
      }

      stopPlayback("Phronon could not play the current text.");
    };

    window.speechSynthesis.speak(utterance);
  }

  function startChunkedPlayback(
    startIndex: number,
    endIndex: number,
    startMessage: string,
    startChunkIndex = 0
  ) {
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
    playbackPositionRef.current = {
      paragraphIndex: safeStartIndex,
      chunkIndex: Math.max(startChunkIndex, 0)
    };
    restartPausedParagraphRef.current = false;
    utteranceRef.current = null;
    window.speechSynthesis.cancel();
    playSpeechChunk(safeStartIndex, Math.max(startChunkIndex, 0), sessionId, startMessage);
  }

  useEffect(() => {
    return () => {
      playbackSessionRef.current += 1;
      playbackRangeRef.current = null;
      playbackPositionRef.current = null;
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
      playbackPositionRef.current = null;
      restartPausedParagraphRef.current = false;
      setPlaybackState("idle");
      setPlaybackMessage("Speech playback is not available in this version of the app.");
      return;
    }

    playbackSessionRef.current += 1;
    playbackRangeRef.current = null;
    playbackPositionRef.current = null;
    utteranceRef.current = null;
    restartPausedParagraphRef.current = false;
    window.speechSynthesis.cancel();
    setPlaybackState("idle");
    setPlaybackMessage(
      props.documentState.text
        ? "Text is ready to play."
        : "Load a .txt or .pdf file to start playback."
    );
  }, [props.documentState.text]);

  useEffect(() => {
    if (paragraphs.length === 0) {
      if (props.currentParagraphIndex !== 0) {
        props.onCurrentParagraphIndexChange(0);
      }
      return;
    }

    const safeParagraphIndex = Math.min(props.currentParagraphIndex, paragraphs.length - 1);

    if (safeParagraphIndex !== props.currentParagraphIndex) {
      props.onCurrentParagraphIndexChange(safeParagraphIndex);
    }
  }, [paragraphs.length, props.currentParagraphIndex, props.onCurrentParagraphIndexChange]);

  useEffect(() => {
    const currentParagraph = paragraphRefs.current[props.currentParagraphIndex];

    currentParagraph?.scrollIntoView({
      block: "nearest"
    });
  }, [props.currentParagraphIndex]);

  useEffect(() => {
    readerPanelRef.current?.focus();
  }, []);

  async function handleOpenFile() {
    await props.onOpenDocument();
  }

  function handlePlay() {
    if (!props.documentState.text?.trim()) {
      setPlaybackState("idle");
      setPlaybackMessage("Load a .txt or .pdf file before starting playback.");
      return;
    }

    if (
      playbackStateRef.current === "paused" &&
      restartPausedParagraphRef.current &&
      playbackRangeRef.current
    ) {
      const pausedPosition = playbackPositionRef.current;
      const resumeParagraphIndex = pausedPosition?.paragraphIndex ?? props.currentParagraphIndex;
      const resumeChunkIndex = pausedPosition?.chunkIndex ?? 0;

      startChunkedPlayback(
        resumeParagraphIndex,
        playbackRangeRef.current.endIndex,
        `Playback resumed from paragraph ${resumeParagraphIndex + 1} of ${paragraphs.length} at ${playbackRateRef.current.toFixed(1)}x.`,
        resumeChunkIndex
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
      props.currentParagraphIndex,
      paragraphs.length - 1,
      `Playback started from paragraph ${props.currentParagraphIndex + 1} of ${paragraphs.length}.`
    );
  }

  function handleRepeatCurrentParagraph() {
    const currentParagraph = paragraphs[props.currentParagraphIndex];

    if (!currentParagraph) {
      setPlaybackState("idle");
      setPlaybackMessage("Load a document with readable paragraphs before repeating a paragraph.");
      return;
    }

    startChunkedPlayback(
      props.currentParagraphIndex,
      props.currentParagraphIndex,
      `Repeating paragraph ${props.currentParagraphIndex + 1} of ${paragraphs.length}.`
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
    const safeNextRate = clampReadingSpeed(nextRate);

    props.onPlaybackRateChange(safeNextRate);

    if (!("speechSynthesis" in window)) {
      return;
    }

    playbackRateRef.current = safeNextRate;

    if (playbackStateRef.current === "playing" && playbackRangeRef.current) {
      setPlaybackMessage(
        `Reading speed set to ${safeNextRate.toFixed(1)}x. It will apply on the next sentence or paragraph.`
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
        `Reading speed set to ${safeNextRate.toFixed(1)}x. Press Play to continue from paragraph ${props.currentParagraphIndex + 1} at the new speed.`
      );
      return;
    }

    setPlaybackMessage(`Reading speed set to ${safeNextRate.toFixed(1)}x.`);
  }

  function changePlaybackRate(step: number) {
    handlePlaybackRateChange(playbackRateRef.current + step);
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
          props.onCurrentParagraphIndexChange(
            paragraphs.length === 0 ? 0 : Math.min(props.currentParagraphIndex + 1, paragraphs.length - 1)
          );
          return;
        case "previousParagraph":
          props.onCurrentParagraphIndexChange(Math.max(props.currentParagraphIndex - 1, 0));
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
  }, [paragraphs.length, props.currentParagraphIndex, props.onCurrentParagraphIndexChange, props.documentState.text]);

  const statusMessage = props.documentState.error
    ? props.documentState.error
    : props.documentState.filePath
      ? `Loaded ${props.documentState.fileType === "pdf" ? "PDF" : "text"} file: ${props.documentState.filePath}. Paragraph ${Math.min(props.currentParagraphIndex + 1, Math.max(paragraphs.length, 1))} of ${paragraphs.length || 0}.`
      : "No document loaded. Paragraph 0 of 0.";

  const hasText = Boolean(props.documentState.text?.trim());
  const speechSynthesisAvailable = "speechSynthesis" in window;
  const documentVoiceChoice = chooseSpeechVoice({
    voices: props.availableVoices,
    text: props.documentState.text,
    preference: props.speechVoicePreference
  });
  const voiceStatusMessage =
    !hasText || !speechSynthesisAvailable || !props.voicesInitialized ? null : documentVoiceChoice.warning;
  const speedValueId = useId();
  const statusToneClass = props.documentState.error || !speechSynthesisAvailable ? "status-message error-text" : "status-message";
  const playbackStatusLabel = !props.documentState.text
    ? "waiting for a file"
    : playbackState === "playing"
      ? "playing"
      : playbackState === "paused"
        ? "paused"
        : playbackMessage === "Playback stopped."
          ? "stopped"
          : "ready";
  const fileLabel = props.documentState.filePath ? props.documentState.filePath.split(/[\\/]/).pop() ?? props.documentState.filePath : "No file loaded";
  const fileTypeLabel = props.documentState.fileType === "pdf" ? "PDF" : props.documentState.fileType === "txt" ? "TXT" : "No file";

  function moveToParagraph(direction: "previous" | "next") {
    if (paragraphs.length === 0) {
      props.onCurrentParagraphIndexChange(0);
      return;
    }

    if (direction === "previous") {
      props.onCurrentParagraphIndexChange(Math.max(props.currentParagraphIndex - 1, 0));
      return;
    }

    props.onCurrentParagraphIndexChange(Math.min(props.currentParagraphIndex + 1, paragraphs.length - 1));
  }

  return (
    <section className="reader-workspace" aria-label="Reader workspace">
      <div className="reader-toolbar">
        <div className="reader-toolbar-main">
          <div>
            <p className="reader-toolbar-label">Reader</p>
            <h2>Focused reading workspace</h2>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={handleOpenFile}
            disabled={props.documentState.isLoading}
          >
            {props.documentState.isLoading ? "Opening document..." : "Open file"}
          </button>
        </div>

        <div className="reader-meta" aria-live="polite">
          <p className="reader-file-name">{fileLabel}</p>
          <div className="reader-meta-row">
            <span className="reader-chip">{fileTypeLabel}</span>
            <span className="reader-chip">
              {paragraphs.length > 0
                ? `Paragraph ${props.currentParagraphIndex + 1} of ${paragraphs.length}`
                : "Paragraph 0 of 0"}
            </span>
            <span className="reader-chip">
              {props.documentState.isLoading ? "Loading" : playbackStatusLabel === "waiting for a file" ? "Ready to load" : playbackStatusLabel}
            </span>
          </div>
          <p className={props.documentState.error ? "status-message error-text compact-status" : "status-message compact-status"}>
            {statusMessage}
          </p>
        </div>
      </div>

      <div ref={readerPanelRef} className="reader-panel reader-panel-expanded" tabIndex={-1} aria-label="Document text area">
        {paragraphs.length > 0 ? (
          <div className="reader-text" role="list" aria-label="Document paragraphs">
            {paragraphs.map((paragraph, index) => (
              <p
                key={`${index}-${paragraph.slice(0, 32)}`}
                ref={(element) => {
                  paragraphRefs.current[index] = element;
                }}
                className={index === props.currentParagraphIndex ? "reader-paragraph current-paragraph" : "reader-paragraph"}
                role="listitem"
                aria-current={index === props.currentParagraphIndex ? "true" : undefined}
              >
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <div className="reader-empty-state">
            <p className="reader-empty-eyebrow">Ready to read</p>
            <p className="empty-state">Open a readable `.txt` or `.pdf` document to begin.</p>
            <p className="hint">Use `Open file` above or press `Ctrl+O`.</p>
            <p className="hint reader-empty-shortcuts">
              Reader shortcuts: `Space`, `S`, `J`, `K`, `R`, `Alt+Up`, and `Alt+Down`.
            </p>
          </div>
        )}
      </div>

      <div className="reader-playback-bar" role="group" aria-label="Playback controls">
        <div className="playback-group playback-group-primary" aria-label="Primary playback actions">
          <button className="playback-primary-button" type="button" onClick={handlePlay} aria-describedby="playback-status">
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
        </div>

        <div className="playback-secondary-row">
          <div className="playback-group" aria-label="Paragraph navigation">
            <button type="button" onClick={() => moveToParagraph("previous")} disabled={!hasText || props.currentParagraphIndex === 0}>
              Previous paragraph
            </button>
            <button
              type="button"
              onClick={() => moveToParagraph("next")}
              disabled={!hasText || props.currentParagraphIndex >= paragraphs.length - 1}
            >
              Next paragraph
            </button>
            <button type="button" onClick={handleRepeatCurrentParagraph} disabled={!hasText}>
              Repeat paragraph
            </button>
          </div>

          <label className="field playback-speed" aria-label="Playback speed">
            <span>Speed</span>
            <input
              className="brand-slider"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={props.playbackRate}
              onChange={(event) => handlePlaybackRateChange(Number(event.target.value))}
              aria-describedby={speedValueId}
            />
            <span id={speedValueId} className="hint playback-speed-value">
              {props.playbackRate.toFixed(1)}x
            </span>
          </label>

          <div className="playback-readout">
            <p
              id="playback-status"
              className={statusToneClass}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <strong>Playback:</strong> {playbackStatusLabel}. {playbackMessage}
            </p>
            <p className="status-message compact-status" role="status" aria-live="polite" aria-atomic="true">
              {paragraphs.length > 0
                ? `Position: paragraph ${props.currentParagraphIndex + 1} of ${paragraphs.length}.`
                : "Position: no document loaded."}
            </p>
            {voiceStatusMessage ? (
              <p className="status-message error-text compact-status" role="status" aria-live="polite" aria-atomic="true">
                {voiceStatusMessage}
              </p>
            ) : null}
            <p className="hint reader-shortcuts-note">
              Shortcuts: Ctrl+O open file anywhere in the app. In Reader, Space play or pause, S stop, J and K
              move, R repeat, Alt+Up or Alt+Down speed.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsScreen(props: {
  availableVoices: SpeechSynthesisVoice[];
  speechVoicePreference: SpeechVoicePreference;
  onSpeechVoicePreferenceChange: (nextPreference: SpeechVoicePreference) => void;
  voicesInitialized: boolean;
}) {
  const languageId = useId();
  const startupId = useId();
  const speechVoiceModeId = useId();
  const hasArabicVoice = findArabicVoice(props.availableVoices) !== null;
  const voiceSummary = !props.voicesInitialized
    ? "Checking available speech voices on this device."
    : props.availableVoices.length === 0
      ? "No speech voices were reported by the system yet."
      : hasArabicVoice
        ? `${props.availableVoices.length} speech voices detected, including Arabic support.`
        : `${props.availableVoices.length} speech voices detected. No Arabic voice was reported.`;

  return (
    <section className="page-workspace" aria-label="Settings workspace">
      <div className="page-banner">
        <div>
          <p className="page-banner-label">Settings</p>
          <h2>Simple preferences, easy to review</h2>
          <p className="page-banner-text">
            Keep default choices clear and accessible without adding extra noise.
          </p>
        </div>
      </div>

      <div className="page-columns">
        <section className="panel-section" aria-labelledby="settings-interface-title">
          <div className="panel-section-header">
            <p className="panel-kicker">Preferences</p>
            <h3 id="settings-interface-title">Interface settings</h3>
            <p>Minimal placeholders with clear labels and predictable controls.</p>
          </div>
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

            <label className="field" htmlFor={speechVoiceModeId}>
              <span>Speech voice mode</span>
              <select
                id={speechVoiceModeId}
                value={props.speechVoicePreference}
                onChange={(event) =>
                  props.onSpeechVoicePreferenceChange(
                    event.target.value === "default" ? "default" : "automatic"
                  )
                }
              >
                <option value="automatic">Automatic</option>
                <option value="default">Always use default voice</option>
              </select>
            </label>
          </div>
          <p className="status-message compact-status">{voiceSummary}</p>
          <p className="hint">
            Automatic mode prefers an Arabic-capable voice for Arabic script and keeps the default voice for other text.
          </p>
        </section>

        <section className="panel-section" aria-labelledby="settings-accessibility-title">
          <div className="panel-section-header">
            <p className="panel-kicker">Accessibility</p>
            <h3 id="settings-accessibility-title">Accessibility notes</h3>
            <p>Core promises for the first version stay visible and easy to scan.</p>
          </div>
          <ul className="simple-list">
            <li>Keyboard navigation is available for every main action.</li>
            <li>Focus states stay visible.</li>
            <li>Screen labels remain explicit and simple.</li>
          </ul>
        </section>
      </div>
    </section>
  );
}

export function App() {
  const initialPersistenceState = useMemo(
    () => (typeof window === "undefined" ? defaultReaderPersistenceState : readReaderPersistenceState(window.localStorage)),
    []
  );
  const [activeScreen, setActiveScreen] = useState<ScreenId>("home");
  const [documentState, setDocumentState] = useState<ReaderDocumentState>(emptyReaderDocumentState);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>(initialPersistenceState.recentDocuments);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(initialPersistenceState.lastOpenedParagraphIndex);
  const [playbackRate, setPlaybackRate] = useState(initialPersistenceState.readingSpeed);
  const [speechVoicePreference, setSpeechVoicePreference] = useState<SpeechVoicePreference>(
    initialPersistenceState.speechVoicePreference
  );
  const [lastOpenedDocumentPath, setLastOpenedDocumentPath] = useState<string | null>(initialPersistenceState.lastOpenedDocumentPath);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesInitialized, setVoicesInitialized] = useState(false);
  const hasAttemptedStartupRestoreRef = useRef(false);
  const currentScreen = screens.find((screen) => screen.id === activeScreen)!;

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoicesInitialized(true);
      return;
    }

    function updateAvailableVoices() {
      const nextVoices = window.speechSynthesis.getVoices();
      setAvailableVoices(nextVoices);
      setVoicesInitialized(true);
    }

    updateAvailableVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateAvailableVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", updateAvailableVoices);
    };
  }, []);

  useEffect(() => {
    function handleAppKeydown(event: KeyboardEvent) {
      const action = getAppShortcutAction(event);

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === "openDocument") {
        void loadDocument({ navigateToReader: true });
      }
    }

    window.addEventListener("keydown", handleAppKeydown);

    return () => {
      window.removeEventListener("keydown", handleAppKeydown);
    };
  }, []);

  async function loadDocument(options?: {
    filePath?: string;
    navigateToReader?: boolean;
    restoreParagraphIndex?: number;
  }) {
    const navigateToReader = options?.navigateToReader ?? false;

    if (navigateToReader) {
      setActiveScreen("reader");
    }

    setDocumentState((current) => ({
      ...current,
      error: null,
      isLoading: true
    }));

    function clearUnavailableLastOpenedPath() {
      if (!options?.filePath) {
        return;
      }

      setLastOpenedDocumentPath((current) => (current === options.filePath ? null : current));
    }

    try {
      const result: OpenDocumentResult = options?.filePath
        ? await window.phronon.openDocumentAtPath(options.filePath)
        : await window.phronon.openReaderDocument();

      if (result.canceled) {
        setDocumentState((current) => ({
          ...current,
          error: null,
          isLoading: false
        }));
        return;
      }

      if ("error" in result && result.error) {
        clearUnavailableLastOpenedPath();
        setDocumentState((current) => ({
          ...current,
          error: buildDocumentOpenFailureMessage({
            attemptedFilePath: result.filePath ?? options?.filePath,
            currentFilePath: current.filePath,
            reason: result.error
          }),
          isLoading: false
        }));
        return;
      }

      if (!isOpenDocumentSuccessResult(result)) {
        clearUnavailableLastOpenedPath();
        setDocumentState((current) => ({
          ...current,
          error: buildDocumentOpenFailureMessage({
            attemptedFilePath: options?.filePath,
            currentFilePath: current.filePath
          }),
          isLoading: false
        }));
        return;
      }

      const nextDocumentState = createLoadedDocumentState(result);
      setDocumentState(nextDocumentState);
      setRecentDocuments((current) => upsertRecentDocument(current, result));
      setLastOpenedDocumentPath(result.filePath);
      setCurrentParagraphIndex(clampParagraphIndex(options?.restoreParagraphIndex ?? 0));

      if (navigateToReader) {
        setActiveScreen("reader");
      }
    } catch {
      clearUnavailableLastOpenedPath();
      setDocumentState((current) => ({
        ...current,
        error: buildDocumentOpenFailureMessage({
          attemptedFilePath: options?.filePath,
          currentFilePath: current.filePath
        }),
        isLoading: false
      }));
    }
  }

  useEffect(() => {
    writeReaderPersistenceState(typeof window === "undefined" ? undefined : window.localStorage, {
      recentDocuments,
      readingSpeed: clampReadingSpeed(playbackRate),
      speechVoicePreference,
      lastOpenedDocumentPath,
      lastOpenedParagraphIndex:
        documentState.filePath && documentState.text ? clampParagraphIndex(currentParagraphIndex) : 0
    });
  }, [
    currentParagraphIndex,
    documentState.filePath,
    documentState.text,
    lastOpenedDocumentPath,
    playbackRate,
    recentDocuments,
    speechVoicePreference
  ]);

  useEffect(() => {
    if (hasAttemptedStartupRestoreRef.current) {
      return;
    }

    hasAttemptedStartupRestoreRef.current = true;

    if (!initialPersistenceState.lastOpenedDocumentPath) {
      return;
    }

    void loadDocument({
      filePath: initialPersistenceState.lastOpenedDocumentPath,
      restoreParagraphIndex: initialPersistenceState.lastOpenedParagraphIndex
    });
  }, [initialPersistenceState.lastOpenedDocumentPath, initialPersistenceState.lastOpenedParagraphIndex]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="app-header">
        <div className="app-header-inner">
          <p className="eyebrow">Phronon</p>
          <div className="app-header-copy">
            <h1>{currentScreen.title}</h1>
            <p>{currentScreen.description}</p>
          </div>
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
          {activeScreen === "home" && (
            <HomeScreen
              documentState={documentState}
              recentDocuments={recentDocuments}
              onImportFile={() => loadDocument({ navigateToReader: true })}
              onOpenRecentDocument={(filePath) => loadDocument({ filePath, navigateToReader: true })}
            />
          )}
          {activeScreen === "reader" && (
            <ReaderScreen
              documentState={documentState}
              currentParagraphIndex={currentParagraphIndex}
              onCurrentParagraphIndexChange={(nextIndex) => setCurrentParagraphIndex(clampParagraphIndex(nextIndex))}
              onOpenDocument={() => loadDocument()}
              availableVoices={availableVoices}
              voicesInitialized={voicesInitialized}
              playbackRate={playbackRate}
              onPlaybackRateChange={(nextRate) => setPlaybackRate(clampReadingSpeed(nextRate))}
              speechVoicePreference={speechVoicePreference}
            />
          )}
          {activeScreen === "settings" && (
            <SettingsScreen
              availableVoices={availableVoices}
              speechVoicePreference={speechVoicePreference}
              onSpeechVoicePreferenceChange={setSpeechVoicePreference}
              voicesInitialized={voicesInitialized}
            />
          )}
        </main>
      </div>
    </div>
  );
}
