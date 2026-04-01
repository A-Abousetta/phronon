import {
  startTransition,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode
} from "react";

import {
  appShortcutDefinitions,
  findParagraphSearchMatches,
  getAppShortcutAction,
  getReaderShortcutAction,
  isInteractiveElement,
  readerShortcutDefinitions,
  splitIntoParagraphs,
  splitParagraphIntoSpeechChunks,
  type ParagraphSearchMatch,
  type ShortcutDefinition
} from "./readerControls";
import {
  buildBookmarkPreviewText,
  buildDocumentLoadStatusMessage,
  buildDocumentOpenFailureMessage,
  buildReaderDocumentStatusMessage,
  buildRecentDocumentButtonLabel,
  clampParagraphIndex,
  clampReadingSpeed,
  createParagraphBookmark,
  createTextHighlight,
  createLoadedDocumentState,
  defaultReaderPersistenceState,
  emptyReaderDocumentState,
  getBookmarksForDocument,
  getDocumentFileName,
  getHighlightsForDocument,
  MAX_BOOKMARK_NOTE_LENGTH,
  MAX_HIGHLIGHT_NOTE_LENGTH,
  normalizeBookmarkNote,
  normalizeHighlightNote,
  normalizeHighlightSelectionText,
  parseContrastMode,
  parseInterfaceTextScale,
  parseReaderTextScale,
  readReaderPersistenceState,
  removeTextHighlight,
  type ContrastMode,
  type InterfaceTextScale,
  type ParagraphBookmark,
  type DocumentLoadOrigin,
  type ReaderTextScale,
  type ReaderDocumentState,
  type RecentDocument,
  type TextHighlight,
  upsertParagraphBookmark,
  upsertTextHighlight,
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
import {
  type BrowserSpeechRecognition,
  type BrowserSpeechRecognitionErrorEvent,
  type BrowserSpeechRecognitionEvent,
  didVoiceRecognitionEndBeforeCapture,
  getVoiceReaderCommand,
  getVoiceRecognitionAvailability,
  getVoiceRecognitionConstructor,
  hasVoiceRecognitionCaptureActivity,
  type VoiceReaderCommand
} from "./voiceCommands";
import { buildRuntimeDiagnosticsItems, type RuntimeSupportStatus } from "./runtimeDiagnostics";
import {
  buildReaderBookmarkHintMessage,
  buildReaderDocumentReturnAnnouncement,
  buildReaderHighlightHintMessage,
  buildReaderRegionStatusMessage,
  buildReaderSavedItemAnnouncement,
  buildReaderSearchResultAnnouncement,
  buildReaderSearchStatusMessage
} from "./readerNavigation";
import phrononMasterArtwork from "./assets/images/phronon-master-1024.png";
import keyboardModeArtwork from "./assets/images/Keyboard mode.png";
import listeningModeArtwork from "./assets/images/Listening mode.png";
import readerEmptyStateArtwork from "./assets/images/Empty state (No file loaded).png";

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

type IndexedParagraphSearchMatch = ParagraphSearchMatch & {
  matchIndex: number;
};

type ReaderTextSelection = {
  paragraphIndex: number;
  selectedText: string;
  startOffset: number;
  endOffset: number;
};

type HighlightRenderSegment = {
  startIndex: number;
  endIndex: number;
  text: string;
  highlight: TextHighlight | null;
  searchMatch: IndexedParagraphSearchMatch | null;
};

type VoiceCommandPhase =
  | "idle"
  | "starting"
  | "listening"
  | "heardNothing"
  | "noMatch"
  | "permissionDenied"
  | "unsupported"
  | "interrupted";

type VoiceCommandTrustState = "unsupported" | "detected" | "confirmed" | "unreliable";

type VoiceCommandSession = {
  attemptId: number;
  requestedAt: number;
  recognitionStartedAt: number | null;
  audioStartedAt: number | null;
  audioEndedAt: number | null;
  soundStartedAt: number | null;
  soundEndedAt: number | null;
  speechStartedAt: number | null;
  speechEndedAt: number | null;
  finalStateReached: boolean;
  resultHandled: boolean;
  matchedCommand: boolean;
  manualStop: boolean;
  microphoneReady: boolean;
  lastError: string | null;
  transcripts: string[];
};

type WelcomePanelProps = {
  onOpenDocument: () => Promise<void>;
  onDismiss: () => void;
  runtimeSupportStatus: RuntimeSupportStatus | null;
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
    description: "Adjust reading comfort, voice behavior, and device readiness."
  }
];

const interfaceTextScaleValueMap: Record<InterfaceTextScale, number> = {
  default: 1,
  large: 1.08,
  largest: 1.16
};

const readerTextScaleValueMap: Record<ReaderTextScale, number> = {
  default: 1,
  large: 1.15,
  largest: 1.3
};

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

function groupShortcutDefinitions<Action extends string>(definitions: ShortcutDefinition<Action>[]) {
  const groupedDefinitions = new Map<string, ShortcutDefinition<Action>[]>();

  definitions.forEach((definition) => {
    const currentGroup = groupedDefinitions.get(definition.groupLabel) ?? [];
    currentGroup.push(definition);
    groupedDefinitions.set(definition.groupLabel, currentGroup);
  });

  return Array.from(groupedDefinitions.entries()).map(([groupLabel, shortcuts]) => ({
    groupLabel,
    shortcuts
  }));
}

function findNextItemIndex(length: number, currentIndex: number, direction: "previous" | "next") {
  if (length === 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return direction === "next" ? 0 : length - 1;
  }

  return direction === "next"
    ? (currentIndex + 1) % length
    : (currentIndex - 1 + length) % length;
}

function findDirectionalParagraphItemIndex<T extends { paragraphIndex: number }>(
  items: T[],
  currentParagraphIndex: number,
  direction: "previous" | "next"
) {
  if (items.length === 0) {
    return -1;
  }

  if (direction === "next") {
    const nextIndex = items.findIndex((item) => item.paragraphIndex > currentParagraphIndex);
    return nextIndex === -1 ? 0 : nextIndex;
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].paragraphIndex < currentParagraphIndex) {
      return index;
    }
  }

  return items.length - 1;
}

const groupedAppShortcuts = groupShortcutDefinitions(appShortcutDefinitions);
const groupedReaderShortcuts = groupShortcutDefinitions(readerShortcutDefinitions);
const settingsShortcutGroupLabelMap: Record<string, string> = {
  Global: "App-wide",
  Landmarks: "Reader landmarks",
  Reading: "Reading flow",
  "Find and markers": "Search, bookmarks, and highlights"
};

const voiceCommandEarlyEndThresholdMs = 900;
const voiceCommandDebugLoggingEnabled =
  typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
const groupedSettingsShortcuts = [...groupedAppShortcuts, ...groupedReaderShortcuts].map((group) => ({
  ...group,
  settingsLabel: settingsShortcutGroupLabelMap[group.groupLabel]
}));
const readerVoiceCommandLabels = [
  "Open file",
  "Play",
  "Pause",
  "Stop",
  "Next paragraph",
  "Previous paragraph",
  "Repeat paragraph",
  "Faster",
  "Slower"
] as const;
const returnToDocumentHint = "Return to the document with Escape or Ctrl+1.";
const readerRegionDefinitions = [
  {
    id: "document",
    label: "Document",
    shortcutLabel: "Ctrl+1",
    ariaKeyshortcuts: "Control+1"
  },
  {
    id: "playback",
    label: "Playback",
    shortcutLabel: "Ctrl+2",
    ariaKeyshortcuts: "Control+2"
  },
  {
    id: "search",
    label: "Search",
    shortcutLabel: "Ctrl+3",
    ariaKeyshortcuts: "Control+3"
  },
  {
    id: "highlights",
    label: "Highlights",
    shortcutLabel: "Ctrl+4",
    ariaKeyshortcuts: "Control+4"
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    shortcutLabel: "Ctrl+5",
    ariaKeyshortcuts: "Control+5"
  },
  {
    id: "help",
    label: "Shortcuts",
    shortcutLabel: "Ctrl+6",
    ariaKeyshortcuts: "Control+6"
  }
] as const satisfies ReadonlyArray<{
  id: "document" | "playback" | "search" | "highlights" | "bookmarks" | "help";
  label: string;
  shortcutLabel?: string;
  ariaKeyshortcuts?: string;
}>;
type ReaderRegionId = (typeof readerRegionDefinitions)[number]["id"];

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

function getNearestSearchMatchIndex(matches: ParagraphSearchMatch[], currentParagraphIndex: number) {
  const matchIndex = matches.findIndex((match) => match.paragraphIndex >= currentParagraphIndex);

  return matchIndex === -1 ? 0 : matchIndex;
}

function groupSearchMatchesByParagraph(matches: ParagraphSearchMatch[]) {
  const matchesByParagraph = new Map<number, IndexedParagraphSearchMatch[]>();

  matches.forEach((match, matchIndex) => {
    const paragraphMatches = matchesByParagraph.get(match.paragraphIndex) ?? [];

    paragraphMatches.push({
      ...match,
      matchIndex
    });
    matchesByParagraph.set(match.paragraphIndex, paragraphMatches);
  });

  return matchesByParagraph;
}

function groupHighlightsByParagraph(highlights: TextHighlight[]) {
  const highlightsByParagraph = new Map<number, TextHighlight[]>();

  highlights.forEach((highlight) => {
    const paragraphHighlights = highlightsByParagraph.get(highlight.paragraphIndex) ?? [];
    paragraphHighlights.push(highlight);
    highlightsByParagraph.set(highlight.paragraphIndex, paragraphHighlights);
  });

  highlightsByParagraph.forEach((paragraphHighlights) => {
    paragraphHighlights.sort((left, right) => {
      if (left.startOffset !== right.startOffset) {
        return left.startOffset - right.startOffset;
      }

      return left.endOffset - right.endOffset;
    });
  });

  return highlightsByParagraph;
}

function resolveParagraphTextOffset(container: HTMLElement, targetNode: Node, targetOffset: number) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let totalOffset = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const currentTextNode = currentNode as Text;
    const currentLength = currentTextNode.data.length;

    if (currentTextNode === targetNode) {
      return totalOffset + Math.min(Math.max(targetOffset, 0), currentLength);
    }

    totalOffset += currentLength;
    currentNode = walker.nextNode();
  }

  return totalOffset;
}

function getSelectionInsideParagraph(selection: Selection | null): ReaderTextSelection | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const selectedText = normalizeHighlightSelectionText(selection.toString());

  if (!selectedText) {
    return null;
  }

  const startContainer =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
  const endContainer =
    range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
  const startParagraphBody =
    startContainer instanceof Element ? startContainer.closest<HTMLElement>("[data-reader-paragraph-body='true']") : null;
  const endParagraphBody =
    endContainer instanceof Element ? endContainer.closest<HTMLElement>("[data-reader-paragraph-body='true']") : null;

  if (!startParagraphBody || !endParagraphBody || startParagraphBody !== endParagraphBody) {
    return null;
  }

  const paragraphIndex = Number(startParagraphBody.dataset.paragraphIndex);

  if (!Number.isFinite(paragraphIndex)) {
    return null;
  }

  const startOffset = resolveParagraphTextOffset(startParagraphBody, range.startContainer, range.startOffset);
  const endOffset = resolveParagraphTextOffset(startParagraphBody, range.endContainer, range.endOffset);
  const safeStartOffset = Math.min(startOffset, endOffset);
  const safeEndOffset = Math.max(startOffset, endOffset);

  if (safeEndOffset <= safeStartOffset) {
    return null;
  }

  return {
    paragraphIndex,
    selectedText,
    startOffset: safeStartOffset,
    endOffset: safeEndOffset
  };
}

function selectionTouchesReader(selection: Selection | null) {
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const startContainer =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
  const endContainer =
    range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
  const startInsideReader =
    startContainer instanceof Element ? startContainer.closest("[data-reader-paragraph-body='true']") !== null : false;
  const endInsideReader =
    endContainer instanceof Element ? endContainer.closest("[data-reader-paragraph-body='true']") !== null : false;

  return startInsideReader || endInsideReader;
}

function buildParagraphRenderSegments(
  paragraph: string,
  paragraphHighlights: TextHighlight[],
  paragraphMatches: IndexedParagraphSearchMatch[]
) {
  const boundaries = new Set<number>([0, paragraph.length]);

  paragraphHighlights.forEach((highlight) => {
    boundaries.add(Math.min(Math.max(highlight.startOffset, 0), paragraph.length));
    boundaries.add(Math.min(Math.max(highlight.endOffset, 0), paragraph.length));
  });

  paragraphMatches.forEach((match) => {
    boundaries.add(Math.min(Math.max(match.startIndex, 0), paragraph.length));
    boundaries.add(Math.min(Math.max(match.endIndex, 0), paragraph.length));
  });

  const orderedBoundaries = Array.from(boundaries).sort((left, right) => left - right);
  const segments: HighlightRenderSegment[] = [];

  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const startIndex = orderedBoundaries[index];
    const endIndex = orderedBoundaries[index + 1];

    if (endIndex <= startIndex) {
      continue;
    }

    const text = paragraph.slice(startIndex, endIndex);

    if (!text) {
      continue;
    }

    segments.push({
      startIndex,
      endIndex,
      text,
      highlight:
        paragraphHighlights.find(
          (highlight) => highlight.startOffset <= startIndex && highlight.endOffset >= endIndex
        ) ?? null,
      searchMatch:
        paragraphMatches.find((match) => match.startIndex <= startIndex && match.endIndex >= endIndex) ?? null
    });
  }

  return segments;
}

