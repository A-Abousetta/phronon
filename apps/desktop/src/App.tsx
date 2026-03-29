import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  getAppShortcutAction,
  getReaderShortcutAction,
  isInteractiveElement,
  splitIntoParagraphs,
  splitParagraphIntoSpeechChunks
} from "./readerControls";
import {
  buildDocumentLoadStatusMessage,
  buildDocumentOpenFailureMessage,
  buildReaderDocumentStatusMessage,
  buildRecentDocumentButtonLabel,
  clampParagraphIndex,
  clampReadingSpeed,
  createLoadedDocumentState,
  defaultReaderPersistenceState,
  emptyReaderDocumentState,
  getDocumentFileName,
  readReaderPersistenceState,
  type DocumentLoadOrigin,
  type ReaderDocumentState,
  type RecentDocument,
  upsertRecentDocument,
  writeReaderPersistenceState
} from "./documentWorkflow";
import {
  buildVoiceDiagnosticsSummary,
  chooseSpeechVoice,
  findArabicVoice,
  findVoiceById,
  getVoiceIdentifier,
  getVoiceDisplayName,
  type SpeechVoicePreference
} from "./speechVoices";

type ScreenId = "home" | "reader" | "settings";

type Screen = {
  id: ScreenId;
  label: string;
  title: string;
  description: string;
};

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

type LiveMessage = {
  id: number;
  text: string;
};

type LoadDocumentOptions = {
  filePath?: string;
  navigateToReader?: boolean;
  restoreParagraphIndex?: number;
  origin?: DocumentLoadOrigin;
};

type ActiveDocumentLoad = {
  requestId: number;
  origin: DocumentLoadOrigin;
  attemptedFilePath: string | null;
  navigateToReader: boolean;
  restoreParagraphIndex: number;
  statusMessage: string;
};