function WelcomePanel(props: WelcomePanelProps) {
  const titleId = useId();
  const tipsId = useId();
  const setupId = useId();

  return (
    <section className="welcome-panel" aria-labelledby={titleId} aria-describedby={`${setupId} ${tipsId}`}>
      <div className="welcome-panel-header">
        <div>
          <p className="panel-kicker">Welcome</p>
          <h2 id={titleId}>Phronon is ready to help you open study text and start listening.</h2>
        </div>
        <button type="button" className="secondary-button" onClick={props.onDismiss}>
          Dismiss welcome
        </button>
      </div>
      <p className="welcome-panel-text">
        You can start right away with TXT files and standard text-based PDFs. Open a file, then go to Reader and press
        Play or Space to start listening.
      </p>
      <p id={setupId} className="status-message compact-status" role="status" aria-live="polite" aria-atomic="true">
        {props.runtimeSupportStatus
          ? props.runtimeSupportStatus.message
          : "Checking what already works and what may need extra setup on this device."}
      </p>
      <div className="welcome-panel-actions">
        <button type="button" className="primary-button" onClick={() => void props.onOpenDocument()}>
          Open a document
        </button>
      </div>
      <ul id={tipsId} className="simple-list welcome-panel-list" aria-label="Getting started tips">
        <li>Open a file: press `Ctrl+O` anywhere, or use Import File on Home.</li>
        <li>Scanned PDFs use optional OCR. Arabic OCR and Arabic voices may need extra setup.</li>
        <li>Open `Settings` to review this device status in the Setup diagnostics section.</li>
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
    <section className="page-workspace home-workspace" aria-labelledby={homeTitleId}>
      <div className="home-layout">
        <section className="home-launchpad" aria-labelledby={homeTitleId}>
          <div className="home-launchpad-hero">
            <div className="home-launchpad-copy">
              <p className="page-banner-label">Home</p>
              <h2 id={homeTitleId}>Start reading with one clear next step</h2>
              <p className="page-banner-text">
                Import a study file, keep your latest material close, and move into Reader without a dashboard detour.
              </p>
            </div>
            <div className="home-launchpad-brand" aria-hidden="true">
              <div className="home-launchpad-brand-frame">
                <img
                  className="home-launchpad-brand-image"
                  src={phrononMasterArtwork}
                  alt=""
                  width={1024}
                  height={1024}
                  decoding="async"
                />
              </div>
            </div>
          </div>

          <div className="home-launchpad-actions">
            <div className="home-primary-action">
              <div className="home-primary-action-copy">
                <p className="panel-kicker">Primary action</p>
                <h3 id={homeImportTitleId}>Import study material</h3>
                <p>Open a TXT or PDF file and continue directly into the Reader workspace.</p>
              </div>
              <button
                className="primary-button home-import-button"
                type="button"
                onClick={() => void props.onImportFile()}
                disabled={isFilePickerLoading}
                aria-label={importButtonLabel}
                aria-describedby={homeImportStatusId}
              >
                {isFilePickerLoading ? "Choosing document..." : "Import File"}
              </button>
            </div>

            <div className="home-supporting-grid">
              <div className="home-status-card">
                <p className="panel-kicker">Current session</p>
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
              </div>

              <div className="home-flow-card" aria-label="Study flow summary">
                <p className="panel-kicker">Reading flow</p>
                <ul className="simple-list home-flow-list">
                  <li>Import one study file and move straight into Reader.</li>
                  <li>Use recent material to reopen where you left off.</li>
                  <li>Keep playback, search, bookmarks, and highlights inside Reader.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="home-recents panel-section" aria-labelledby={homeRecentTitleId} aria-describedby={homeRecentHintId}>
          <div className="panel-section-header home-recents-header">
            <p className="panel-kicker">Recent</p>
            <h3 id={homeRecentTitleId}>Recent study material</h3>
            <p id={homeRecentHintId}>Pick up quickly from the latest file instead of re-importing it.</p>
          </div>
          {props.recentDocuments.length > 0 ? (
            <ul className="simple-list home-recent-list" aria-label="Recent documents">
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
            <p className="hint">No recent documents yet. Import a TXT or PDF file to build your recent study list.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function ReaderScreen(props: {
  documentState: ReaderDocumentState;
  activeLoad: ActiveDocumentLoad | null;
  bookmarks: ParagraphBookmark[];
  highlights: TextHighlight[];
  currentParagraphIndex: number;
  onCurrentParagraphIndexChange: (nextIndex: number) => void;
  onAddBookmark: (paragraphIndex: number, paragraphText: string, noteText: string) => void;
  onUpsertHighlight: (highlight: TextHighlight) => void;
  onRemoveHighlight: (highlightId: string) => void;
  onOpenDocument: () => Promise<void>;
  availableVoices: SpeechSynthesisVoice[];
  voicesInitialized: boolean;
  playbackRate: number;
  onPlaybackRateChange: (nextRate: number) => void;
  speechVoicePreference: SpeechVoicePreference;
  preferredVoiceId: string | null;
  focusRequest: number;
  onAnnounce: (message: string) => void;
}) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackMessage, setPlaybackMessage] = useState("Load a .txt or .pdf file to start playback.");
  const [bookmarkMessage, setBookmarkMessage] = useState("No bookmarks saved for this document yet.");
  const [voiceCommandMessage, setVoiceCommandMessage] = useState("");
  const [voiceCommandPhase, setVoiceCommandPhase] = useState<VoiceCommandPhase>("idle");
  const [searchInputValue, setSearchInputValue] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(-1);
  const [bookmarkNoteInputValue, setBookmarkNoteInputValue] = useState("");
  const [highlightMessage, setHighlightMessage] = useState("No highlights saved for this document yet.");
  const [highlightNoteInputValue, setHighlightNoteInputValue] = useState("");
  const [selectedTextRange, setSelectedTextRange] = useState<ReaderTextSelection | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceCommandSessionRef = useRef<VoiceCommandSession | null>(null);
  const voiceCommandStartRequestRef = useRef(0);
  const nextVoiceCommandAttemptIdRef = useRef(0);
  const paragraphRefs = useRef<Array<HTMLElement | null>>([]);
  const paragraphBodyRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const searchMatchRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const bookmarkButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const highlightOpenButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const readerWorkspaceRef = useRef<HTMLElement | null>(null);
  const readerPanelRef = useRef<HTMLDivElement | null>(null);
  const openFileButtonRef = useRef<HTMLButtonElement | null>(null);
  const playButtonRef = useRef<HTMLButtonElement | null>(null);
  const voiceCommandButtonRef = useRef<HTMLButtonElement | null>(null);
  const shortcutsSummaryRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const bookmarkNoteInputRef = useRef<HTMLInputElement | null>(null);
  const highlightNoteInputRef = useRef<HTMLInputElement | null>(null);
  const highlightSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const playbackSectionRef = useRef<HTMLElement | null>(null);
  const searchSectionRef = useRef<HTMLElement | null>(null);
  const bookmarkSectionRef = useRef<HTMLElement | null>(null);
  const highlightSectionRef = useRef<HTMLElement | null>(null);
  const helpSectionRef = useRef<HTMLElement | null>(null);
  const playbackRangeRef = useRef<PlaybackRange | null>(null);
  const playbackPositionRef = useRef<PlaybackPosition | null>(null);
  const playbackSessionRef = useRef(0);
  const playbackStateRef = useRef<PlaybackState>("idle");
  const playbackRateRef = useRef(props.playbackRate);
  const activeReaderRegionRef = useRef<ReaderRegionId>("document");
  const restartPausedParagraphRef = useRef(false);
  const shouldFocusSearchMatchRef = useRef(false);
  const [activeReaderRegion, setActiveReaderRegion] = useState<ReaderRegionId>("document");
  const headingId = useId();
  const summaryTitleId = useId();
  const statusId = useId();
  const positionStatusId = useId();
  const readerLandmarkHintId = useId();
  const shortcutsHintId = useId();
  const documentRegionTitleId = useId();
  const documentRegionHintId = useId();
  const playbackRegionTitleId = useId();
  const playbackRegionHintId = useId();
  const toolSuiteTitleId = useId();
  const toolSuiteDescriptionId = useId();
  const helpRegionTitleId = useId();
  const helpRegionHintId = useId();
  const speedInputId = useId();
  const speedValueId = useId();
  const voiceCommandStatusId = useId();
  const voiceCommandSupportId = useId();
  const searchInputId = useId();
  const searchLabelId = useId();
  const searchStatusId = useId();
  const shortcutsReferenceId = useId();
  const bookmarkNoteInputId = useId();
  const bookmarkNoteHintId = useId();
  const highlightStatusId = useId();
  const highlightNoteInputId = useId();
  const highlightNoteHintId = useId();
  const paragraphs = splitIntoParagraphs(props.documentState.text);
  const searchMatches = useMemo(
    () => findParagraphSearchMatches(paragraphs, activeSearchQuery),
    [paragraphs, activeSearchQuery]
  );
  const searchMatchesByParagraph = useMemo(() => groupSearchMatchesByParagraph(searchMatches), [searchMatches]);
  const highlightsByParagraph = useMemo(() => groupHighlightsByParagraph(props.highlights), [props.highlights]);
  const hasText = Boolean(props.documentState.text?.trim());
  const speechSynthesisAvailable = "speechSynthesis" in window;
  const isFilePickerLoading = props.activeLoad?.origin === "filePicker";
  const voiceRecognitionAvailability = getVoiceRecognitionAvailability(window);
  const voiceRecognitionAvailable = voiceRecognitionAvailability.available;
  const [voiceCommandTrustState, setVoiceCommandTrustState] = useState<VoiceCommandTrustState>(
    voiceRecognitionAvailable ? "detected" : "unsupported"
  );
  const isListeningForVoiceCommand = voiceCommandPhase === "starting" || voiceCommandPhase === "listening";
  const voiceCommandInteractionDisabled =
    !voiceRecognitionAvailable ||
    (voiceCommandTrustState === "unreliable" && !isListeningForVoiceCommand);
  const activeSearchMatch =
    activeSearchMatchIndex >= 0 && activeSearchMatchIndex < searchMatches.length
      ? searchMatches[activeSearchMatchIndex]
      : null;
  const voiceCommandIdleMessage = !voiceRecognitionAvailable
    ? voiceRecognitionAvailability.message
    : voiceCommandTrustState === "confirmed"
      ? "Experimental voice commands listened successfully in this session. They still accept one exact English Reader command per press, and keyboard shortcuts remain the reliable primary workflow."
      : voiceCommandTrustState === "unreliable"
        ? "Speech recognition was detected, but this Electron/Chromium runtime ended listening before any usable audio or speech was captured. Phronon is treating the voice button as unavailable here, and keyboard shortcuts remain the reliable primary workflow."
        : `${voiceRecognitionAvailability.message} Keyboard shortcuts remain the reliable primary workflow.`;
  const searchStatusMessage = buildReaderSearchStatusMessage({
    isLoading: props.documentState.isLoading,
    hasText,
    searchQuery: activeSearchQuery,
    searchMatchCount: searchMatches.length,
    activeSearchMatchIndex,
    activeSearchParagraphIndex: activeSearchMatch?.paragraphIndex ?? null
  });
  const activeReaderRegionLabel =
    readerRegionDefinitions.find((definition) => definition.id === activeReaderRegion)?.label ?? "Document";

  function resolveReaderRegionLabel(region: ReaderRegionId) {
    return readerRegionDefinitions.find((definition) => definition.id === region)?.label ?? "Document";
  }

  function resolveReaderRegionFromTarget(target: EventTarget | null): ReaderRegionId | null {
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const regionId = target.closest<HTMLElement>("[data-reader-region]")?.dataset.readerRegion;

    switch (regionId) {
      case "document":
      case "playback":
      case "search":
      case "highlights":
      case "bookmarks":
      case "help":
        return regionId;
      default:
        return null;
    }
  }

  function focusParagraph(paragraphIndex: number) {
    const safeParagraphIndex = paragraphs.length === 0 ? 0 : Math.min(Math.max(paragraphIndex, 0), paragraphs.length - 1);
    const paragraphBody = paragraphBodyRefs.current[safeParagraphIndex];
    const paragraphArticle = paragraphRefs.current[safeParagraphIndex];

    paragraphBody?.scrollIntoView({
      block: "center",
      inline: "nearest"
    });
    paragraphBody?.focus();
    paragraphArticle?.scrollIntoView({
      block: "center",
      inline: "nearest"
    });

    if (!paragraphBody && !paragraphArticle) {
      readerPanelRef.current?.focus();
    }
  }

  function buildSearchResultAnnouncement(matchIndex: number, matches = searchMatches) {
    const nextMatch = matches[matchIndex];

    if (!nextMatch) {
      return "No search results yet.";
    }

    return buildReaderSearchResultAnnouncement({
      matchIndex,
      matchCount: matches.length,
      paragraphIndex: nextMatch.paragraphIndex
    });
  }

  function buildBookmarkAnnouncement(bookmark: ParagraphBookmark, bookmarkIndex: number) {
    return buildReaderSavedItemAnnouncement({
      kind: "Bookmark",
      itemIndex: bookmarkIndex,
      itemCount: props.bookmarks.length,
      paragraphIndex: bookmark.paragraphIndex,
      hasNote: Boolean(bookmark.note)
    });
  }

  function buildHighlightAnnouncement(highlight: TextHighlight, highlightIndex: number) {
    return buildReaderSavedItemAnnouncement({
      kind: "Highlight",
      itemIndex: highlightIndex,
      itemCount: props.highlights.length,
      paragraphIndex: highlight.paragraphIndex,
      hasNote: Boolean(highlight.note)
    });
  }

  function buildDocumentFocusAnnouncement(sourceRegion: ReaderRegionId | null) {
    return buildReaderDocumentReturnAnnouncement({
      hasText,
      paragraphIndex: props.currentParagraphIndex,
      sourceRegionLabel:
        sourceRegion && sourceRegion !== "document" ? resolveReaderRegionLabel(sourceRegion) : null,
      activeSearchMatchIndex,
      activeSearchMatchCount: searchMatches.length,
      activeSearchParagraphIndex: activeSearchMatch?.paragraphIndex ?? null,
      activeHighlightParagraphIndex: activeHighlight?.paragraphIndex ?? null,
      activeHighlightHasNote: Boolean(activeHighlight?.note),
      activeBookmarkParagraphIndex: currentBookmark?.paragraphIndex ?? null,
      activeBookmarkHasNote: Boolean(currentBookmark?.note)
    });
  }

  function logVoiceCommandDiagnostic(eventName: string, details?: Record<string, unknown>) {
    if (!voiceCommandDebugLoggingEnabled) {
      return;
    }

    console.info("[Reader voice command]", eventName, details ?? {});
  }

  function getVoiceCommandSessionSnapshot(session: VoiceCommandSession) {
    return {
      attemptId: session.attemptId,
      requestedAt: session.requestedAt,
      recognitionStartedAt: session.recognitionStartedAt,
      audioStartedAt: session.audioStartedAt,
      audioEndedAt: session.audioEndedAt,
      soundStartedAt: session.soundStartedAt,
      soundEndedAt: session.soundEndedAt,
      speechStartedAt: session.speechStartedAt,
      speechEndedAt: session.speechEndedAt,
      microphoneReady: session.microphoneReady,
      resultHandled: session.resultHandled,
      matchedCommand: session.matchedCommand,
      manualStop: session.manualStop,
      lastError: session.lastError,
      transcripts: session.transcripts
    };
  }

  async function probeVoiceCommandMicrophoneReadiness() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return {
        ok: false as const,
        reason: "mediaDevicesUnavailable" as const,
        detail: "This Electron/browser runtime does not expose microphone capture APIs to the Reader."
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      return {
        ok: true as const
      };
    } catch (error) {
      const errorName =
        error instanceof DOMException
          ? error.name
          : error && typeof error === "object" && "name" in error && typeof error.name === "string"
            ? error.name
            : "UnknownError";
      const errorMessage =
        error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error && typeof error.message === "string"
            ? error.message
            : "";

      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError" || errorName === "SecurityError") {
        return {
          ok: false as const,
          reason: "permissionDenied" as const,
          detail: errorMessage || "Microphone permission was denied before speech recognition could start."
        };
      }

      if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
        return {
          ok: false as const,
          reason: "noMicrophone" as const,
          detail: errorMessage || "No microphone input device was available to the Reader."
        };
      }

      if (errorName === "NotReadableError" || errorName === "TrackStartError" || errorName === "AbortError") {
        return {
          ok: false as const,
          reason: "microphoneBusy" as const,
          detail: errorMessage || "The microphone could not be opened for Reader voice commands."
        };
      }

      return {
        ok: false as const,
        reason: "unknown" as const,
        detail: errorMessage || `${errorName} prevented microphone access for Reader voice commands.`
      };
    }
  }

  function clearVoiceRecognitionHandlers(recognition: BrowserSpeechRecognition) {
    recognition.onaudioend = null;
    recognition.onaudiostart = null;
    recognition.onend = null;
    recognition.onnomatch = null;
    recognition.onerror = null;
    recognition.onresult = null;
    recognition.onsoundend = null;
    recognition.onsoundstart = null;
    recognition.onspeechend = null;
    recognition.onspeechstart = null;
    recognition.onstart = null;
  }

  function completeVoiceCommandSession(
    phase: VoiceCommandPhase,
    message: string,
    options?: {
      method?: "stop" | "abort" | "detachOnly";
      trustState?: VoiceCommandTrustState;
      recognition?: BrowserSpeechRecognition | null;
    }
  ) {
    const recognition = options?.recognition ?? voiceRecognitionRef.current;
    const method = options?.method ?? "stop";
    const session = voiceCommandSessionRef.current;

    if (session) {
      session.finalStateReached = true;
    }

    if (recognition) {
      clearVoiceRecognitionHandlers(recognition);

      if (method === "stop") {
        try {
          recognition.stop();
        } catch {
          // Some runtimes throw if recognition already ended.
        }
      } else if (method === "abort") {
        try {
          recognition.abort();
        } catch {
          // Some runtimes throw if recognition already ended.
        }
      }
    }

    if (!options?.recognition || options.recognition === voiceRecognitionRef.current) {
      voiceRecognitionRef.current = null;
    }

    if (options?.trustState) {
      setVoiceCommandTrustState(options.trustState);
    }

    setVoiceCommandPhase(phase);
    setVoiceCommandMessage(message);
    logVoiceCommandDiagnostic("status", {
      session: session ? getVoiceCommandSessionSnapshot(session) : null,
      phase,
      trustState: options?.trustState ?? null,
      message
    });
  }

  function renderParagraphText(paragraph: string, paragraphIndex: number) {
    const paragraphMatches = searchMatchesByParagraph.get(paragraphIndex) ?? [];
    const paragraphHighlights = highlightsByParagraph.get(paragraphIndex) ?? [];

    if (paragraphMatches.length === 0 && paragraphHighlights.length === 0) {
      return paragraph;
    }

    return buildParagraphRenderSegments(paragraph, paragraphHighlights, paragraphMatches).map((segment) => {
      const isActiveMatch = segment.searchMatch?.matchIndex === activeSearchMatchIndex;
      const isActiveHighlight = segment.highlight?.id === activeHighlightId;
      const className = [
        segment.highlight ? "reader-inline-highlight" : "",
        isActiveHighlight ? "reader-inline-highlight-active" : "",
        segment.searchMatch ? "reader-search-match" : "",
        isActiveMatch ? "reader-search-match-active" : ""
      ]
        .filter(Boolean)
        .join(" ");

      if (!className) {
        return segment.text;
      }

      return (
        <span
          key={`paragraph-${paragraphIndex}-segment-${segment.startIndex}-${segment.endIndex}`}
          ref={(element) => {
            if (element instanceof HTMLSpanElement && segment.searchMatch) {
              searchMatchRefs.current[segment.searchMatch.matchIndex] = element;
            }
          }}
          className={className}
          role={segment.highlight ? "button" : undefined}
          tabIndex={segment.highlight ? 0 : undefined}
          aria-label={
            segment.highlight
              ? `Highlight in paragraph ${paragraphIndex + 1}${segment.highlight.note ? `. Note: ${segment.highlight.note}` : ""}`
              : undefined
          }
          onClick={
            segment.highlight
              ? () => {
                  setActiveHighlightId(segment.highlight!.id);
                  setSelectedTextRange(null);
                  setHighlightNoteInputValue(segment.highlight!.note);
                  setHighlightMessage(`Loaded highlight from paragraph ${segment.highlight!.paragraphIndex + 1}.`);
                }
              : undefined
          }
          onKeyDown={
            segment.highlight
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveHighlightId(segment.highlight!.id);
                    setSelectedTextRange(null);
                    setHighlightNoteInputValue(segment.highlight!.note);
                    setHighlightMessage(`Loaded highlight from paragraph ${segment.highlight!.paragraphIndex + 1}.`);
                  }
                }
              : undefined
          }
        >
          {segment.text}
        </span>
      );
    });
  }

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
      completeVoiceCommandSession("idle", "", {
        method: "abort"
      });
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
    setSearchInputValue("");
    setActiveSearchQuery("");
    setActiveSearchMatchIndex(-1);
    searchMatchRefs.current = [];
    shouldFocusSearchMatchRef.current = false;
    setSelectedTextRange(null);
    setActiveHighlightId(null);
    setHighlightNoteInputValue("");
  }, [props.documentState.filePath, props.documentState.text]);

  useEffect(() => {
    if (searchMatches.length === 0) {
      if (activeSearchMatchIndex !== -1) {
        setActiveSearchMatchIndex(-1);
      }
      return;
    }

    if (activeSearchMatchIndex >= searchMatches.length) {
      setActiveSearchMatchIndex(searchMatches.length - 1);
    }
  }, [activeSearchMatchIndex, searchMatches.length]);

  useEffect(() => {
    if (!activeSearchQuery || searchMatches.length === 0) {
      return;
    }

    if (activeSearchMatch?.paragraphIndex === props.currentParagraphIndex) {
      return;
    }

    const paragraphMatchIndex = searchMatches.findIndex((match) => match.paragraphIndex === props.currentParagraphIndex);

    if (paragraphMatchIndex !== -1 && paragraphMatchIndex !== activeSearchMatchIndex) {
      setActiveSearchMatchIndex(paragraphMatchIndex);
    }
  }, [activeSearchMatch, activeSearchMatchIndex, activeSearchQuery, props.currentParagraphIndex, searchMatches]);

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
    if (activeSearchMatch && activeSearchMatch.paragraphIndex === props.currentParagraphIndex) {
      const activeMatchElement = searchMatchRefs.current[activeSearchMatchIndex];

      activeMatchElement?.scrollIntoView({
        block: "center",
        inline: "nearest"
      });

      if (shouldFocusSearchMatchRef.current) {
        paragraphRefs.current[activeSearchMatch.paragraphIndex]?.focus();
        shouldFocusSearchMatchRef.current = false;
      }

      return;
    }

    const currentParagraph = paragraphRefs.current[props.currentParagraphIndex];

    currentParagraph?.scrollIntoView({
      block: "nearest"
    });
  }, [activeSearchMatch, activeSearchMatchIndex, props.currentParagraphIndex]);

  useEffect(() => {
    if (props.focusRequest === 0) {
      return;
    }

    if (hasText) {
      focusParagraph(props.currentParagraphIndex);
      return;
    }

    openFileButtonRef.current?.focus();
  }, [hasText, props.currentParagraphIndex, props.focusRequest]);

  const handleReaderWorkspaceFocusIn = useEffectEvent((event: FocusEvent) => {
    const nextRegion = resolveReaderRegionFromTarget(event.target);

    if (!nextRegion || nextRegion === activeReaderRegionRef.current) {
      return;
    }

    activeReaderRegionRef.current = nextRegion;

    startTransition(() => {
      setActiveReaderRegion(nextRegion);
    });
  });

  useEffect(() => {
    const readerWorkspace = readerWorkspaceRef.current;

    if (!readerWorkspace) {
      return;
    }

    readerWorkspace.addEventListener("focusin", handleReaderWorkspaceFocusIn);

    return () => {
      readerWorkspace.removeEventListener("focusin", handleReaderWorkspaceFocusIn);
    };
  }, [handleReaderWorkspaceFocusIn]);

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

  function executeVoiceReaderCommand(command: VoiceReaderCommand) {
    switch (command) {
      case "openFile":
        setVoiceCommandMessage("Voice command heard: open file.");
        void handleOpenFile();
        return;
      case "play":
        setVoiceCommandMessage("Voice command heard: play.");
        handlePlay();
        return;
      case "pause":
        setVoiceCommandMessage("Voice command heard: pause.");
        handlePause();
        return;
      case "stop":
        setVoiceCommandMessage("Voice command heard: stop.");
        handleStop();
        return;
      case "nextParagraph":
        setVoiceCommandMessage("Voice command heard: next paragraph.");
        moveToParagraph("next");
        return;
      case "previousParagraph":
        setVoiceCommandMessage("Voice command heard: previous paragraph.");
        moveToParagraph("previous");
        return;
      case "repeatParagraph":
        setVoiceCommandMessage("Voice command heard: repeat paragraph.");
        handleRepeatCurrentParagraph();
        return;
      case "faster":
        setVoiceCommandMessage("Voice command heard: faster.");
        changePlaybackRate(0.1);
        return;
      case "slower":
        setVoiceCommandMessage("Voice command heard: slower.");
        changePlaybackRate(-0.1);
        return;
    }
  }

  async function handleListenForVoiceCommand() {
    if (!voiceRecognitionAvailable) {
      setVoiceCommandTrustState("unsupported");
      setVoiceCommandPhase("unsupported");
      setVoiceCommandMessage(voiceRecognitionAvailability.message);
      return;
    }

    if (isListeningForVoiceCommand) {
      voiceCommandStartRequestRef.current += 1;
      const activeSession = voiceCommandSessionRef.current;

      if (activeSession) {
        activeSession.manualStop = true;
      }

      completeVoiceCommandSession(
        "idle",
        "Voice command listening stopped before a command was captured.",
        {
          method: "abort"
        }
      );
      return;
    }

    const SpeechRecognitionConstructor = getVoiceRecognitionConstructor(window);

    if (!SpeechRecognitionConstructor) {
      setVoiceCommandTrustState("unsupported");
      setVoiceCommandPhase("unsupported");
      setVoiceCommandMessage(voiceRecognitionAvailability.message);
      return;
    }

    const startRequestId = voiceCommandStartRequestRef.current + 1;
    voiceCommandStartRequestRef.current = startRequestId;
    setVoiceCommandPhase("starting");
    setVoiceCommandMessage("Checking microphone access for one Reader voice command.");

    const microphoneProbe = await probeVoiceCommandMicrophoneReadiness();
    if (voiceCommandStartRequestRef.current !== startRequestId) {
      logVoiceCommandDiagnostic("microphone-probe-cancelled", {
        startRequestId
      });
      return;
    }
    logVoiceCommandDiagnostic("microphone-probe", microphoneProbe.ok ? { ok: true } : microphoneProbe);

    if (!microphoneProbe.ok) {
      if (microphoneProbe.reason === "permissionDenied") {
        setVoiceCommandTrustState("detected");
        setVoiceCommandPhase("permissionDenied");
        setVoiceCommandMessage("Microphone permission is required before Reader voice commands can listen.");
        return;
      }

      const isRuntimeFailure = microphoneProbe.reason === "mediaDevicesUnavailable";
      setVoiceCommandTrustState(isRuntimeFailure ? "unreliable" : "unsupported");
      setVoiceCommandPhase(isRuntimeFailure ? "interrupted" : "unsupported");
      setVoiceCommandMessage(
        isRuntimeFailure
          ? "Speech recognition was detected, but this Electron/browser runtime could not open microphone capture for Reader voice commands."
          : microphoneProbe.reason === "noMicrophone"
            ? "No microphone was available, so Reader voice commands could not start."
            : "Reader voice commands could not open the microphone on this device."
      );
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    const nextAttemptId = nextVoiceCommandAttemptIdRef.current + 1;
    const session: VoiceCommandSession = {
      attemptId: nextAttemptId,
      requestedAt: Date.now(),
      recognitionStartedAt: null,
      audioStartedAt: null,
      audioEndedAt: null,
      soundStartedAt: null,
      soundEndedAt: null,
      speechStartedAt: null,
      speechEndedAt: null,
      finalStateReached: false,
      resultHandled: false,
      matchedCommand: false,
      manualStop: false,
      microphoneReady: true,
      lastError: null,
      transcripts: []
    };

    nextVoiceCommandAttemptIdRef.current = nextAttemptId;
    voiceCommandSessionRef.current = session;
    logVoiceCommandDiagnostic("session-created", {
      session: getVoiceCommandSessionSnapshot(session)
    });
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 5;
    recognition.onstart = () => {
      session.recognitionStartedAt = Date.now();
      setVoiceCommandPhase("listening");
      setVoiceCommandMessage(
        "Voice command started. Listening now for one exact English Reader command."
      );
      logVoiceCommandDiagnostic("started", {
        session: getVoiceCommandSessionSnapshot(session)
      });
    };
    recognition.onaudiostart = () => {
      session.audioStartedAt = Date.now();
      logVoiceCommandDiagnostic("audio-start", {
        session: getVoiceCommandSessionSnapshot(session)
      });
    };
    recognition.onaudioend = () => {
      session.audioEndedAt = Date.now();
      logVoiceCommandDiagnostic("audio-end", {
        session: getVoiceCommandSessionSnapshot(session)
      });
    };
    recognition.onsoundstart = () => {
      session.soundStartedAt = Date.now();
      logVoiceCommandDiagnostic("sound-start", {
        session: getVoiceCommandSessionSnapshot(session)
      });
    };
    recognition.onsoundend = () => {
      session.soundEndedAt = Date.now();
      logVoiceCommandDiagnostic("sound-end", {
        session: getVoiceCommandSessionSnapshot(session)
      });
    };
    recognition.onspeechstart = () => {
      session.speechStartedAt = Date.now();
      logVoiceCommandDiagnostic("speech-start", {
        session: getVoiceCommandSessionSnapshot(session)
      });
    };
    recognition.onspeechend = () => {
      session.speechEndedAt = Date.now();
      logVoiceCommandDiagnostic("speech-end", {
        session: getVoiceCommandSessionSnapshot(session)
      });
    };
    recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
      const result = event.results[event.resultIndex];
      const commandAlternatives = result
        ? Array.from({ length: result.length }, (_, alternativeIndex) => result[alternativeIndex]?.transcript ?? "")
        : [];
      const heardTranscript = commandAlternatives.find((transcript) => transcript.trim()) ?? "";
      const command = commandAlternatives
        .map((transcript) => getVoiceReaderCommand(transcript))
        .find((supportedCommand): supportedCommand is VoiceReaderCommand => supportedCommand !== null);

      session.resultHandled = true;
      session.transcripts = commandAlternatives.filter((transcript) => transcript.trim().length > 0);
      logVoiceCommandDiagnostic("result", {
        session: getVoiceCommandSessionSnapshot(session)
      });

      if (!command) {
        completeVoiceCommandSession(
          "noMatch",
          heardTranscript
            ? `Voice command heard "${heardTranscript}", but it did not match a supported Reader command. Use one exact phrase from the list below.`
            : "Voice command heard speech, but no supported Reader command matched. Use one exact phrase from the list below.",
          {
            method: "abort",
            recognition,
            trustState: "confirmed"
          }
        );
        return;
      }

      session.matchedCommand = true;
      completeVoiceCommandSession("idle", `Voice command heard: ${heardTranscript || command}.`, {
        method: "abort",
        recognition,
        trustState: "confirmed"
      });
      executeVoiceReaderCommand(command);
    };
    recognition.onnomatch = () => {
      logVoiceCommandDiagnostic("no-match", {
        session: getVoiceCommandSessionSnapshot(session)
      });
      completeVoiceCommandSession(
        "noMatch",
        "Voice command heard speech, but no supported Reader command matched. Use one exact phrase from the list below.",
        {
          method: "abort",
          recognition,
          trustState: "confirmed"
        }
      );
    };
    recognition.onerror = (event: BrowserSpeechRecognitionErrorEvent) => {
      const elapsedSinceStart =
        session.recognitionStartedAt === null ? 0 : Date.now() - session.recognitionStartedAt;
      session.lastError = event.error;
      const trustState =
        event.error === "audio-capture" || event.error === "language-not-supported"
          ? "unsupported"
        : event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "detected"
            : didVoiceRecognitionEndBeforeCapture(session, elapsedSinceStart, voiceCommandEarlyEndThresholdMs)
              ? "unreliable"
              : "confirmed";

      logVoiceCommandDiagnostic("error", {
        error: event.error,
        message: event.message ?? null,
        elapsedSinceStart,
        session: getVoiceCommandSessionSnapshot(session)
      });

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        completeVoiceCommandSession(
          "permissionDenied",
          "Microphone permission was denied, so voice command listening could not stay active.",
          {
            method: "detachOnly",
            recognition,
            trustState
          }
        );
        return;
      }

      if (event.error === "no-speech") {
        completeVoiceCommandSession(
          "heardNothing",
          "Voice command listening started, but heard nothing before it ended. Try again closer to the microphone, or use keyboard shortcuts.",
          {
            method: "detachOnly",
            recognition,
            trustState
          }
        );
        return;
      }

      if (event.error === "audio-capture" || event.error === "language-not-supported") {
        completeVoiceCommandSession(
          "unsupported",
          "Speech recognition is present, but this device could not capture usable microphone input for Reader voice commands.",
          {
            method: "detachOnly",
            recognition,
            trustState
          }
        );
        return;
      }

      if (event.error === "aborted" && session.manualStop) {
        completeVoiceCommandSession(
          "idle",
          "Voice command listening stopped before a command was captured.",
          {
            method: "detachOnly",
            recognition,
            trustState
          }
        );
        return;
      }

      if (event.error === "network") {
        completeVoiceCommandSession(
          "interrupted",
          "Speech recognition started, but the Electron/Chromium speech service stopped before a Reader command could be captured on this device.",
          {
            method: "detachOnly",
            recognition,
            trustState: "unreliable"
          }
        );
        return;
      }

      completeVoiceCommandSession(
        "interrupted",
        "Voice command listening was interrupted before a command was captured. This Electron/browser speech-recognition runtime may be unreliable on this device.",
        {
          method: "detachOnly",
          recognition,
          trustState
        }
      );
    };
    recognition.onend = () => {
      const elapsedSinceStart =
        session.recognitionStartedAt === null ? 0 : Date.now() - session.recognitionStartedAt;
      const endedBeforeCapture = didVoiceRecognitionEndBeforeCapture(
        session,
        elapsedSinceStart,
        voiceCommandEarlyEndThresholdMs
      );

      logVoiceCommandDiagnostic("ended", {
        elapsedSinceStart,
        captureActivity: hasVoiceRecognitionCaptureActivity(session),
        resultHandled: session.resultHandled,
        matchedCommand: session.matchedCommand,
        manualStop: session.manualStop,
        session: getVoiceCommandSessionSnapshot(session)
      });

      if (session.finalStateReached) {
        voiceRecognitionRef.current = null;
        return;
      }

      if (session.manualStop) {
        completeVoiceCommandSession(
          "idle",
          "Voice command listening stopped before a command was captured.",
          {
            method: "detachOnly",
            recognition,
            trustState: voiceCommandTrustState
          }
        );
        return;
      }

      if (endedBeforeCapture) {
        completeVoiceCommandSession(
          "interrupted",
          "Voice command listening ended before any audio or speech was detected, so this Electron/Chromium speech-recognition runtime is not reliable enough to present as a working Reader control here.",
          {
            method: "detachOnly",
            recognition,
            trustState: "unreliable"
          }
        );
        return;
      }

      if (session.recognitionStartedAt === null || elapsedSinceStart < voiceCommandEarlyEndThresholdMs) {
        completeVoiceCommandSession(
          "interrupted",
          "Voice command listening ended too quickly to capture a usable Reader command on this device.",
          {
            method: "detachOnly",
            recognition,
            trustState: "unreliable"
          }
        );
        return;
      }

      if (!session.resultHandled && session.speechStartedAt === null) {
        completeVoiceCommandSession(
          "heardNothing",
          "Voice command listening started, but heard nothing before it ended. Try again closer to the microphone, or use keyboard shortcuts.",
          {
            method: "detachOnly",
            recognition,
            trustState: "confirmed"
          }
        );
        return;
      }

      completeVoiceCommandSession(
        "noMatch",
        "Voice command listening heard speech, but no supported Reader command matched. Use one exact phrase from the list below.",
        {
          method: "detachOnly",
          recognition,
          trustState: "confirmed"
        }
      );
    };

    try {
      voiceRecognitionRef.current = recognition;
      setVoiceCommandPhase("starting");
      setVoiceCommandMessage(
        "Starting voice command listening. Phronon will confirm once the microphone stays active long enough to use."
      );
      logVoiceCommandDiagnostic("start-requested", {
        session: getVoiceCommandSessionSnapshot(session)
      });
      recognition.start();
    } catch {
      completeVoiceCommandSession(
        "unsupported",
        "Voice command listening could not start on this device. Speech recognition was detected, but this Electron/browser environment did not keep it active.",
        {
          method: "detachOnly",
          recognition,
          trustState: "unreliable"
        }
      );
    }
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

  function moveToSearchMatch(nextMatchIndex: number) {
    if (searchMatches.length === 0) {
      return;
    }

    const safeMatchIndex = ((nextMatchIndex % searchMatches.length) + searchMatches.length) % searchMatches.length;
    const nextMatch = searchMatches[safeMatchIndex];

    shouldFocusSearchMatchRef.current = true;
    setActiveSearchMatchIndex(safeMatchIndex);
    props.onCurrentParagraphIndexChange(nextMatch.paragraphIndex);
  }

  function focusPlaybackTool() {
    playButtonRef.current?.focus();
    props.onAnnounce(
      hasText
        ? `Playback focused. Play is ready at paragraph ${props.currentParagraphIndex + 1} of ${paragraphs.length}.`
        : "Playback focused. Open a file to start reading."
    );
  }

  function focusSearchInput() {
    if (!hasText || props.documentState.isLoading) {
      props.onAnnounce("Search is not ready until a file is loaded.");
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.select();
    props.onAnnounce(
      activeSearchQuery
        ? searchMatches.length > 0
          ? `Search focused. ${searchMatches.length} match${searchMatches.length === 1 ? "" : "es"} for "${activeSearchQuery}".`
          : `Search focused. No matches for "${activeSearchQuery}".`
        : "Search focused. Query field ready."
    );
  }

  function focusBookmarkTool() {
    if (!hasText || !props.documentState.filePath) {
      bookmarkSectionRef.current?.focus();
      props.onAnnounce("Bookmarks focused. Open a file to use markers.");
      return;
    }

    const currentBookmarkIndex = props.bookmarks.findIndex(
      (bookmark) => bookmark.paragraphIndex === props.currentParagraphIndex
    );
    const targetButton =
      currentBookmarkIndex !== -1 ? bookmarkButtonRefs.current[currentBookmarkIndex] : null;

    if (targetButton) {
      targetButton.focus();
      props.onAnnounce(`Bookmarks focused. Marker for paragraph ${props.currentParagraphIndex + 1} is ready.`);
      return;
    }

    bookmarkNoteInputRef.current?.focus();
    bookmarkNoteInputRef.current?.select();
    props.onAnnounce(
      props.bookmarks.length > 0
        ? `Bookmarks focused. Note field ready for paragraph ${props.currentParagraphIndex + 1}.`
        : `Bookmarks focused. Save paragraph ${props.currentParagraphIndex + 1} as your first marker.`
    );
  }

  function focusHighlightTool() {
    if (!hasText || !props.documentState.filePath) {
      highlightSectionRef.current?.focus();
      props.onAnnounce("Highlights focused. Open a file to use highlights.");
      return;
    }

    const currentHighlightIndex = activeHighlightId
      ? props.highlights.findIndex((highlight) => highlight.id === activeHighlightId)
      : props.highlights.findIndex((highlight) => highlight.paragraphIndex === props.currentParagraphIndex);
    const targetButton =
      currentHighlightIndex !== -1 ? highlightOpenButtonRefs.current[currentHighlightIndex] : null;

    if (targetButton) {
      targetButton.focus();
      props.onAnnounce(
        `Highlights focused. Saved highlight for paragraph ${props.highlights[currentHighlightIndex].paragraphIndex + 1} is ready.`
      );
      return;
    }

    if ((selectedTextRange || activeHighlightId) && highlightNoteInputRef.current && !highlightNoteInputRef.current.disabled) {
      highlightNoteInputRef.current.focus();
      highlightNoteInputRef.current.select();
      props.onAnnounce("Highlights focused. Note field ready.");
      return;
    }

    if (selectedTextRange && highlightSaveButtonRef.current && !highlightSaveButtonRef.current.disabled) {
      highlightSaveButtonRef.current.focus();
      props.onAnnounce(`Highlights focused. Selection in paragraph ${selectedTextRange.paragraphIndex + 1} is ready to save.`);
      return;
    }

    highlightSectionRef.current?.focus();
    props.onAnnounce(
      props.highlights.length > 0
        ? "Highlights focused. Saved highlights are ready below."
        : "Highlights focused. Select text in the document to save a new highlight."
    );
  }

  function focusHelpRegion() {
    shortcutsSummaryRef.current?.focus();
    props.onAnnounce("Shortcuts focused. Ctrl+1 through Ctrl+6 move between Reader areas.");
  }

  function focusReaderTextRegion(sourceRegion: ReaderRegionId | null = activeReaderRegionRef.current) {
    if (!hasText) {
      readerPanelRef.current?.focus();
      props.onAnnounce("Reader text will be ready after a file is loaded.");
      return;
    }

    focusParagraph(props.currentParagraphIndex);
    props.onAnnounce(buildDocumentFocusAnnouncement(sourceRegion));
  }

  function focusReaderRegion(target: ReaderRegionId) {
    switch (target) {
      case "document":
        focusReaderTextRegion(activeReaderRegionRef.current === "document" ? null : activeReaderRegionRef.current);
        return;
      case "playback":
        focusPlaybackTool();
        return;
      case "search":
        focusSearchInput();
        return;
      case "highlights":
        focusHighlightTool();
        return;
      case "bookmarks":
        focusBookmarkTool();
        return;
      case "help":
        focusHelpRegion();
        return;
    }
  }

  function jumpToBookmarkByShortcut(direction: "previous" | "next") {
    if (props.bookmarks.length === 0) {
      setBookmarkMessage("No bookmarks are saved for this document yet.");
      props.onAnnounce("No bookmarks are saved for this document yet.");
      return;
    }

    const currentBookmarkIndex = props.bookmarks.findIndex(
      (bookmark) => bookmark.paragraphIndex === props.currentParagraphIndex
    );
    const nextBookmarkIndex =
      currentBookmarkIndex === -1
        ? findDirectionalParagraphItemIndex(props.bookmarks, props.currentParagraphIndex, direction)
        : findNextItemIndex(props.bookmarks.length, currentBookmarkIndex, direction);
    const nextBookmark = props.bookmarks[nextBookmarkIndex];

    if (!nextBookmark) {
      return;
    }

    handleJumpToBookmark(nextBookmark, nextBookmarkIndex);
  }

  function jumpToHighlightByShortcut(direction: "previous" | "next") {
    if (props.highlights.length === 0) {
      setHighlightMessage("No highlights are saved for this document yet.");
      props.onAnnounce("No highlights are saved for this document yet.");
      return;
    }

    const currentHighlightIndex = activeHighlightId
      ? props.highlights.findIndex((highlight) => highlight.id === activeHighlightId)
      : -1;
    const nextHighlightIndex =
      currentHighlightIndex === -1
        ? findDirectionalParagraphItemIndex(props.highlights, props.currentParagraphIndex, direction)
        : findNextItemIndex(props.highlights.length, currentHighlightIndex, direction);
    const nextHighlight = props.highlights[nextHighlightIndex];

    if (!nextHighlight) {
      return;
    }

    handleJumpToHighlight(nextHighlight, nextHighlightIndex);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasText) {
      setActiveSearchQuery("");
      setActiveSearchMatchIndex(-1);
      props.onAnnounce("Open a file to search it.");
      return;
    }

    const nextQuery = searchInputValue.trim();

    if (!nextQuery) {
      setActiveSearchQuery("");
      setActiveSearchMatchIndex(-1);
      searchInputRef.current?.focus();
      props.onAnnounce("Search cleared.");
      return;
    }

    const nextMatches = findParagraphSearchMatches(paragraphs, nextQuery);

    setActiveSearchQuery(nextQuery);

    if (nextMatches.length === 0) {
      setActiveSearchMatchIndex(-1);
      searchInputRef.current?.focus();
      props.onAnnounce(`No matches for "${nextQuery}".`);
      return;
    }

    const preferredMatchIndex = getNearestSearchMatchIndex(nextMatches, props.currentParagraphIndex);

    shouldFocusSearchMatchRef.current = true;
    setActiveSearchMatchIndex(preferredMatchIndex);
    props.onCurrentParagraphIndexChange(nextMatches[preferredMatchIndex].paragraphIndex);
    props.onAnnounce(
      `${nextMatches.length} match${nextMatches.length === 1 ? "" : "es"} found. ${buildSearchResultAnnouncement(preferredMatchIndex, nextMatches)}`
    );
  }

  function handleSearchStep(direction: "previous" | "next") {
    if (searchMatches.length === 0) {
      props.onAnnounce("No search results yet.");
      return;
    }

    const currentIndex =
      activeSearchMatchIndex === -1
        ? direction === "previous"
          ? searchMatches.length
          : -1
        : activeSearchMatchIndex;

    const nextMatchIndex = direction === "previous" ? currentIndex - 1 : currentIndex + 1;
    const safeMatchIndex = ((nextMatchIndex % searchMatches.length) + searchMatches.length) % searchMatches.length;

    moveToSearchMatch(nextMatchIndex);
    props.onAnnounce(buildSearchResultAnnouncement(safeMatchIndex));
  }

  const handleReaderKeydown = useEffectEvent((event: KeyboardEvent) => {
    const action = getReaderShortcutAction(event);
    const isEscapeShortcut = event.key === "Escape" || event.code === "Escape";

    if (!action) {
      return;
    }

    if (isInteractiveElement(event.target) && !isEscapeShortcut) {
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
      case "focusPlayback":
        focusPlaybackTool();
        return;
      case "focusSearch":
        focusSearchInput();
        return;
      case "nextSearchMatch":
        handleSearchStep("next");
        return;
      case "previousSearchMatch":
        handleSearchStep("previous");
        return;
      case "saveBookmark":
        handleAddBookmark();
        return;
      case "focusBookmarks":
        focusBookmarkTool();
        return;
      case "nextBookmark":
        jumpToBookmarkByShortcut("next");
        return;
      case "previousBookmark":
        jumpToBookmarkByShortcut("previous");
        return;
      case "focusHighlights":
        focusHighlightTool();
        return;
      case "nextHighlight":
        jumpToHighlightByShortcut("next");
        return;
      case "previousHighlight":
        jumpToHighlightByShortcut("previous");
        return;
      case "focusHelp":
        focusHelpRegion();
        return;
      case "focusReaderText":
        focusReaderTextRegion(activeReaderRegionRef.current === "document" ? null : activeReaderRegionRef.current);
        return;
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleReaderKeydown);

    return () => {
      window.removeEventListener("keydown", handleReaderKeydown);
    };
  }, [handleReaderKeydown]);

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
  const currentParagraphPreview = paragraphs[props.currentParagraphIndex]
    ? buildBookmarkPreviewText(paragraphs[props.currentParagraphIndex], 72)
    : null;
  const currentBookmark =
    props.bookmarks.find((bookmark) => bookmark.paragraphIndex === props.currentParagraphIndex) ?? null;
  const activeHighlight = props.highlights.find((highlight) => highlight.id === activeHighlightId) ?? null;
  const selectedExistingHighlight =
    selectedTextRange
      ? props.highlights.find(
          (highlight) =>
            highlight.paragraphIndex === selectedTextRange.paragraphIndex &&
            highlight.startOffset === selectedTextRange.startOffset &&
            highlight.endOffset === selectedTextRange.endOffset &&
            highlight.selectedText === selectedTextRange.selectedText
        ) ?? null
      : null;
  const bookmarkActionLabel = currentBookmark ? "Update marker" : "Save marker";
  const highlightActionLabel = selectedExistingHighlight ? "Update highlight" : "Save highlight";
  const bookmarkNoteStatus = buildReaderBookmarkHintMessage({
    hasBookmark: Boolean(currentBookmark),
    hasNote: Boolean(currentBookmark?.note)
  });
  const highlightStatusText = buildReaderHighlightHintMessage({
    hasText,
    selectedParagraphIndex: selectedTextRange?.paragraphIndex ?? null,
    selectedTextPreview: selectedTextRange ? buildBookmarkPreviewText(selectedTextRange.selectedText, 68) : null,
    activeHighlightParagraphIndex: activeHighlight?.paragraphIndex ?? null,
    activeHighlightPreview: activeHighlight ? buildBookmarkPreviewText(activeHighlight.selectedText, 68) : null
  });
  const selectedParagraphIndex = selectedTextRange?.paragraphIndex ?? null;
  const readerLandmarkStatusMessage = buildReaderRegionStatusMessage({
    activeRegion: activeReaderRegion,
    activeRegionLabel: activeReaderRegionLabel,
    hasText,
    paragraphIndex: props.currentParagraphIndex,
    paragraphCount: paragraphs.length,
    searchQuery: activeSearchQuery,
    searchMatchCount: searchMatches.length,
    highlightCount: props.highlights.length,
    bookmarkCount: props.bookmarks.length
  });

  useEffect(() => {
    setBookmarkMessage(
      props.bookmarks.length > 0
        ? `${props.bookmarks.length} bookmark${props.bookmarks.length === 1 ? "" : "s"} saved for this document.`
        : "No bookmarks saved for this document yet."
    );
  }, [props.bookmarks.length, props.documentState.filePath]);

  useEffect(() => {
    setHighlightMessage(
      props.highlights.length > 0
        ? `${props.highlights.length} highlight${props.highlights.length === 1 ? "" : "s"} saved for this document.`
        : "No highlights saved for this document yet."
    );
  }, [props.highlights.length, props.documentState.filePath]);

  useEffect(() => {
    setBookmarkNoteInputValue(currentBookmark?.note ?? "");
  }, [currentBookmark?.note, props.currentParagraphIndex, props.documentState.filePath]);

  useEffect(() => {
    if (!activeHighlightId) {
      return;
    }

    if (!activeHighlight) {
      setActiveHighlightId(null);
      setHighlightNoteInputValue("");
      return;
    }

    setHighlightNoteInputValue(activeHighlight.note);
  }, [activeHighlight, activeHighlightId]);

  function handleAddBookmark() {
    const currentParagraph = paragraphs[props.currentParagraphIndex];

    if (!props.documentState.filePath || !currentParagraph) {
      setBookmarkMessage("Open a file before saving a marker.");
      props.onAnnounce("Open a file before saving a marker.");
      return;
    }

    const normalizedNote = normalizeBookmarkNote(bookmarkNoteInputValue);

    props.onAddBookmark(props.currentParagraphIndex, currentParagraph, normalizedNote);
    setBookmarkNoteInputValue(normalizedNote);
    setBookmarkMessage(
      normalizedNote
        ? `Saved bookmark and note for paragraph ${props.currentParagraphIndex + 1}.`
        : `Saved bookmark for paragraph ${props.currentParagraphIndex + 1}.`
    );
    props.onAnnounce(
      normalizedNote
        ? `Marker and note saved for paragraph ${props.currentParagraphIndex + 1}.`
        : `Marker saved for paragraph ${props.currentParagraphIndex + 1}.`
    );
  }

  function captureSelectedTextRange() {
    const browserSelection = window.getSelection();
    const nextSelection = getSelectionInsideParagraph(browserSelection);

    if (!nextSelection) {
      if (selectionTouchesReader(browserSelection)) {
        setSelectedTextRange(null);
      }
      return;
    }

    setSelectedTextRange(nextSelection);
    setActiveHighlightId(null);

    const matchingHighlight =
      props.highlights.find(
        (highlight) =>
          highlight.paragraphIndex === nextSelection.paragraphIndex &&
          highlight.startOffset === nextSelection.startOffset &&
          highlight.endOffset === nextSelection.endOffset &&
          highlight.selectedText === nextSelection.selectedText
      ) ?? null;

    setHighlightNoteInputValue(matchingHighlight?.note ?? "");
      setHighlightMessage(
        matchingHighlight
          ? `Selected an existing highlight in paragraph ${nextSelection.paragraphIndex + 1}.`
          : `Selected text in paragraph ${nextSelection.paragraphIndex + 1}. Add an optional note and save the highlight.`
      );
      props.onAnnounce(
        matchingHighlight
          ? `Selected saved highlight in paragraph ${nextSelection.paragraphIndex + 1}.`
          : `Selected text in paragraph ${nextSelection.paragraphIndex + 1}.`
      );
  }

  function clearBrowserSelection() {
    window.getSelection()?.removeAllRanges();
  }

  function clearPendingHighlightSelection() {
    setSelectedTextRange(null);
    clearBrowserSelection();
    setHighlightMessage("Text selection cleared. You can still manage saved highlights below.");
    props.onAnnounce("Selected text cleared.");
  }

  function handleSaveHighlight() {
    if (!props.documentState.filePath || !selectedTextRange) {
      setHighlightMessage("Select text in the Reader before saving a highlight.");
      props.onAnnounce("Select text in the Reader before saving a highlight.");
      return;
    }

    const paragraphText = paragraphs[selectedTextRange.paragraphIndex];

    if (!paragraphText) {
      setHighlightMessage("That selection is no longer available.");
      props.onAnnounce("That selected text is no longer available.");
      return;
    }

    const nextHighlight = createTextHighlight({
      documentPath: props.documentState.filePath,
      paragraphIndex: selectedTextRange.paragraphIndex,
      paragraphText,
      selectedText: selectedTextRange.selectedText,
      startOffset: selectedTextRange.startOffset,
      endOffset: selectedTextRange.endOffset,
      noteText: normalizeHighlightNote(highlightNoteInputValue)
    });

    props.onUpsertHighlight(nextHighlight);
    setActiveHighlightId(nextHighlight.id);
    setSelectedTextRange(null);
    setHighlightNoteInputValue(nextHighlight.note);
    clearBrowserSelection();
    setHighlightMessage(
      nextHighlight.note
        ? `Saved highlight and note for paragraph ${nextHighlight.paragraphIndex + 1}.`
        : `Saved highlight for paragraph ${nextHighlight.paragraphIndex + 1}.`
    );
    props.onAnnounce(
      nextHighlight.note
        ? `Highlight and note saved for paragraph ${nextHighlight.paragraphIndex + 1}.`
        : `Highlight saved for paragraph ${nextHighlight.paragraphIndex + 1}.`
    );
  }

  function handleRemoveHighlight() {
    const highlightToRemove = activeHighlight ?? selectedExistingHighlight;

    if (!highlightToRemove) {
      setHighlightMessage("Choose a saved highlight before removing it.");
      props.onAnnounce("Choose a saved highlight before removing it.");
      return;
    }

    props.onRemoveHighlight(highlightToRemove.id);
    setActiveHighlightId(null);
    setSelectedTextRange(null);
    setHighlightNoteInputValue("");
    clearBrowserSelection();
    setHighlightMessage(`Removed highlight from paragraph ${highlightToRemove.paragraphIndex + 1}.`);
    props.onAnnounce(`Removed highlight from paragraph ${highlightToRemove.paragraphIndex + 1}.`);
  }

  function handleJumpToBookmark(bookmark: ParagraphBookmark, bookmarkIndex: number) {
    props.onCurrentParagraphIndexChange(bookmark.paragraphIndex);
    focusParagraph(bookmark.paragraphIndex);
    setBookmarkMessage(
      bookmark.note
        ? `Moved to paragraph ${bookmark.paragraphIndex + 1}. Marker note ready.`
        : `Moved to paragraph ${bookmark.paragraphIndex + 1}.`
    );
    props.onAnnounce(buildBookmarkAnnouncement(bookmark, bookmarkIndex));
  }

  function handleJumpToHighlight(highlight: TextHighlight, highlightIndex?: number) {
    props.onCurrentParagraphIndexChange(highlight.paragraphIndex);
    focusParagraph(highlight.paragraphIndex);
    setActiveHighlightId(highlight.id);
    setSelectedTextRange(null);
    setHighlightNoteInputValue(highlight.note);
    setHighlightMessage(
      highlight.note
        ? `Moved to paragraph ${highlight.paragraphIndex + 1}. Highlight note ready.`
        : `Moved to paragraph ${highlight.paragraphIndex + 1}.`
    );
    const resolvedHighlightIndex =
      highlightIndex ?? props.highlights.findIndex((savedHighlight) => savedHighlight.id === highlight.id);
    props.onAnnounce(
      resolvedHighlightIndex === -1
        ? `Moved to paragraph ${highlight.paragraphIndex + 1}.${highlight.note ? " Highlight note ready." : ""}`
        : buildHighlightAnnouncement(highlight, resolvedHighlightIndex)
    );
  }

  return (
    <section
      ref={readerWorkspaceRef}
      className="reader-workspace"
      aria-labelledby={headingId}
    >
      <div className="reader-top-band">
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
              {isFilePickerLoading ? "Choosing document…" : "Open file"}
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
              className={
                props.documentState.error ? "status-message error-text compact-status" : "status-message compact-status"
              }
              role={props.documentState.error ? "alert" : "status"}
              aria-live={props.documentState.error ? "assertive" : "polite"}
              aria-atomic="true"
            >
              {statusMessage}
            </p>
          </div>
        </section>

        <aside className="reader-utility-area" aria-label="Reader tools and landmarks">
          <nav className="reader-tool-jump-nav" aria-label="Jump between Reader regions" aria-describedby={readerLandmarkHintId}>
            <p className="reader-tool-jump-label">Reader areas</p>
            <div className="reader-tool-jump-list">
              {readerRegionDefinitions.map((jumpTarget) => (
                <button
                  key={jumpTarget.id}
                  className="reader-tool-jump-button"
                  type="button"
                  data-current={activeReaderRegion === jumpTarget.id ? "true" : undefined}
                  aria-keyshortcuts={jumpTarget.ariaKeyshortcuts}
                  onClick={() => focusReaderRegion(jumpTarget.id)}
                >
                  <span className="reader-tool-jump-button-label">{jumpTarget.label}</span>
                  <span className="reader-tool-jump-shortcut">{jumpTarget.shortcutLabel}</span>
                </button>
              ))}
            </div>
            <p id={readerLandmarkHintId} className="hint reader-region-status">
              {readerLandmarkStatusMessage}
            </p>
          </nav>

          <section
            ref={playbackSectionRef}
            className="reader-playback-bar"
            data-reader-region="playback"
            aria-labelledby={playbackRegionTitleId}
            aria-describedby={playbackRegionHintId}
          >
            <div className="reader-tool-header">
              <div>
                <p className="reader-toolbar-label">Playback</p>
                <h3 id={playbackRegionTitleId}>Reading controls</h3>
              </div>
            </div>
            <p id={playbackRegionHintId} className="hint">
              {returnToDocumentHint}
            </p>
            <div className="playback-row" role="group" aria-label="Primary playback actions">
              <div className="playback-group playback-group-primary">
                <button
                  ref={playButtonRef}
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
            </div>

            <div className="playback-secondary-row">
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

              <div className="playback-group playback-voice-group" role="group" aria-label="Voice command mode">
                <div className="playback-voice-copy">
                  <button
                    ref={voiceCommandButtonRef}
                    type="button"
                    onClick={handleListenForVoiceCommand}
                    disabled={voiceCommandInteractionDisabled}
                    aria-pressed={isListeningForVoiceCommand}
                    aria-describedby={`${voiceCommandStatusId} ${voiceCommandSupportId}`}
                  >
                    {isListeningForVoiceCommand
                      ? "Stop listening"
                      : voiceCommandInteractionDisabled
                        ? "Voice commands unavailable here"
                        : "Listen for one command"}
                  </button>
                  <p id={voiceCommandStatusId} className="status-message compact-status" role="status" aria-live="polite" aria-atomic="true">
                    {voiceCommandMessage || voiceCommandIdleMessage}
                  </p>
                  <p id={voiceCommandSupportId} className="hint playback-voice-note">
                    {voiceCommandInteractionDisabled
                      ? "Voice commands are currently downgraded on this device because this runtime did not keep listening reliably. Keyboard shortcuts and screen readers remain the reliable primary controls."
                      : "Experimental. One exact English phrase per press. Keyboard shortcuts and screen readers remain the reliable primary controls."}
                  </p>
                </div>
                <div className="playback-illustration" aria-hidden="true">
                  <img
                    className="playback-illustration-image"
                    src={listeningModeArtwork}
                    alt=""
                    width={768}
                    height={768}
                    decoding="async"
                  />
                </div>
              </div>
            </div>

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
            </div>
          </section>

          <section className="reader-tool-suite" aria-labelledby={toolSuiteTitleId} aria-describedby={toolSuiteDescriptionId}>
            <div className="reader-tool-suite-header">
              <div>
                <p className="reader-toolbar-label">Study tools</p>
                <h3 id={toolSuiteTitleId}>Find, mark, and revisit</h3>
              </div>
              <p id={toolSuiteDescriptionId}>Search, highlights, and bookmarks stay together in one quiet rail.</p>
            </div>

            <div className="reader-suite-sections">
              <section
                ref={searchSectionRef}
                className="reader-search-panel reader-suite-section"
                data-reader-region="search"
                aria-labelledby={searchLabelId}
              >
                <div className="reader-tool-header">
                  <div>
                    <p className="reader-toolbar-label">Search</p>
                    <h3>Find inside this document</h3>
                  </div>
                </div>
                <form className="reader-search-form" onSubmit={handleSearchSubmit}>
                  <label className="field reader-search-field" htmlFor={searchInputId}>
                    <span id={searchLabelId}>Search this document</span>
                    <input
                      ref={searchInputRef}
                      id={searchInputId}
                      name="documentSearch"
                      type="search"
                      value={searchInputValue}
                      onChange={(event) => setSearchInputValue(event.target.value)}
                      placeholder="Find text in this file…"
                      autoComplete="off"
                      disabled={!hasText || props.documentState.isLoading}
                      aria-describedby={searchStatusId}
                    />
                  </label>
                  <div className="reader-search-actions">
                    <button type="submit" disabled={!hasText || props.documentState.isLoading}>
                      Search
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSearchStep("previous")}
                      disabled={searchMatches.length === 0}
                      aria-controls={currentParagraphId}
                    >
                      Previous match
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSearchStep("next")}
                      disabled={searchMatches.length === 0}
                      aria-controls={currentParagraphId}
                    >
                      Next match
                    </button>
                  </div>
                </form>
                <p
                  id={searchStatusId}
                  className="status-message compact-status"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {searchStatusMessage}
                </p>
                <p className="hint reader-return-hint">{returnToDocumentHint}</p>
              </section>

              <section
                ref={highlightSectionRef}
                className="reader-highlights reader-suite-section"
                data-reader-region="highlights"
                aria-labelledby="reader-highlights-title"
                tabIndex={-1}
              >
                <div className="reader-bookmarks-header">
                  <div>
                    <p className="reader-toolbar-label">Highlights</p>
                    <h3 id="reader-highlights-title">Short text highlights</h3>
                  </div>
                  <div className="reader-highlight-actions">
                    <button
                      ref={highlightSaveButtonRef}
                      type="button"
                      onClick={handleSaveHighlight}
                      disabled={!hasText || !props.documentState.filePath || !selectedTextRange}
                    >
                      {highlightActionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveHighlight}
                      disabled={!activeHighlight && !selectedExistingHighlight}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <p id={highlightStatusId} className="status-message compact-status" role="status" aria-live="polite" aria-atomic="true">
                  {highlightMessage}
                </p>
                <p className="hint">{highlightStatusText}</p>
                <label className="field bookmark-note-field" htmlFor={highlightNoteInputId}>
                  <span>Short note for this highlight</span>
                  <input
                    ref={highlightNoteInputRef}
                    id={highlightNoteInputId}
                    name="highlightNote"
                    type="text"
                    value={highlightNoteInputValue}
                    onChange={(event) => setHighlightNoteInputValue(event.target.value)}
                    maxLength={MAX_HIGHLIGHT_NOTE_LENGTH}
                    placeholder="Optional note…"
                    autoComplete="off"
                    disabled={!hasText || (!selectedTextRange && !activeHighlight)}
                    aria-describedby={highlightNoteHintId}
                  />
                </label>
                <p id={highlightNoteHintId} className="hint">
                  Keep notes short. Open a saved highlight or select text to work here. {returnToDocumentHint}
                </p>
                {props.highlights.length > 0 ? (
                  <ul className="simple-list bookmark-list" aria-label="Highlights for the current document">
                    {props.highlights.map((highlight, highlightIndex) => (
                      <li key={highlight.id} className="bookmark-list-item highlight-list-item">
                        <div
                          className={
                            highlight.id === activeHighlightId ? "bookmark-button highlight-card highlight-card-active" : "bookmark-button highlight-card"
                          }
                        >
                          <button
                            ref={(element) => {
                              highlightOpenButtonRefs.current[highlightIndex] = element;
                            }}
                            type="button"
                            className="highlight-card-open"
                            onClick={() => handleJumpToHighlight(highlight, highlightIndex)}
                            aria-controls={`reader-paragraph-${highlight.paragraphIndex}`}
                          >
                            <span className="bookmark-button-title">Paragraph {highlight.paragraphIndex + 1}</span>
                            <span className="bookmark-button-preview">{highlight.previewText}</span>
                            {highlight.note ? <span className="bookmark-button-note">Note: {highlight.note}</span> : null}
                          </button>
                          <button
                            type="button"
                            className="secondary-button highlight-card-remove"
                            onClick={() => {
                              setActiveHighlightId(highlight.id);
                              setHighlightNoteInputValue(highlight.note);
                              props.onRemoveHighlight(highlight.id);
                              setActiveHighlightId(null);
                              setSelectedTextRange(null);
                              clearBrowserSelection();
                              setHighlightMessage(`Removed highlight from paragraph ${highlight.paragraphIndex + 1}.`);
                              props.onAnnounce(`Removed highlight from paragraph ${highlight.paragraphIndex + 1}.`);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">Highlights will appear here after you select text and save one.</p>
                )}
              </section>

              <section
                ref={bookmarkSectionRef}
                className="reader-bookmarks reader-suite-section"
                data-reader-region="bookmarks"
                aria-labelledby="reader-bookmarks-title"
                tabIndex={-1}
              >
                <div className="reader-bookmarks-header">
                  <div>
                    <p className="reader-toolbar-label">Bookmarks</p>
                    <h3 id="reader-bookmarks-title">Saved markers for this document</h3>
                  </div>
                  <button type="button" onClick={handleAddBookmark} disabled={!hasText || !props.documentState.filePath}>
                    {bookmarkActionLabel}
                  </button>
                </div>
                <p className="status-message compact-status" role="status" aria-live="polite" aria-atomic="true">
                  {bookmarkMessage}
                </p>
                {currentParagraphPreview ? (
                  <p className="hint reader-context-preview">Current paragraph: {currentParagraphPreview}</p>
                ) : null}
                <label className="field bookmark-note-field" htmlFor={bookmarkNoteInputId}>
                  <span>Short note for this bookmarked paragraph</span>
                  <input
                    ref={bookmarkNoteInputRef}
                    id={bookmarkNoteInputId}
                    name="bookmarkNote"
                    type="text"
                    value={bookmarkNoteInputValue}
                    onChange={(event) => setBookmarkNoteInputValue(event.target.value)}
                    maxLength={MAX_BOOKMARK_NOTE_LENGTH}
                    placeholder="Optional study note…"
                    autoComplete="off"
                    disabled={!hasText || !props.documentState.filePath}
                    aria-describedby={bookmarkNoteHintId}
                  />
                </label>
                <p id={bookmarkNoteHintId} className="hint">
                  {bookmarkNoteStatus} Keep it short. Clear the field and save again to remove the note. {returnToDocumentHint}
                </p>
                {props.bookmarks.length > 0 ? (
                  <ul className="simple-list bookmark-list" aria-label="Bookmarks for the current document">
                    {props.bookmarks.map((bookmark, bookmarkIndex) => (
                      <li key={`${bookmark.documentPath}-${bookmark.paragraphIndex}`} className="bookmark-list-item">
                        <button
                          ref={(element) => {
                            bookmarkButtonRefs.current[bookmarkIndex] = element;
                          }}
                          type="button"
                          className="bookmark-button"
                          onClick={() => handleJumpToBookmark(bookmark, bookmarkIndex)}
                          aria-controls={`reader-paragraph-${bookmark.paragraphIndex}`}
                        >
                          <span className="bookmark-button-title">Paragraph {bookmark.paragraphIndex + 1}</span>
                          <span className="bookmark-button-preview">{bookmark.previewText}</span>
                          {bookmark.note ? <span className="bookmark-button-note">Note: {bookmark.note}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">Bookmarks will appear here after you save one from the current paragraph.</p>
                )}
              </section>
            </div>
          </section>

          <section
            ref={helpSectionRef}
            className="reader-tool-suite reader-help-panel"
            data-reader-region="help"
            aria-labelledby={helpRegionTitleId}
            aria-describedby={`${helpRegionHintId} ${shortcutsHintId}`}
          >
            <div className="reader-tool-suite-header">
              <div>
                <p className="reader-toolbar-label">Help</p>
                <h3 id={helpRegionTitleId}>Shortcuts and orientation</h3>
              </div>
              <p id={helpRegionHintId}>
                Keyboard landmarks and screen readers stay first here. Voice support stays secondary.
              </p>
            </div>

            <div id={shortcutsHintId} className="reader-shortcuts-compact">
              <p className="hint reader-shortcuts-note">
                `Ctrl+1` document, `Ctrl+2` playback, `Ctrl+3` search, `Ctrl+4` highlights, `Ctrl+5` bookmarks,
                `Ctrl+6` shortcuts. Core reading keys: `Space`, `J`, `K`, `R`, `F3`, `B`, `H`, and `Escape`.
              </p>
              <details className="reader-shortcuts-details">
                <summary
                  ref={(element) => {
                    shortcutsSummaryRef.current = element;
                  }}
                  id={shortcutsReferenceId}
                  className="reader-shortcuts-summary"
                >
                  Show full Reader shortcut help
                </summary>
                <div className="reader-shortcuts-reference" aria-labelledby={shortcutsReferenceId}>
                  {groupedAppShortcuts.map((shortcutGroup) => (
                    <div key={shortcutGroup.groupLabel} className="reader-shortcuts-group">
                      <p className="reader-shortcuts-group-label">{shortcutGroup.groupLabel}</p>
                      <ul className="simple-list reader-shortcuts-list" aria-label={`${shortcutGroup.groupLabel} shortcuts`}>
                        {shortcutGroup.shortcuts.map((shortcut) => (
                          <li key={shortcut.action}>
                            <strong>{shortcut.keys}</strong>: {shortcut.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {groupedReaderShortcuts.map((shortcutGroup) => (
                    <div key={shortcutGroup.groupLabel} className="reader-shortcuts-group">
                      <p className="reader-shortcuts-group-label">{shortcutGroup.groupLabel}</p>
                      <ul className="simple-list reader-shortcuts-list" aria-label={`${shortcutGroup.groupLabel} shortcuts`}>
                        {shortcutGroup.shortcuts.map((shortcut) => (
                          <li key={shortcut.action}>
                            <strong>{shortcut.keys}</strong>: {shortcut.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <p className="hint reader-shortcuts-note">
                    Reader shortcuts stay inactive while you type in Reader controls, except `Escape`, which returns
                    focus to the document.
                  </p>
                  <p className="hint reader-shortcuts-note">
                    Full shortcut reference also stays available in `Settings`.
                  </p>
                </div>
              </details>
              <p className="hint reader-shortcuts-note">
                Voice commands stay optional and experimental. They never replace keyboard shortcuts for reliable Reader
                control.
              </p>
              <details className="reader-shortcuts-details reader-voice-commands-details">
                <summary className="reader-shortcuts-summary">Show supported voice commands</summary>
                <div className="reader-shortcuts-reference" aria-label="Supported voice commands">
                  <p className="hint reader-shortcuts-note">
                    Voice commands work only after you press `Listen for one command`, and they only respond to exact
                    English phrases.
                  </p>
                  <ul className="simple-list reader-voice-command-list" aria-label="Supported Reader voice commands">
                    {readerVoiceCommandLabels.map((commandLabel) => (
                      <li key={commandLabel}>
                        <strong>{commandLabel}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </div>
          </section>
        </aside>
      </div>

      <section
        ref={readerPanelRef}
        className="reader-panel reader-panel-expanded"
        tabIndex={-1}
        data-reader-region="document"
        role="region"
        aria-labelledby={documentRegionTitleId}
        aria-describedby={`${documentRegionHintId} ${positionStatusId}`}
        onMouseUp={captureSelectedTextRange}
        onKeyUp={captureSelectedTextRange}
      >
        <h3 id={documentRegionTitleId} className="visually-hidden">
          Document text
        </h3>
        <p id={documentRegionHintId} className="visually-hidden">
          This region contains the extracted document text. Use the Reader tool area for playback, search, and marker
          controls, or use Reader shortcuts while focus is outside other controls.
        </p>
        {paragraphs.length > 0 ? (
          <div className="reader-text" role="list" aria-label="Document paragraphs">
            {paragraphs.map((paragraph, index) => (
              <article
                key={`${index}-${paragraph.slice(0, 32)}`}
                id={`reader-paragraph-${index}`}
                ref={(element) => {
                  paragraphRefs.current[index] = element;
                }}
                className={[
                  "reader-paragraph",
                  index === props.currentParagraphIndex ? "current-paragraph" : "",
                  selectedParagraphIndex === index ? "reader-paragraph-selection-active" : "",
                  searchMatchesByParagraph.has(index) ? "reader-paragraph-has-match" : "",
                  activeSearchMatch?.paragraphIndex === index ? "reader-paragraph-active-match" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="listitem"
                tabIndex={-1}
                aria-labelledby={`reader-paragraph-label-${index}`}
                aria-current={index === props.currentParagraphIndex ? "true" : undefined}
                onFocusCapture={() => {
                  if (props.currentParagraphIndex !== index) {
                    props.onCurrentParagraphIndexChange(index);
                  }
                }}
              >
                <span id={`reader-paragraph-label-${index}`} className="reader-paragraph-meta">
                  Paragraph {index + 1}
                </span>
                <p
                  id={`reader-paragraph-body-${index}`}
                  ref={(element) => {
                    paragraphBodyRefs.current[index] = element;
                  }}
                  className="reader-paragraph-body"
                  tabIndex={-1}
                  aria-describedby={`reader-paragraph-label-${index}`}
                  data-reader-paragraph-body="true"
                  data-paragraph-index={index}
                >
                  {renderParagraphText(paragraph, index)}
                </p>
                {selectedTextRange && selectedTextRange.paragraphIndex === index ? (
                  <div className="reader-selection-actions" role="group" aria-label={`Selected text actions for paragraph ${index + 1}`}>
                    <p className="reader-selection-preview">
                      Selected: <strong>{selectedTextRange.selectedText}</strong>
                    </p>
                    <div className="reader-selection-action-row">
                      <button
                        type="button"
                        className="primary-button reader-selection-save"
                        onClick={handleSaveHighlight}
                        disabled={!props.documentState.filePath}
                      >
                        {highlightActionLabel}
                      </button>
                      <button type="button" className="secondary-button" onClick={clearPendingHighlightSelection}>
                        Clear selection
                      </button>
                    </div>
                    <p className="hint reader-selection-hint">
                      Save now to highlight this text immediately. You can edit or remove notes later in the highlights panel.
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="reader-empty-state">
            <div className="reader-empty-illustration" aria-hidden="true">
              <img
                className="reader-empty-illustration-image"
                src={readerEmptyStateArtwork}
                alt=""
                width={768}
                height={768}
                decoding="async"
              />
            </div>
            <p className="reader-empty-eyebrow">Ready to read</p>
            <p className="empty-state">Open a readable `.txt` or `.pdf` document to begin.</p>
            <p className="hint">Use `Open file` above or press `Ctrl+O`.</p>
            <p className="hint reader-empty-shortcuts">
              Reader shortcuts center on a small map: `Ctrl+1` through `Ctrl+6`, `Space`, `S`, `J`, `K`, `R`,
              `Ctrl+F`, `F3`, `M`, `B`, `H`, `Escape`, and `Alt+Up` or `Alt+Down`.
            </p>
          </div>
        )}
      </section>
    </section>
  );
}

function SettingsScreen(props: {
  interfaceTextScale: InterfaceTextScale;
  onInterfaceTextScaleChange: (nextScale: InterfaceTextScale) => void;
  readerTextScale: ReaderTextScale;
  onReaderTextScaleChange: (nextScale: ReaderTextScale) => void;
  contrastMode: ContrastMode;
  onContrastModeChange: (nextMode: ContrastMode) => void;
  availableVoices: SpeechSynthesisVoice[];
  speechVoicePreference: SpeechVoicePreference;
  onSpeechVoicePreferenceChange: (nextPreference: SpeechVoicePreference) => void;
  preferredVoiceId: string | null;
  onPreferredVoiceIdChange: (nextVoiceId: string | null) => void;
  voicesInitialized: boolean;
  runtimeSupportStatus: RuntimeSupportStatus | null;
}) {
  const settingsTitleId = useId();
  const visibleLanguageId = useId();
  const visibleLanguageHintId = useId();
  const startupId = useId();
  const interfaceTextScaleId = useId();
  const readerTextScaleId = useId();
  const contrastModeId = useId();
  const speechVoiceModeId = useId();
  const speechVoiceId = useId();
  const voiceSummaryId = useId();
  const displayHintId = useId();
  const voiceModeHintId = useId();
  const voicePickerHintId = useId();
  const voiceFallbackId = useId();
  const voiceListId = useId();
  const hasArabicVoice = findArabicVoice(props.availableVoices) !== null;
  const runtimeDiagnostics = buildRuntimeDiagnosticsItems({
    runtimeSupportStatus: props.runtimeSupportStatus,
    voicesInitialized: props.voicesInitialized,
    hasArabicTtsVoice: hasArabicVoice
  });
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
  const diagnosticsReadyItems = runtimeDiagnostics.filter((item) => item.statusLabel === "Works immediately");
  const diagnosticsSetupItems = runtimeDiagnostics.filter((item) => item.statusLabel === "Optional extra setup");
  const diagnosticsUnavailableItems = runtimeDiagnostics.filter((item) => item.statusLabel === "Unavailable on this device");
  const diagnosticsCheckingItems = runtimeDiagnostics.filter((item) => item.statusLabel === "Checking");
  const diagnosticsSummaryItems = [
    { label: "Ready now", value: diagnosticsReadyItems.length },
    { label: "Optional setup", value: diagnosticsSetupItems.length },
    { label: "Unavailable", value: diagnosticsUnavailableItems.length },
    { label: "Checking", value: diagnosticsCheckingItems.length }
  ].filter((item) => item.value > 0);
  const diagnosticsSections = [
    {
      id: "ready",
      title: "Ready now",
      description: "These parts are already available on this device.",
      items: diagnosticsReadyItems
    },
    {
      id: "setup",
      title: "Needs optional setup",
      description: "These features need extra local setup before Phronon can use them.",
      items: diagnosticsSetupItems
    },
    {
      id: "unavailable",
      title: "Unavailable on this device",
      description: "Phronon will keep safe fallbacks until the device reports support here.",
      items: diagnosticsUnavailableItems
    },
    {
      id: "checking",
      title: "Still checking",
      description: "Phronon is still confirming these capabilities.",
      items: diagnosticsCheckingItems
    }
  ].filter((section) => section.items.length > 0);
  const settingsOverviewItems = [
    {
      title: "Reading comfort",
      description: "App defaults, text size, and contrast now live together so the basics are quick to review."
    },
    {
      title: "Voice choices",
      description:
        props.speechVoicePreference === "manual"
          ? "Manual voice mode stays visible with clear fallback guidance."
          : "Automatic voice behavior stays close to manual voice setup when you need more control."
    },
    {
      title: "Setup status",
      description:
        diagnosticsReadyItems.length === runtimeDiagnostics.length
          ? "Everything needed for core reading is ready on this device."
          : `${diagnosticsReadyItems.length} of ${runtimeDiagnostics.length} checks are ready now.`
    }
  ];

  return (
    <section className="page-workspace settings-workspace" aria-labelledby={settingsTitleId}>
      <div className="page-banner settings-banner">
        <div className="settings-banner-copy">
          <p className="page-banner-label">Settings</p>
          <h2 id={settingsTitleId}>Simple preferences, easy to review</h2>
          <p className="page-banner-text">
            Review everyday preferences, voice choices, and setup guidance in one calm place without turning the page
            into a dense control dump.
          </p>
        </div>
        <ul className="plain-list settings-banner-outline" aria-label="Settings overview">
          {settingsOverviewItems.map((item) => (
            <li key={item.title} className="settings-banner-outline-item">
              <p className="settings-banner-outline-title">{item.title}</p>
              <p className="settings-banner-outline-text">{item.description}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="settings-layout">
        <div className="settings-main-column">
          <section className="panel-section settings-region" aria-labelledby="settings-interface-title">
            <div className="panel-section-header settings-region-header">
              <p className="panel-kicker">Everyday setup</p>
              <h3 id="settings-interface-title">Reading comfort and defaults</h3>
              <p>Keep the basics together so a first pass through Settings answers what the app looks like and how it starts.</p>
            </div>

            <div className="settings-subsection-grid">
              <section className="settings-subsection" aria-labelledby="settings-defaults-title">
                <div className="settings-subsection-header">
                  <h4 id="settings-defaults-title">App defaults</h4>
                  <p>Choose the starting screen you want Phronon to return to and keep the current visible app language explicit.</p>
                </div>
                <div className="form-grid settings-form-grid" role="group" aria-label="App defaults">
                  <div
                    className="field settings-static-field"
                    aria-labelledby={visibleLanguageId}
                    aria-describedby={visibleLanguageHintId}
                  >
                    <span id={visibleLanguageId}>Visible app language</span>
                    <p className="settings-static-value">English</p>
                    <p id={visibleLanguageHintId} className="hint">
                      Home, Reader, and Settings still display in English. Arabic text reading, OCR, and voice support
                      remain available where supported, but the visible app UI does not switch languages yet.
                    </p>
                  </div>

                  <label className="field" htmlFor={startupId}>
                    <span>Open on startup</span>
                    <select id={startupId} name="startupScreen" defaultValue="home">
                      <option value="home">Home</option>
                      <option value="reader">Reader</option>
                      <option value="settings">Settings</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="settings-subsection" aria-labelledby="settings-display-title">
                <div className="settings-subsection-header">
                  <h4 id="settings-display-title">Display</h4>
                  <p>Adjust the overall scale and contrast without changing how navigation or playback works.</p>
                </div>
                <div className="form-grid settings-form-grid" role="group" aria-label="Display preferences">
                  <label className="field" htmlFor={interfaceTextScaleId}>
                    <span>App text size</span>
                    <select
                      id={interfaceTextScaleId}
                      name="interfaceTextScale"
                      value={props.interfaceTextScale}
                      onChange={(event) => props.onInterfaceTextScaleChange(parseInterfaceTextScale(event.target.value))}
                      aria-describedby={displayHintId}
                    >
                      <option value="default">Standard</option>
                      <option value="large">Large</option>
                      <option value="largest">Largest</option>
                    </select>
                  </label>

                  <label className="field" htmlFor={readerTextScaleId}>
                    <span>Reader text size</span>
                    <select
                      id={readerTextScaleId}
                      name="readerTextScale"
                      value={props.readerTextScale}
                      onChange={(event) => props.onReaderTextScaleChange(parseReaderTextScale(event.target.value))}
                      aria-describedby={displayHintId}
                    >
                      <option value="default">Standard</option>
                      <option value="large">Large</option>
                      <option value="largest">Largest</option>
                    </select>
                  </label>

                  <label className="field" htmlFor={contrastModeId}>
                    <span>Contrast</span>
                    <select
                      id={contrastModeId}
                      name="contrastMode"
                      value={props.contrastMode}
                      onChange={(event) => props.onContrastModeChange(parseContrastMode(event.target.value))}
                      aria-describedby={displayHintId}
                    >
                      <option value="default">Calm contrast</option>
                      <option value="strong">Stronger contrast</option>
                    </select>
                  </label>
                </div>
                <p id={displayHintId} className="hint">
                  These display changes only adjust size and contrast. Keyboard shortcuts, focus order, playback, and
                  screen-reader labels stay the same.
                </p>
              </section>

              <section
                className="settings-subsection settings-subsection-emphasis"
                aria-labelledby="settings-speech-mode-title"
                aria-describedby={`${voiceSummaryId} ${voiceModeHintId}`}
              >
                <div className="settings-subsection-header">
                  <h4 id="settings-speech-mode-title">Speech behavior</h4>
                  <p>Set how Phronon chooses a playback voice before you pick a specific manual voice below.</p>
                </div>
                <div className="form-grid settings-form-grid" role="group" aria-label="Speech behavior">
                  <label className="field" htmlFor={speechVoiceModeId}>
                    <span>Speech voice mode</span>
                    <select
                      id={speechVoiceModeId}
                      name="speechVoiceMode"
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
            </div>
          </section>

          <section className="panel-section settings-region" aria-labelledby="settings-voice-picker-title" aria-describedby={voiceSummaryId}>
            <div className="panel-section-header settings-region-header">
              <p className="panel-kicker">Playback voice</p>
              <h3 id="settings-voice-picker-title">Voice choice and fallback</h3>
              <p>Manual voice selection stays separate from everyday display controls, while fallback behavior remains easy to understand.</p>
            </div>

            <div className="settings-voice-layout">
              <div className="settings-voice-primary">
                <label className="field" htmlFor={speechVoiceId}>
                  <span>Preferred playback voice</span>
                  <select
                    id={speechVoiceId}
                    name="preferredSpeechVoice"
                    value={props.preferredVoiceId ?? ""}
                    onChange={(event) =>
                      props.onPreferredVoiceIdChange(event.target.value.trim() ? event.target.value : null)
                    }
                    disabled={props.availableVoices.length === 0}
                    aria-describedby={`${voicePickerHintId} ${voiceFallbackId} ${voiceListId}`}
                  >
                    <option value="">System default voice</option>
                    {props.availableVoices.map((voice) => (
                      <option key={getVoiceIdentifier(voice)} value={getVoiceIdentifier(voice)}>
                        {getVoiceDisplayName(voice)}
                      </option>
                    ))}
                  </select>
                </label>

                <p id={voicePickerHintId} className="hint">
                  Voice name and language come from the device. If metadata is incomplete, Phronon falls back to the safest
                  available label.
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
              </div>

              <section className="settings-subsection settings-voice-library" aria-labelledby="settings-detected-voices-title">
                <div className="settings-subsection-header">
                  <h4 id="settings-detected-voices-title">Detected voices</h4>
                  <p>Keep the device voice list nearby when you want to confirm what Phronon can choose from.</p>
                </div>
                {props.availableVoices.length > 0 ? (
                  <ul className="simple-list settings-voice-list" aria-label="Detected speech voices">
                    {props.availableVoices.map((voice) => (
                      <li key={getVoiceIdentifier(voice)} className="settings-voice-item">
                        <span className="settings-voice-name">{getVoiceDisplayName(voice)}</span>
                        <span className="settings-voice-meta">{voice.default ? "System default" : "Available voice"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint settings-empty-copy">No system voices were reported yet.</p>
                )}
              </section>
            </div>
          </section>

          <section className="panel-section settings-region settings-help-region" aria-labelledby="settings-shortcuts-title">
            <div className="panel-section-header settings-region-header">
              <p className="panel-kicker">Guidance</p>
              <h3 id="settings-shortcuts-title">Shortcut help and accessibility promises</h3>
              <p>The keyboard map stays visible in one place, with the product&apos;s accessibility promises beside it instead of in a separate heavy panel.</p>
            </div>

            <div className="settings-help-layout">
              <div className="settings-shortcuts-grid">
                {groupedSettingsShortcuts.map((shortcutGroup) => (
                  <section key={shortcutGroup.settingsLabel} className="settings-shortcut-group">
                    <p className="settings-shortcut-group-label">{shortcutGroup.settingsLabel}</p>
                    <ul className="simple-list" aria-label={`${shortcutGroup.settingsLabel} shortcuts`}>
                      {shortcutGroup.shortcuts.map((shortcut) => (
                        <li key={shortcut.action}>
                          <strong>{shortcut.keys}</strong>: {shortcut.description}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <aside className="settings-help-aside" aria-labelledby="settings-accessibility-title">
                <div className="settings-help-illustration" aria-hidden="true">
                  <img
                    className="settings-help-illustration-image"
                    src={keyboardModeArtwork}
                    alt=""
                    width={768}
                    height={768}
                    decoding="async"
                  />
                  <p className="settings-help-illustration-label">Keyboard-first by default</p>
                </div>
                <div className="settings-subsection-header">
                  <h4 id="settings-accessibility-title">Predictable by design</h4>
                  <p>These core promises keep Settings and Reader calm for keyboard and screen-reader users.</p>
                </div>
                <ul className="simple-list settings-accessibility-list">
                  <li>Keyboard navigation is available for every main action.</li>
                  <li>Focus order stays predictable when screens or document states change.</li>
                  <li>Status messages and controls keep explicit accessible names.</li>
                </ul>
                <p className="hint">
                  Reader shortcuts stay inactive while you are typing in search, bookmark notes, highlight notes, sliders,
                  or other form controls. `Escape` is the one exception and returns focus to the document text.
                </p>
              </aside>
            </div>
          </section>
        </div>

        <aside className="settings-support-column">
          <section className="panel-section settings-region settings-diagnostics-region" aria-labelledby="settings-readiness-title">
            <div className="panel-section-header settings-region-header">
              <p className="panel-kicker">Readiness</p>
              <h3 id="settings-readiness-title">Setup diagnostics</h3>
              <p>Check what is ready today, what needs extra local setup, and what this device still does not report.</p>
            </div>

            <div className="settings-diagnostics-summary" aria-label="Diagnostics summary">
              {diagnosticsSummaryItems.map((item) => (
                <div key={item.label} className="settings-diagnostics-summary-card">
                  <span className="settings-diagnostics-summary-value">{item.value}</span>
                  <span className="settings-diagnostics-summary-label">{item.label}</span>
                </div>
              ))}
            </div>

            <p className="status-message compact-status" role="status" aria-live="polite" aria-atomic="true">
              {props.runtimeSupportStatus?.message ?? "Checking what is ready on this device."}
            </p>

            <div className="settings-diagnostics-groups">
              {diagnosticsSections.map((section) => (
                <section key={section.id} className="settings-diagnostics-group" aria-labelledby={`settings-diagnostics-group-${section.id}`}>
                  <div className="settings-diagnostics-group-header">
                    <h4 id={`settings-diagnostics-group-${section.id}`}>{section.title}</h4>
                    <p>{section.description}</p>
                  </div>
                  <ul className="simple-list settings-diagnostics-list" aria-label={`${section.title} diagnostics`}>
                    {section.items.map((item) => (
                      <li key={item.id} className="settings-diagnostics-item">
                        <div className="settings-diagnostics-item-top">
                          <span className={`settings-status-pill settings-status-pill-${section.id}`}>{item.statusLabel}</span>
                          <span className="settings-diagnostics-name">{item.label}</span>
                        </div>
                        <p className="settings-diagnostics-detail">{item.detail}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </aside>
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
  const [bookmarksByDocument, setBookmarksByDocument] = useState<Record<string, ParagraphBookmark[]>>(
    initialPersistenceState.bookmarksByDocument
  );
  const [highlightsByDocument, setHighlightsByDocument] = useState<Record<string, TextHighlight[]>>(
    initialPersistenceState.highlightsByDocument
  );
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(initialPersistenceState.lastOpenedParagraphIndex);
  const [playbackRate, setPlaybackRate] = useState(initialPersistenceState.readingSpeed);
  const [interfaceTextScale, setInterfaceTextScale] = useState<InterfaceTextScale>(
    initialPersistenceState.interfaceTextScale
  );
  const [readerTextScale, setReaderTextScale] = useState<ReaderTextScale>(initialPersistenceState.readerTextScale);
  const [contrastMode, setContrastMode] = useState<ContrastMode>(initialPersistenceState.contrastMode);
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
  const [runtimeSupportStatus, setRuntimeSupportStatus] = useState<RuntimeSupportStatus | null>(null);
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
  const appShellStyle = {
    "--app-font-scale": interfaceTextScaleValueMap[interfaceTextScale].toString(),
    "--reader-font-scale": readerTextScaleValueMap[readerTextScale].toString()
  } as CSSProperties;

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

  function handleAddBookmark(paragraphIndex: number, paragraphText: string, noteText: string) {
    if (!documentState.filePath) {
      return;
    }

    const nextBookmark = createParagraphBookmark({
      documentPath: documentState.filePath,
      paragraphIndex,
      paragraphText,
      noteText
    });

    setBookmarksByDocument((current) => ({
      ...current,
      [documentState.filePath!]: upsertParagraphBookmark(
        getBookmarksForDocument(current, documentState.filePath),
        nextBookmark
      )
    }));
  }

  function handleUpsertHighlight(nextHighlight: TextHighlight) {
    setHighlightsByDocument((current) => ({
      ...current,
      [nextHighlight.documentPath]: upsertTextHighlight(
        getHighlightsForDocument(current, nextHighlight.documentPath),
        nextHighlight
      )
    }));
  }

  function handleRemoveHighlight(highlightId: string) {
    if (!documentState.filePath) {
      return;
    }

    setHighlightsByDocument((current) => ({
      ...current,
      [documentState.filePath!]: removeTextHighlight(getHighlightsForDocument(current, documentState.filePath), highlightId)
    }));
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

  useEffect(() => {
    let isSubscribed = true;

    void window.phronon
      .getRuntimeSupportStatus()
      .then((status) => {
        if (!isSubscribed) {
          return;
        }

        setRuntimeSupportStatus(status);
      })
      .catch(() => {
        if (!isSubscribed) {
          return;
        }

        setRuntimeSupportStatus({
          isPackaged: false,
          coreAppReady: true,
          pdfSupportAvailable: true,
          ocrSupportAvailable: false,
          arabicOcrSupportAvailable: false,
          message:
            "Phronon could not fully check optional extras yet. TXT files and standard text-based PDFs should still work."
        });
      });

    return () => {
      isSubscribed = false;
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
      if (isInteractiveElement(event.target)) {
        return;
      }

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
      bookmarksByDocument,
      highlightsByDocument,
      readingSpeed: clampReadingSpeed(playbackRate),
      interfaceTextScale,
      readerTextScale,
      contrastMode,
      speechVoicePreference,
      preferredVoiceId,
      lastOpenedDocumentPath,
      lastOpenedParagraphIndex:
        documentState.filePath && documentState.text ? clampParagraphIndex(currentParagraphIndex) : 0,
      hasSeenOnboarding
    });
  }, [
    bookmarksByDocument,
    contrastMode,
    currentParagraphIndex,
    documentState.filePath,
    documentState.text,
    hasSeenOnboarding,
    highlightsByDocument,
    interfaceTextScale,
    lastOpenedDocumentPath,
    playbackRate,
    preferredVoiceId,
    recentDocuments,
    readerTextScale,
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
    <div
      className={contrastMode === "strong" ? "app-shell app-shell-strong-contrast" : "app-shell"}
      style={appShellStyle}
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        <p key={liveMessage.id}>{liveMessage.text}</p>
      </div>

      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand-lockup">
            <div className="app-brand-mark" aria-hidden="true">
              <img
                className="app-brand-mark-image"
                src={phrononMasterArtwork}
                alt=""
                width={1024}
                height={1024}
                decoding="async"
              />
            </div>
            <p className="eyebrow">Phronon</p>
          </div>
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
              runtimeSupportStatus={runtimeSupportStatus}
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
              bookmarks={getBookmarksForDocument(bookmarksByDocument, documentState.filePath)}
              highlights={getHighlightsForDocument(highlightsByDocument, documentState.filePath)}
              currentParagraphIndex={currentParagraphIndex}
              onCurrentParagraphIndexChange={(nextIndex) => setCurrentParagraphIndex(clampParagraphIndex(nextIndex))}
              onAddBookmark={handleAddBookmark}
              onUpsertHighlight={handleUpsertHighlight}
              onRemoveHighlight={handleRemoveHighlight}
              onOpenDocument={() => loadDocument({ origin: "filePicker" })}
              availableVoices={availableVoices}
              voicesInitialized={voicesInitialized}
              playbackRate={playbackRate}
              onPlaybackRateChange={(nextRate) => setPlaybackRate(clampReadingSpeed(nextRate))}
              speechVoicePreference={speechVoicePreference}
              preferredVoiceId={preferredVoiceId}
              focusRequest={readerFocusRequest}
              onAnnounce={announce}
            />
          )}
          {activeScreen === "settings" && (
            <SettingsScreen
              interfaceTextScale={interfaceTextScale}
              onInterfaceTextScaleChange={setInterfaceTextScale}
              readerTextScale={readerTextScale}
              onReaderTextScaleChange={setReaderTextScale}
              contrastMode={contrastMode}
              onContrastModeChange={setContrastMode}
              availableVoices={availableVoices}
              speechVoicePreference={speechVoicePreference}
              onSpeechVoicePreferenceChange={setSpeechVoicePreference}
              preferredVoiceId={preferredVoiceId}
              onPreferredVoiceIdChange={setPreferredVoiceId}
              voicesInitialized={voicesInitialized}
              runtimeSupportStatus={runtimeSupportStatus}
            />
          )}
        </main>
      </div>
    </div>
  );
}