type WelcomePanelProps = {
  onOpenDocument: () => Promise<void>;
  onDismiss: () => void;
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

function isOpenDocumentSuccessResult(result: OpenDocumentResult): result is OpenDocumentSuccessResult {
  return (
    result.canceled === false &&
    "filePath" in result &&
    "text" in result &&
    "fileType" in result
  );
}

function buildScreenAnnouncement(screen: Screen) {
  return `${screen.label} screen. ${screen.title}. ${screen.description}`;
}

function buildLoadedDocumentAnnouncement(result: OpenDocumentSuccessResult, paragraphIndex: number) {
  const paragraphs = splitIntoParagraphs(result.text);
  const safeParagraphCount = paragraphs.length;
  const safeParagraphNumber =
    safeParagraphCount > 0
      ? Math.min(clampParagraphIndex(paragraphIndex) + 1, safeParagraphCount)
      : 0;

  return `Opened ${getDocumentFileName(result.filePath)}. ${safeParagraphCount} paragraphs available. Current position is paragraph ${safeParagraphNumber} of ${safeParagraphCount}.`;
}

function createActiveDocumentLoad(requestId: number, options?: LoadDocumentOptions): ActiveDocumentLoad {
  const origin = options?.origin ?? (options?.filePath ? "recentDocument" : "filePicker");

  return {
    requestId,
    origin,
    attemptedFilePath: options?.filePath ?? null,
    navigateToReader: options?.navigateToReader ?? false,
    restoreParagraphIndex: clampParagraphIndex(options?.restoreParagraphIndex ?? 0),
    statusMessage: buildDocumentLoadStatusMessage({
      origin,
      filePath: options?.filePath
    })
  };
}

function WelcomePanel(props: WelcomePanelProps) {
  const titleId = useId();
  const tipsId = useId();

  return (
    <section className="welcome-panel" aria-labelledby={titleId} aria-describedby={tipsId}>
      <div className="welcome-panel-header">
        <div>
          <p className="panel-kicker">Welcome</p>
          <h2 id={titleId}>Phronon helps you open study text and start listening quickly.</h2>
        </div>
        <button type="button" className="secondary-button" onClick={props.onDismiss}>
          Dismiss welcome
        </button>
      </div>
      <p className="welcome-panel-text">
        The first useful step is to open a TXT or PDF file. After that, move to Reader and press Play or Space to
        start playback.
      </p>
      <div className="welcome-panel-actions">
        <button type="button" className="primary-button" onClick={() => void props.onOpenDocument()}>
          Open a document
        </button>
      </div>
      <ul id={tipsId} className="simple-list welcome-panel-list" aria-label="Getting started tips">
        <li>Open a file: press `Ctrl+O` anywhere, or use Import File on Home.</li>
        <li>Start playback: in Reader, press `Play` or `Space`.</li>
        <li>Move between paragraphs: press `J` for next and `K` for previous.</li>
        <li>Adjust speed: press `Alt+Up` or `Alt+Down`, or use the speed slider.</li>
      </ul>
    </section>
  );
}

function HomeScreen(props: {
  documentState: ReaderDocumentState;
  activeLoad: ActiveDocumentLoad | null;
  recentDocuments: RecentDocument[];
  onImportFile: () => Promise<void>;
  onOpenRecentDocument: (filePath: string) => Promise<void>;
}) {
  const homeTitleId = useId();
  const homeImportTitleId = useId();
  const homeImportStatusId = useId();
  const homeRecentTitleId = useId();
  const homeRecentHintId = useId();
  const isFilePickerLoading = props.activeLoad?.origin === "filePicker";
  const importButtonLabel = isFilePickerLoading ? "Choosing study file" : "Import study file";

  return (
    <section className="page-workspace" aria-labelledby={homeTitleId}>
      <div className="page-banner">
        <div>
          <p className="page-banner-label">Home</p>
          <h2 id={homeTitleId}>Start studying without extra clutter</h2>
          <p className="page-banner-text">
            Keep import and recent material close at hand in a simple, keyboard-first workspace.
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => void props.onImportFile()}
          disabled={isFilePickerLoading}
          aria-label={importButtonLabel}
          aria-describedby={homeImportStatusId}
        >
          {isFilePickerLoading ? "Choosing document..." : "Import File"}
        </button>
      </div>

      <div className="page-columns">
        <section className="panel-section" aria-labelledby={homeImportTitleId}>
          <div className="panel-section-header">
            <p className="panel-kicker">Quick start</p>
            <h3 id={homeImportTitleId}>Import study material</h3>
            <p>Bring in a file and move into reading with as few steps as possible.</p>
          </div>
          <div className="stack">
            <p
              id={homeImportStatusId}
              className={props.documentState.error ? "status-message error-text compact-status" : "status-message compact-status"}
              role={props.documentState.error ? "alert" : "status"}
              aria-live={props.documentState.error ? "assertive" : "polite"}
              aria-atomic="true"
            >
              {props.documentState.isLoading && props.activeLoad
                ? props.activeLoad.statusMessage
                : props.documentState.error
                ? props.documentState.error
                : props.documentState.filePath
                  ? `Current document: ${getDocumentFileName(props.documentState.filePath)}.`
                  : "No document is loaded yet."}
            </p>
            <p className="hint">Planned support: TXT, PDF, and image files.</p>
          </div>
        </section>

        <section className="panel-section" aria-labelledby={homeRecentTitleId} aria-describedby={homeRecentHintId}>
          <div className="panel-section-header">
            <p className="panel-kicker">Recent</p>
            <h3 id={homeRecentTitleId}>Continue where you left off</h3>
            <p id={homeRecentHintId}>Recent study material stays visible without taking over the screen.</p>
          </div>
          {props.recentDocuments.length > 0 ? (
            <ul className="simple-list" aria-label="Recent documents">
              {props.recentDocuments.map((document) => {
                const safeFileName = document.fileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
                const metaId = `recent-document-meta-${document.lastOpenedAt}-${safeFileName}`;

                return (
                  <li key={document.filePath}>
                    <button
                      type="button"
                      className="recent-document-button"
                      onClick={() => void props.onOpenRecentDocument(document.filePath)}
                      aria-label={buildRecentDocumentButtonLabel(document)}
                      aria-describedby={metaId}
                    >
                      <span className="recent-document-name">{document.fileName}</span>
                      <span id={metaId} className="recent-document-meta">
                        {document.fileType.toUpperCase()} file
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="hint">No recent documents yet. Import a TXT or PDF file to see it here.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function ReaderScreen(props: {
  documentState: ReaderDocumentState;
  activeLoad: ActiveDocumentLoad | null;
  currentParagraphIndex: number;
  onCurrentParagraphIndexChange: (nextIndex: number) => void;
  onOpenDocument: () => Promise<void>;
  availableVoices: SpeechSynthesisVoice[];
  voicesInitialized: boolean;
  playbackRate: number;
  onPlaybackRateChange: (nextRate: number) => void;
  speechVoicePreference: SpeechVoicePreference;
  preferredVoiceId: string | null;
  focusRequest: number;
}) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackMessage, setPlaybackMessage] = useState("Load a .txt or .pdf file to start playback.");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const readerPanelRef = useRef<HTMLDivElement | null>(null);
  const openFileButtonRef = useRef<HTMLButtonElement | null>(null);
  const playbackRangeRef = useRef<PlaybackRange | null>(null);
  const playbackPositionRef = useRef<PlaybackPosition | null>(null);
  const playbackSessionRef = useRef(0);
  const playbackStateRef = useRef<PlaybackState>("idle");
  const playbackRateRef = useRef(props.playbackRate);
  const restartPausedParagraphRef = useRef(false);
  const headingId = useId();
  const summaryTitleId = useId();
  const statusId = useId();
  const positionStatusId = useId();
  const shortcutsHintId = useId();
  const documentRegionTitleId = useId();
  const documentRegionHintId = useId();
  const speedInputId = useId();
  const speedValueId = useId();
  const paragraphs = splitIntoParagraphs(props.documentState.text);
  const hasText = Boolean(props.documentState.text?.trim());
  const speechSynthesisAvailable = "speechSynthesis" in window;
  const isFilePickerLoading = props.activeLoad?.origin === "filePicker";

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
      preference: props.speechVoicePreference,
      preferredVoiceId: props.preferredVoiceId
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
    if (props.focusRequest === 0) {
      return;
    }

    if (hasText) {
      readerPanelRef.current?.focus();
      return;
    }

    openFileButtonRef.current?.focus();
  }, [hasText, props.focusRequest]);

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

  const statusMessage = buildReaderDocumentStatusMessage({
    isLoading: props.documentState.isLoading,
    loadingStatusMessage: props.activeLoad?.statusMessage ?? null,
    error: props.documentState.error,
    filePath: props.documentState.filePath,
    fileType: props.documentState.fileType,
    currentParagraphIndex: props.currentParagraphIndex,
    paragraphCount: paragraphs.length
  });
  const documentVoiceChoice = chooseSpeechVoice({
    voices: props.availableVoices,
    text: props.documentState.text,
    preference: props.speechVoicePreference,
    preferredVoiceId: props.preferredVoiceId
  });
  const voiceStatusMessage =
    !hasText || !speechSynthesisAvailable || !props.voicesInitialized ? null : documentVoiceChoice.warning;
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
  const fileLabel = props.documentState.filePath ? getDocumentFileName(props.documentState.filePath) : "No file loaded";
  const fileTypeLabel = props.documentState.fileType === "pdf" ? "PDF" : props.documentState.fileType === "txt" ? "TXT" : "No file";
  const currentParagraphId =
    paragraphs.length > 0 ? `reader-paragraph-${props.currentParagraphIndex}` : undefined;

  return (
    <section className="reader-workspace" aria-labelledby={headingId}>
      <section className="reader-toolbar" aria-labelledby={summaryTitleId}>
        <div className="reader-toolbar-main">
          <div>
            <p className="reader-toolbar-label">Reader</p>
            <h2 id={headingId}>Focused reading workspace</h2>
          </div>
          <button
            ref={openFileButtonRef}
            className="primary-button"
            type="button"
            onClick={handleOpenFile}
            disabled={isFilePickerLoading}
            aria-label={isFilePickerLoading ? "Choosing document" : "Open a study file"}
          >
            {isFilePickerLoading ? "Choosing document..." : "Open file"}
          </button>
        </div>

        <div className="reader-meta" aria-labelledby={summaryTitleId}>
          <h3 id={summaryTitleId} className="visually-hidden">
            Reader summary
          </h3>
          <p className="reader-file-name">{fileLabel}</p>
          <div className="reader-meta-row" aria-label="Current reader status">
            <span className="reader-chip">{fileTypeLabel}</span>
            <span className="reader-chip">
              {paragraphs.length > 0
                ? `Paragraph ${props.currentParagraphIndex + 1} of ${paragraphs.length}`
                : "Paragraph 0 of 0"}
            </span>
            <span className="reader-chip">
              {props.documentState.isLoading
                ? "Loading"
                : playbackStatusLabel === "waiting for a file"
                  ? "Ready to load"
                  : playbackStatusLabel}
            </span>
          </div>
          <p
            id={statusId}
            className={props.documentState.error ? "status-message error-text compact-status" : "status-message compact-status"}
            role={props.documentState.error ? "alert" : "status"}
            aria-live={props.documentState.error ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {statusMessage}
          </p>
        </div>
      </section>

      <section
        ref={readerPanelRef}
        className="reader-panel reader-panel-expanded"
        tabIndex={-1}
        role="region"
        aria-labelledby={documentRegionTitleId}
        aria-describedby={`${documentRegionHintId} ${positionStatusId}`}
      >
        <h3 id={documentRegionTitleId} className="visually-hidden">
          Document text
        </h3>
        <p id={documentRegionHintId} className="visually-hidden">
          This region contains the extracted document text. Use the playback and paragraph controls below, or use
          Reader shortcuts while focus is outside other controls.
        </p>
        {paragraphs.length > 0 ? (
          <div className="reader-text" role="list" aria-label="Document paragraphs">
            {paragraphs.map((paragraph, index) => (
              <p
                key={`${index}-${paragraph.slice(0, 32)}`}
                id={`reader-paragraph-${index}`}
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
      </section>

      <section className="reader-playback-bar" aria-labelledby={shortcutsHintId}>
        <div className="playback-group playback-group-primary" role="group" aria-label="Primary playback actions">
          <button
            className="playback-primary-button"
            type="button"
            onClick={handlePlay}
            aria-describedby={statusId}
          >
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
          <div className="playback-group" role="group" aria-label="Paragraph navigation">
            <button
              type="button"
              onClick={() => moveToParagraph("previous")}
              disabled={!hasText || props.currentParagraphIndex === 0}
              aria-controls={currentParagraphId}
            >
              Previous paragraph
            </button>
            <button
              type="button"
              onClick={() => moveToParagraph("next")}
              disabled={!hasText || props.currentParagraphIndex >= paragraphs.length - 1}
              aria-controls={currentParagraphId}
            >
              Next paragraph
            </button>
            <button type="button" onClick={handleRepeatCurrentParagraph} disabled={!hasText}>
              Repeat paragraph
            </button>
          </div>

          <label className="field playback-speed" htmlFor={speedInputId}>
            <span>Playback speed</span>
            <input
              id={speedInputId}
              className="brand-slider"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={props.playbackRate}
              onChange={(event) => handlePlaybackRateChange(Number(event.target.value))}
              aria-describedby={`${statusId} ${speedValueId}`}
              aria-valuetext={`${props.playbackRate.toFixed(1)} times speed`}
            />
            <span id={speedValueId} className="hint playback-speed-value">
              {props.playbackRate.toFixed(1)}x
            </span>
          </label>

          <div className="playback-readout">
            <p
              className={statusToneClass}
              role={props.documentState.error || !speechSynthesisAvailable ? "alert" : "status"}
              aria-live={props.documentState.error || !speechSynthesisAvailable ? "assertive" : "polite"}
              aria-atomic="true"
            >
              <strong>Playback:</strong> {playbackStatusLabel}. {playbackMessage}
            </p>
            <p
              id={positionStatusId}
              className="status-message compact-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {paragraphs.length > 0
                ? `Position: paragraph ${props.currentParagraphIndex + 1} of ${paragraphs.length}.`
                : "Position: no document loaded."}
            </p>
            {voiceStatusMessage ? (
              <p className="status-message error-text compact-status" role="status" aria-live="polite" aria-atomic="true">
                {voiceStatusMessage}
              </p>
            ) : null}
            <p id={shortcutsHintId} className="hint reader-shortcuts-note">
              Shortcuts: Ctrl+O opens a file anywhere in the app. In Reader, Space plays or pauses, S stops, J and K
              move between paragraphs, R repeats, and Alt+Up or Alt+Down changes speed.
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}

function SettingsScreen(props: {
  availableVoices: SpeechSynthesisVoice[];
  speechVoicePreference: SpeechVoicePreference;
  onSpeechVoicePreferenceChange: (nextPreference: SpeechVoicePreference) => void;
  preferredVoiceId: string | null;
  onPreferredVoiceIdChange: (nextVoiceId: string | null) => void;
  voicesInitialized: boolean;
}) {
  const settingsTitleId = useId();
  const languageId = useId();
  const startupId = useId();
  const speechVoiceModeId = useId();
  const speechVoiceId = useId();
  const voiceSummaryId = useId();
  const voiceModeHintId = useId();
  const voicePickerHintId = useId();
  const voiceFallbackId = useId();
  const voiceListId = useId();
  const hasArabicVoice = findArabicVoice(props.availableVoices) !== null;
  const preferredVoice = findVoiceById(props.availableVoices, props.preferredVoiceId);
  const voiceSummary = buildVoiceDiagnosticsSummary(props.availableVoices, props.voicesInitialized);
  const fallbackVoice = chooseSpeechVoice({
    voices: props.availableVoices,
    text: null,
    preference: props.speechVoicePreference,
    preferredVoiceId: props.preferredVoiceId
  });
  const manualVoiceUnavailableMessage =
    props.speechVoicePreference === "manual" && !preferredVoice ? fallbackVoice.warning : null;

  return (
    <section className="page-workspace" aria-labelledby={settingsTitleId}>
      <div className="page-banner">
        <div>
          <p className="page-banner-label">Settings</p>
          <h2 id={settingsTitleId}>Simple preferences, easy to review</h2>
          <p className="page-banner-text">
            Keep default choices clear and accessible without adding extra noise.
          </p>
        </div>
      </div>

      <div className="page-columns">
        <section className="panel-section" aria-labelledby="settings-interface-title" aria-describedby={voiceSummaryId}>
          <div className="panel-section-header">
            <p className="panel-kicker">Preferences</p>
            <h3 id="settings-interface-title">Interface settings</h3>
            <p>Minimal placeholders with clear labels and predictable controls.</p>
          </div>
          <div className="form-grid" role="group" aria-label="Interface preferences">
            <label className="field" htmlFor={languageId}>
              <span>Interface language</span>
              <select id={languageId} defaultValue="en" aria-describedby={voiceSummaryId}>
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
                    event.target.value === "default"
                      ? "default"
                      : event.target.value === "manual"
                        ? "manual"
                        : "automatic"
                  )
                }
                aria-describedby={`${voiceSummaryId} ${voiceModeHintId}`}
              >
                <option value="automatic">Automatic</option>
                <option value="default">Always use default voice</option>
                <option value="manual">Use selected voice</option>
              </select>
            </label>
          </div>
          <p id={voiceSummaryId} className="status-message compact-status" role="status" aria-live="polite" aria-atomic="true">
            {voiceSummary}
          </p>
          <p id={voiceModeHintId} className="hint">
            Automatic mode prefers an Arabic-capable voice for Arabic script and keeps the default voice for other text.
          </p>
        </section>

        <section className="panel-section" aria-labelledby="settings-voice-picker-title" aria-describedby={voiceSummaryId}>
          <div className="panel-section-header">
            <p className="panel-kicker">Voices</p>
            <h3 id="settings-voice-picker-title">Voice diagnostics and picker</h3>
            <p>Review detected voices, choose a manual playback voice if needed, and keep fallback behavior clear.</p>
          </div>
          <div className="form-grid" role="group" aria-label="Speech voice controls">
            <label className="field" htmlFor={speechVoiceId}>
              <span>Preferred playback voice</span>
              <select
                id={speechVoiceId}
                value={props.preferredVoiceId ?? ""}
                onChange={(event) =>
                  props.onPreferredVoiceIdChange(event.target.value.trim() ? event.target.value : null)
                }
                disabled={props.availableVoices.length === 0}
                aria-describedby={`${voicePickerHintId} ${voiceFallbackId}`}
              >
                <option value="">System default voice</option>
                {props.availableVoices.map((voice) => (
                  <option key={getVoiceIdentifier(voice)} value={getVoiceIdentifier(voice)}>
                    {getVoiceDisplayName(voice)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p id={voicePickerHintId} className="hint">
            Voice name and language come from the device. If metadata is incomplete, Phronon falls back to the safest available label.
          </p>
          <p id={voiceListId} className="status-message compact-status" role="status" aria-live="polite" aria-atomic="true">
            {preferredVoice
              ? `Selected voice: ${getVoiceDisplayName(preferredVoice)}.`
              : "Selected voice: system default."}
          </p>
          {manualVoiceUnavailableMessage ? (
            <p
              id={voiceFallbackId}
              className="status-message error-text compact-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {manualVoiceUnavailableMessage}
            </p>
          ) : (
            <p id={voiceFallbackId} className="hint">
              {props.speechVoicePreference === "manual"
                ? "Manual mode uses the selected voice for all playback."
                : hasArabicVoice
                  ? "Automatic mode can switch between Arabic and non-Arabic voices when text changes."
                  : "Automatic mode stays available even if this device does not report an Arabic voice."}
            </p>
          )}
          {props.availableVoices.length > 0 ? (
            <ul className="simple-list voice-diagnostics-list" aria-label="Detected speech voices">
              {props.availableVoices.map((voice) => (
                <li key={getVoiceIdentifier(voice)} className="voice-diagnostics-item">
                  <span className="voice-diagnostics-name">{getVoiceDisplayName(voice)}</span>
                  <span className="voice-diagnostics-meta">
                    {voice.default ? "System default" : "Available voice"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="panel-section" aria-labelledby="settings-accessibility-title">
          <div className="panel-section-header">
            <p className="panel-kicker">Accessibility</p>
            <h3 id="settings-accessibility-title">Accessibility notes</h3>
            <p>Core promises for the first version stay visible and easy to scan.</p>
          </div>
          <ul className="simple-list">
            <li>Keyboard navigation is available for every main action.</li>
            <li>Focus order stays predictable when screens or document states change.</li>
            <li>Status messages and controls keep explicit accessible names.</li>
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
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(initialPersistenceState.hasSeenOnboarding);
  const [speechVoicePreference, setSpeechVoicePreference] = useState<SpeechVoicePreference>(
    initialPersistenceState.speechVoicePreference
  );
  const [preferredVoiceId, setPreferredVoiceId] = useState<string | null>(initialPersistenceState.preferredVoiceId);
  const [lastOpenedDocumentPath, setLastOpenedDocumentPath] = useState<string | null>(
    initialPersistenceState.lastOpenedDocumentPath
  );
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesInitialized, setVoicesInitialized] = useState(false);
  const [activeLoad, setActiveLoad] = useState<ActiveDocumentLoad | null>(null);
  const [liveMessage, setLiveMessage] = useState<LiveMessage>({
    id: 0,
    text: ""
  });
  const [mainFocusRequest, setMainFocusRequest] = useState(0);
  const [readerFocusRequest, setReaderFocusRequest] = useState(0);
  const hasAttemptedStartupRestoreRef = useRef(false);
  const hasAnnouncedOnboardingRef = useRef(false);
  const mainHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const currentDocumentStateRef = useRef(documentState);
  const activeLoadRef = useRef<ActiveDocumentLoad | null>(null);
  const nextLoadRequestIdRef = useRef(0);
  const currentScreen = screens.find((screen) => screen.id === activeScreen)!;

  function announce(text: string) {
    setLiveMessage((current) => ({
      id: current.id + 1,
      text
    }));
  }

  function focusMainHeading() {
    setMainFocusRequest((current) => current + 1);
  }

  function focusReaderPanel() {
    setReaderFocusRequest((current) => current + 1);
  }

  function dismissOnboarding() {
    setHasSeenOnboarding(true);
    announce("Welcome guidance dismissed.");
  }

  function isActiveLoadRequest(request: ActiveDocumentLoad) {
    return activeLoadRef.current?.requestId === request.requestId;
  }

  function clearActiveLoad(request: ActiveDocumentLoad) {
    if (!isActiveLoadRequest(request)) {
      return false;
    }

    activeLoadRef.current = null;
    setActiveLoad(null);
    return true;
  }

  function startDocumentLoad(options?: LoadDocumentOptions) {
    if (options?.origin === "filePicker" && activeLoadRef.current?.origin === "filePicker") {
      return null;
    }

    const nextRequest = createActiveDocumentLoad(nextLoadRequestIdRef.current + 1, options);

    nextLoadRequestIdRef.current = nextRequest.requestId;
    activeLoadRef.current = nextRequest;
    setActiveLoad(nextRequest);
    setDocumentState((current) => ({
      ...current,
      error: null,
      isLoading: true
    }));

    return nextRequest;
  }

  function cancelStartupRestoreIfNeeded() {
    const pendingLoad = activeLoadRef.current;

    if (!pendingLoad || pendingLoad.origin !== "startupRestore") {
      return;
    }

    clearActiveLoad(pendingLoad);
    setDocumentState((current) => ({
      ...current,
      isLoading: false
    }));
  }

  function navigateToScreen(nextScreen: ScreenId) {
    if (nextScreen === activeScreen) {
      return;
    }

    cancelStartupRestoreIfNeeded();

    const nextScreenDetails = screens.find((screen) => screen.id === nextScreen)!;
    setActiveScreen(nextScreen);
    announce(buildScreenAnnouncement(nextScreenDetails));
    focusMainHeading();
  }

  useEffect(() => {
    if (mainFocusRequest === 0) {
      return;
    }

    mainHeadingRef.current?.focus();
  }, [activeScreen, mainFocusRequest]);

  useEffect(() => {
    currentDocumentStateRef.current = documentState;
  }, [documentState]);

  useEffect(() => {
    activeLoadRef.current = activeLoad;
  }, [activeLoad]);

  useEffect(() => {
    if (hasSeenOnboarding || hasAnnouncedOnboardingRef.current) {
      return;
    }

    hasAnnouncedOnboardingRef.current = true;
    announce(
      "Welcome to Phronon. Open a TXT or PDF file to begin, then use Reader to play text, move between paragraphs, and adjust speed."
    );
  }, [hasSeenOnboarding]);

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

  async function loadDocument(options?: LoadDocumentOptions) {
    const request = startDocumentLoad(options);

    if (!request) {
      return;
    }

    const activeRequest = request;
    const navigateToReader = activeRequest.navigateToReader;

    if (navigateToReader) {
      setActiveScreen("reader");
    }

    announce(activeRequest.statusMessage);

    function clearUnavailableLastOpenedPath() {
      if (!activeRequest.attemptedFilePath) {
        return;
      }

      setLastOpenedDocumentPath((current) => (current === activeRequest.attemptedFilePath ? null : current));
    }

    try {
      const result: OpenDocumentResult = activeRequest.attemptedFilePath
        ? await window.phronon.openDocumentAtPath(activeRequest.attemptedFilePath)
        : await window.phronon.openReaderDocument();

      if (!isActiveLoadRequest(activeRequest)) {
        return;
      }

      if (result.canceled) {
        clearActiveLoad(activeRequest);
        setDocumentState((current) => ({
          ...current,
          error: null,
          isLoading: false
        }));
        announce(
          activeRequest.origin === "startupRestore" ? "Startup restore stopped." : "Document open canceled."
        );

        if (navigateToReader) {
          focusReaderPanel();
        }

        return;
      }

      if ("error" in result && result.error) {
        const nextError = buildDocumentOpenFailureMessage({
          attemptedFilePath: result.filePath ?? activeRequest.attemptedFilePath ?? undefined,
          currentFilePath: currentDocumentStateRef.current.filePath,
          reason: result.error
        });

        clearUnavailableLastOpenedPath();
        clearActiveLoad(activeRequest);
        setDocumentState((current) => ({
          ...current,
          error: nextError,
          isLoading: false
        }));
        announce(nextError);

        if (navigateToReader) {
          focusReaderPanel();
        } else {
          focusMainHeading();
        }

        return;
      }

      if (!isOpenDocumentSuccessResult(result)) {
        const nextError = buildDocumentOpenFailureMessage({
          attemptedFilePath: activeRequest.attemptedFilePath ?? undefined,
          currentFilePath: currentDocumentStateRef.current.filePath
        });

        clearUnavailableLastOpenedPath();
        clearActiveLoad(activeRequest);
        setDocumentState((current) => ({
          ...current,
          error: nextError,
          isLoading: false
        }));
        announce(nextError);

        if (navigateToReader) {
          focusReaderPanel();
        } else {
          focusMainHeading();
        }

        return;
      }

      const nextDocumentState = createLoadedDocumentState(result);
      const restoredParagraphIndex = activeRequest.restoreParagraphIndex;

      clearActiveLoad(activeRequest);
      setDocumentState(nextDocumentState);
      setRecentDocuments((current) => upsertRecentDocument(current, result));
      setLastOpenedDocumentPath(result.filePath);
      setCurrentParagraphIndex(restoredParagraphIndex);

      if (navigateToReader) {
        setActiveScreen("reader");
      }

      announce(buildLoadedDocumentAnnouncement(result, restoredParagraphIndex));
      focusReaderPanel();
    } catch {
      if (!isActiveLoadRequest(activeRequest)) {
        return;
      }

      const nextError = buildDocumentOpenFailureMessage({
        attemptedFilePath: activeRequest.attemptedFilePath ?? undefined,
        currentFilePath: currentDocumentStateRef.current.filePath
      });

      clearUnavailableLastOpenedPath();
      clearActiveLoad(activeRequest);
      setDocumentState((current) => ({
        ...current,
        error: nextError,
        isLoading: false
      }));
      announce(nextError);

      if (navigateToReader) {
        focusReaderPanel();
      } else {
        focusMainHeading();
      }
    }
  }

  useEffect(() => {
    function handleAppKeydown(event: KeyboardEvent) {
      const action = getAppShortcutAction(event);

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === "openDocument") {
        void loadDocument({ navigateToReader: true, origin: "filePicker" });
      }
    }

    window.addEventListener("keydown", handleAppKeydown);

    return () => {
      window.removeEventListener("keydown", handleAppKeydown);
    };
  }, []);

  useEffect(() => {
    writeReaderPersistenceState(typeof window === "undefined" ? undefined : window.localStorage, {
      recentDocuments,
      readingSpeed: clampReadingSpeed(playbackRate),
      speechVoicePreference,
      preferredVoiceId,
      lastOpenedDocumentPath,
      lastOpenedParagraphIndex:
        documentState.filePath && documentState.text ? clampParagraphIndex(currentParagraphIndex) : 0,
      hasSeenOnboarding
    });
  }, [
    currentParagraphIndex,
    documentState.filePath,
    documentState.text,
    hasSeenOnboarding,
    lastOpenedDocumentPath,
    playbackRate,
    preferredVoiceId,
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
      origin: "startupRestore",
      filePath: initialPersistenceState.lastOpenedDocumentPath,
      restoreParagraphIndex: initialPersistenceState.lastOpenedParagraphIndex
    });
  }, [initialPersistenceState.lastOpenedDocumentPath, initialPersistenceState.lastOpenedParagraphIndex]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        <p key={liveMessage.id}>{liveMessage.text}</p>
      </div>

      <header className="app-header">
        <div className="app-header-inner">
          <p className="eyebrow">Phronon</p>
          <div className="app-header-copy">
            <h1 ref={mainHeadingRef} tabIndex={-1}>
              {currentScreen.title}
            </h1>
            <p>{currentScreen.description}</p>
          </div>
        </div>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label="Primary navigation">
          <ul className="nav-list">
            {screens.map((screen) => (
              <li key={screen.id}>
                <button
                  type="button"
                  className={screen.id === activeScreen ? "nav-button active" : "nav-button"}
                  aria-current={screen.id === activeScreen ? "page" : undefined}
                  aria-controls="main-content"
                  onClick={() => navigateToScreen(screen.id)}
                >
                  {screen.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main-content" className="main-panel" aria-busy={documentState.isLoading}>
          {!hasSeenOnboarding ? (
            <WelcomePanel
              onOpenDocument={() => loadDocument({ navigateToReader: true, origin: "filePicker" })}
              onDismiss={dismissOnboarding}
            />
          ) : null}
          {activeScreen === "home" && (
            <HomeScreen
              documentState={documentState}
              activeLoad={activeLoad}
              recentDocuments={recentDocuments}
              onImportFile={() => loadDocument({ navigateToReader: true, origin: "filePicker" })}
              onOpenRecentDocument={(filePath) =>
                loadDocument({ filePath, navigateToReader: true, origin: "recentDocument" })
              }
            />
          )}
          {activeScreen === "reader" && (
            <ReaderScreen
              documentState={documentState}
              activeLoad={activeLoad}
              currentParagraphIndex={currentParagraphIndex}
              onCurrentParagraphIndexChange={(nextIndex) => setCurrentParagraphIndex(clampParagraphIndex(nextIndex))}
              onOpenDocument={() => loadDocument({ origin: "filePicker" })}
              availableVoices={availableVoices}
              voicesInitialized={voicesInitialized}
              playbackRate={playbackRate}
              onPlaybackRateChange={(nextRate) => setPlaybackRate(clampReadingSpeed(nextRate))}
              speechVoicePreference={speechVoicePreference}
              preferredVoiceId={preferredVoiceId}
              focusRequest={readerFocusRequest}
            />
          )}
          {activeScreen === "settings" && (
            <SettingsScreen
              availableVoices={availableVoices}
              speechVoicePreference={speechVoicePreference}
              onSpeechVoicePreferenceChange={setSpeechVoicePreference}
              preferredVoiceId={preferredVoiceId}
              onPreferredVoiceIdChange={setPreferredVoiceId}
              voicesInitialized={voicesInitialized}
            />
          )}
        </main>
      </div>
    </div>
  );
}
