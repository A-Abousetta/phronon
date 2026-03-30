import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";

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
  getVoiceReaderCommand,
  getVoiceRecognitionAvailability,
  getVoiceRecognitionConstructor,
  type VoiceReaderCommand
} from "./voiceCommands";
import { buildRuntimeDiagnosticsItems, type RuntimeSupportStatus } from "./runtimeDiagnostics";

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
    description: "Adjust language, reading voice placeholders, and interface defaults."
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
  const [isListeningForVoiceCommand, setIsListeningForVoiceCommand] = useState(false);
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
  const paragraphRefs = useRef<Array<HTMLElement | null>>([]);
  const searchMatchRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const bookmarkButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const highlightOpenButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const readerPanelRef = useRef<HTMLDivElement | null>(null);
  const openFileButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const bookmarkNoteInputRef = useRef<HTMLInputElement | null>(null);
  const highlightNoteInputRef = useRef<HTMLInputElement | null>(null);
  const highlightSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const bookmarkSectionRef = useRef<HTMLElement | null>(null);
  const highlightSectionRef = useRef<HTMLElement | null>(null);
  const playbackRangeRef = useRef<PlaybackRange | null>(null);
  const playbackPositionRef = useRef<PlaybackPosition | null>(null);
  const playbackSessionRef = useRef(0);
  const playbackStateRef = useRef<PlaybackState>("idle");
  const playbackRateRef = useRef(props.playbackRate);
  const restartPausedParagraphRef = useRef(false);
  const shouldFocusSearchMatchRef = useRef(false);
  const headingId = useId();
  const summaryTitleId = useId();
  const statusId = useId();
  const positionStatusId = useId();
  const shortcutsHintId = useId();
  const documentRegionTitleId = useId();
  const documentRegionHintId = useId();
  const speedInputId = useId();
  const speedValueId = useId();
  const voiceCommandStatusId = useId();
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
  const activeSearchMatch =
    activeSearchMatchIndex >= 0 && activeSearchMatchIndex < searchMatches.length
      ? searchMatches[activeSearchMatchIndex]
      : null;
  const matchedParagraphCount = searchMatchesByParagraph.size;
  const searchStatusMessage =
    props.documentState.isLoading
      ? "Search will be available when the document finishes loading."
      : !hasText
        ? "Open a document to search inside it."
        : !activeSearchQuery
          ? "Enter text and press Search to look inside the current document."
          : searchMatches.length === 0
            ? `No matches found for "${activeSearchQuery}".`
            : activeSearchMatch
              ? `Match ${activeSearchMatchIndex + 1} of ${searchMatches.length} in paragraph ${activeSearchMatch.paragraphIndex + 1}. ${matchedParagraphCount} paragraph${matchedParagraphCount === 1 ? "" : "s"} contain ${matchedParagraphCount === 1 ? "this result" : "results"}.`
            : `${searchMatches.length} matches found for "${activeSearchQuery}".`;

  function focusParagraph(paragraphIndex: number) {
    readerPanelRef.current?.focus();
    paragraphRefs.current[paragraphIndex]?.focus();
  }

  function buildSearchResultAnnouncement(matchIndex: number, matches = searchMatches) {
    const nextMatch = matches[matchIndex];

    if (!nextMatch) {
      return "There are no search results to move through yet.";
    }

    return `Search result ${matchIndex + 1} of ${matches.length} in paragraph ${nextMatch.paragraphIndex + 1}. Reader text focused.`;
  }

  function buildBookmarkAnnouncement(bookmark: ParagraphBookmark, bookmarkIndex: number) {
    return `Bookmark ${bookmarkIndex + 1} of ${props.bookmarks.length} in paragraph ${bookmark.paragraphIndex + 1}. Reader text focused${bookmark.note ? ". Note loaded." : "."}`;
  }

  function buildHighlightAnnouncement(highlight: TextHighlight, highlightIndex: number) {
    return `Highlight ${highlightIndex + 1} of ${props.highlights.length} in paragraph ${highlight.paragraphIndex + 1}. Reader text focused${highlight.note ? ". Note loaded." : "."}`;
  }

  function stopVoiceCommandListening(message?: string) {
    const recognition = voiceRecognitionRef.current;

    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
      voiceRecognitionRef.current = null;
    }

    setIsListeningForVoiceCommand(false);

    if (message) {
      setVoiceCommandMessage(message);
    }
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
      stopVoiceCommandListening();
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

  function handleListenForVoiceCommand() {
    if (!voiceRecognitionAvailable) {
      setVoiceCommandMessage(voiceRecognitionAvailability.message);
      return;
    }

    if (isListeningForVoiceCommand) {
      stopVoiceCommandListening("Voice command listening stopped.");
      return;
    }

    const SpeechRecognitionConstructor = getVoiceRecognitionConstructor(window);

    if (!SpeechRecognitionConstructor) {
      setVoiceCommandMessage(voiceRecognitionAvailability.message);
      return;
    }

    const recognition = new SpeechRecognitionConstructor();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 5;
    recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
      const result = event.results[event.resultIndex];
      const transcript = result?.[0]?.transcript ?? "";
      const command = getVoiceReaderCommand(transcript);

      if (!command) {
        stopVoiceCommandListening(
          "Voice command was not recognized. Supported commands are open file, play, pause, stop, next paragraph, previous paragraph, repeat paragraph, faster, and slower."
        );
        return;
      }

      stopVoiceCommandListening();
      executeVoiceReaderCommand(command);
    };
    recognition.onerror = (event: BrowserSpeechRecognitionErrorEvent) => {
      stopVoiceCommandListening(
        event.error === "not-allowed"
          ? "Microphone permission was denied, so voice command mode could not start."
          : "Voice command listening failed on this device."
      );
    };
    recognition.onend = () => {
      voiceRecognitionRef.current = null;
      setIsListeningForVoiceCommand(false);
    };

    try {
      voiceRecognitionRef.current = recognition;
      setIsListeningForVoiceCommand(true);
      setVoiceCommandMessage(
        "Listening for one Reader command. Say open file, play, pause, stop, next paragraph, previous paragraph, repeat paragraph, faster, or slower."
      );
      recognition.start();
    } catch {
      voiceRecognitionRef.current = null;
      setIsListeningForVoiceCommand(false);
      setVoiceCommandMessage("Voice command listening could not start on this device.");
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

  function focusSearchInput() {
    if (!hasText || props.documentState.isLoading) {
      props.onAnnounce("Search is not ready until a document is loaded.");
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.select();
    props.onAnnounce("Reader search focused.");
  }

  function focusBookmarkTool() {
    if (!hasText || !props.documentState.filePath) {
      bookmarkSectionRef.current?.focus();
      props.onAnnounce("Bookmarks will be available after a document is loaded.");
      return;
    }

    const currentBookmarkIndex = props.bookmarks.findIndex(
      (bookmark) => bookmark.paragraphIndex === props.currentParagraphIndex
    );
    const targetButton =
      currentBookmarkIndex !== -1 ? bookmarkButtonRefs.current[currentBookmarkIndex] : null;

    if (targetButton) {
      targetButton.focus();
      props.onAnnounce(
        `Bookmarks focused. Current paragraph ${props.currentParagraphIndex + 1} already has a saved marker.`
      );
      return;
    }

    bookmarkNoteInputRef.current?.focus();
    bookmarkNoteInputRef.current?.select();
    props.onAnnounce(
      props.bookmarks.length > 0
        ? `Bookmarks focused. Add or update a note for paragraph ${props.currentParagraphIndex + 1}, or tab to saved markers.`
        : `Bookmarks focused. No saved markers yet. You can save a marker for paragraph ${props.currentParagraphIndex + 1}.`
    );
  }

  function focusHighlightTool() {
    if (!hasText || !props.documentState.filePath) {
      highlightSectionRef.current?.focus();
      props.onAnnounce("Highlights will be available after a document is loaded.");
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
        `Highlights focused. Paragraph ${props.highlights[currentHighlightIndex].paragraphIndex + 1} is ready for review.`
      );
      return;
    }

    if ((selectedTextRange || activeHighlightId) && highlightNoteInputRef.current && !highlightNoteInputRef.current.disabled) {
      highlightNoteInputRef.current.focus();
      highlightNoteInputRef.current.select();
      props.onAnnounce("Highlights focused. The highlight note field is ready.");
      return;
    }

    if (selectedTextRange && highlightSaveButtonRef.current && !highlightSaveButtonRef.current.disabled) {
      highlightSaveButtonRef.current.focus();
      props.onAnnounce(`Highlights focused. Selected text in paragraph ${selectedTextRange.paragraphIndex + 1} is ready to save.`);
      return;
    }

    highlightSectionRef.current?.focus();
    props.onAnnounce(
      props.highlights.length > 0
        ? "Highlights focused. Tab to review saved highlights."
        : "Highlights focused. Select text in the document to save a new highlight."
    );
  }

  function focusReaderTextRegion() {
    if (!hasText) {
      readerPanelRef.current?.focus();
      props.onAnnounce("Reader text will be available after a document is loaded.");
      return;
    }

    focusParagraph(props.currentParagraphIndex);
    props.onAnnounce(`Reader text focused at paragraph ${props.currentParagraphIndex + 1}.`);
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
      props.onAnnounce("Open a document to search inside it.");
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
      props.onAnnounce(`No matches found for ${nextQuery}.`);
      return;
    }

    const preferredMatchIndex = getNearestSearchMatchIndex(nextMatches, props.currentParagraphIndex);

    shouldFocusSearchMatchRef.current = true;
    setActiveSearchMatchIndex(preferredMatchIndex);
    props.onCurrentParagraphIndexChange(nextMatches[preferredMatchIndex].paragraphIndex);
    props.onAnnounce(
      `${nextMatches.length} search result${nextMatches.length === 1 ? "" : "s"} found. ${buildSearchResultAnnouncement(preferredMatchIndex, nextMatches)}`
    );
  }

  function handleSearchStep(direction: "previous" | "next") {
    if (searchMatches.length === 0) {
      props.onAnnounce("There are no search results to move through yet.");
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

  useEffect(() => {
    function handleReaderKeydown(event: KeyboardEvent) {
      const action = getReaderShortcutAction(event);

      if (!action) {
        return;
      }

      if (isInteractiveElement(event.target) && action !== "focusReaderText") {
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
        case "focusReaderText":
          focusReaderTextRegion();
          return;
      }
    }

    window.addEventListener("keydown", handleReaderKeydown);

    return () => {
      window.removeEventListener("keydown", handleReaderKeydown);
    };
  }, [
    activeHighlightId,
    handleAddBookmark,
    paragraphs.length,
    props.bookmarks,
    props.currentParagraphIndex,
    props.documentState.isLoading,
    props.documentState.text,
    props.highlights,
    props.onAnnounce,
    props.onCurrentParagraphIndexChange,
    props.documentState.filePath,
    searchMatches.length,
    selectedTextRange
  ]);

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
  const bookmarkNoteStatus =
    currentBookmark?.note
      ? "This bookmarked paragraph already has a saved note."
      : currentBookmark
        ? "This paragraph is bookmarked. Add a short note or leave it blank."
        : "Saving a marker here can include a short optional note.";
  const highlightStatusText = !hasText
    ? "Open a document to add a highlight."
    : selectedTextRange
      ? `Selected text in paragraph ${selectedTextRange.paragraphIndex + 1}: ${selectedTextRange.selectedText}`
      : activeHighlight
        ? `Selected saved highlight in paragraph ${activeHighlight.paragraphIndex + 1}: ${activeHighlight.selectedText}`
        : "Select a word or short phrase in the Reader text, then save it as a highlight.";
  const selectedParagraphIndex = selectedTextRange?.paragraphIndex ?? null;

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
      setBookmarkMessage("Open a document before saving a bookmark.");
      props.onAnnounce("Open a document before saving a marker.");
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
        ? `Jumped to bookmarked paragraph ${bookmark.paragraphIndex + 1}. Note loaded for review.`
        : `Jumped to bookmarked paragraph ${bookmark.paragraphIndex + 1}.`
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
        ? `Jumped to highlight in paragraph ${highlight.paragraphIndex + 1}. Note loaded for editing.`
        : `Jumped to highlight in paragraph ${highlight.paragraphIndex + 1}.`
    );
    const resolvedHighlightIndex =
      highlightIndex ?? props.highlights.findIndex((savedHighlight) => savedHighlight.id === highlight.id);
    props.onAnnounce(
      resolvedHighlightIndex === -1
        ? `Jumped to highlight in paragraph ${highlight.paragraphIndex + 1}. Reader text focused${highlight.note ? ". Note loaded." : "."}`
        : buildHighlightAnnouncement(highlight, resolvedHighlightIndex)
    );
  }

  return (
    <section className="reader-workspace" aria-labelledby={headingId}>
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

        <div className="reader-utility-area" aria-label="Reader tools">
          <section className="reader-playback-bar" aria-labelledby={shortcutsHintId}>
            <div className="reader-tool-header">
              <div>
                <p className="reader-toolbar-label">Playback</p>
                <h3>Reading controls</h3>
              </div>
            </div>
            <div className="playback-row" role="group" aria-label="Primary playback actions">
              <div className="playback-group playback-group-primary">
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
                <button
                  type="button"
                  onClick={handleListenForVoiceCommand}
                  aria-pressed={isListeningForVoiceCommand}
                  aria-describedby={voiceCommandStatusId}
                >
                  {isListeningForVoiceCommand ? "Stop listening" : "Listen for command"}
                </button>
                <p id={voiceCommandStatusId} className="hint">
                  {voiceCommandMessage || voiceRecognitionAvailability.message}
                </p>
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
              <div id={shortcutsHintId} className="reader-shortcuts-compact">
                <p className="hint reader-shortcuts-note">
                  Keyboard: `Space` play or pause, `J` and `K` move by paragraph, `Ctrl+F` opens search, `Ctrl+Shift+B`
                  opens bookmarks, `Ctrl+Shift+H` opens highlights, and `Escape` returns to the document.
                </p>
                <details className="reader-shortcuts-details">
                  <summary id={shortcutsReferenceId} className="reader-shortcuts-summary">
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
                      focus to the document text.
                    </p>
                    <p className="hint reader-shortcuts-note">
                      Full shortcut reference also stays available in `Settings`.
                    </p>
                  </div>
                </details>
              </div>
              <p className="hint reader-shortcuts-note">
                Voice commands are optional and listen only after you press `Listen for command`. They use exact English
                phrases and never replace keyboard shortcuts.
              </p>
            </div>
          </section>

          <div className="reader-secondary-tools">
            <section className="reader-search-panel" aria-labelledby={searchLabelId}>
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
                    type="search"
                    value={searchInputValue}
                    onChange={(event) => setSearchInputValue(event.target.value)}
                    placeholder="Find text in this file"
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
              <p className="hint">Press `Escape` from the search field to return to the document text.</p>
            </section>

            <section
              ref={highlightSectionRef}
              className="reader-highlights"
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
                  type="text"
                  value={highlightNoteInputValue}
                  onChange={(event) => setHighlightNoteInputValue(event.target.value)}
                  maxLength={MAX_HIGHLIGHT_NOTE_LENGTH}
                  placeholder="Optional note"
                  disabled={!hasText || (!selectedTextRange && !activeHighlight)}
                  aria-describedby={highlightNoteHintId}
                />
              </label>
              <p id={highlightNoteHintId} className="hint">
                Keep highlight notes short. Select text to save a new highlight, or load a saved one to edit its note.
                Press `Escape` here to return to the document text.
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
              className="reader-bookmarks"
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
                <p className="hint">Current paragraph preview: {currentParagraphPreview}</p>
              ) : null}
              <label className="field bookmark-note-field" htmlFor={bookmarkNoteInputId}>
                <span>Short note for this bookmarked paragraph</span>
                <input
                  ref={bookmarkNoteInputRef}
                  id={bookmarkNoteInputId}
                  type="text"
                  value={bookmarkNoteInputValue}
                  onChange={(event) => setBookmarkNoteInputValue(event.target.value)}
                  maxLength={MAX_BOOKMARK_NOTE_LENGTH}
                  placeholder="Optional study note"
                  disabled={!hasText || !props.documentState.filePath}
                  aria-describedby={bookmarkNoteHintId}
                />
              </label>
              <p id={bookmarkNoteHintId} className="hint">
                {bookmarkNoteStatus} Keep it short. Clear the field and save again to remove the note. Press `Escape`
                here to return to the document text.
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
        </div>
      </div>

      <section
        ref={readerPanelRef}
        className="reader-panel reader-panel-expanded"
        tabIndex={-1}
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
                aria-current={index === props.currentParagraphIndex ? "true" : undefined}
                aria-label={`Paragraph ${index + 1}`}
              >
                <span className="reader-paragraph-meta">Paragraph {index + 1}</span>
                <p className="reader-paragraph-body" data-reader-paragraph-body="true" data-paragraph-index={index}>
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
            <p className="reader-empty-eyebrow">Ready to read</p>
            <p className="empty-state">Open a readable `.txt` or `.pdf` document to begin.</p>
            <p className="hint">Use `Open file` above or press `Ctrl+O`.</p>
            <p className="hint reader-empty-shortcuts">
              Reader shortcuts center on a small map: `Space`, `S`, `J`, `K`, `R`, `Ctrl+F`, `Ctrl+Shift+B`,
              `Ctrl+Shift+H`, `F3`, `M`, `B`, `H`, `Escape`, and `Alt+Up` or `Alt+Down`.
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
  const languageId = useId();
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
            <p>Small display adjustments keep the layout calm while making text easier to read.</p>
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

            <label className="field" htmlFor={interfaceTextScaleId}>
              <span>App text size</span>
              <select
                id={interfaceTextScaleId}
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
                value={props.contrastMode}
                onChange={(event) => props.onContrastModeChange(parseContrastMode(event.target.value))}
                aria-describedby={displayHintId}
              >
                <option value="default">Calm contrast</option>
                <option value="strong">Stronger contrast</option>
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
          <p id={displayHintId} className="hint">
            These display changes only adjust size and contrast. Keyboard shortcuts, focus order, playback, and screen-reader labels stay the same.
          </p>
          <p id={voiceSummaryId} className="status-message compact-status" role="status" aria-live="polite" aria-atomic="true">
            {voiceSummary}
          </p>
          <p id={voiceModeHintId} className="hint">
            Automatic mode prefers an Arabic-capable voice for Arabic script and keeps the default voice for other text.
          </p>
        </section>

        <section className="panel-section" aria-labelledby="settings-readiness-title">
          <div className="panel-section-header">
            <p className="panel-kicker">Readiness</p>
            <h3 id="settings-readiness-title">Setup diagnostics</h3>
            <p>Review what works now, what needs optional setup, and what is not available on this device yet.</p>
          </div>
          <p className="status-message compact-status" role="status" aria-live="polite" aria-atomic="true">
            {props.runtimeSupportStatus?.message ?? "Checking what is ready on this device."}
          </p>
          <ul className="simple-list voice-diagnostics-list" aria-label="Runtime readiness diagnostics">
            {runtimeDiagnostics.map((item) => (
              <li key={item.id} className="voice-diagnostics-item">
                <span className="voice-diagnostics-name">
                  {item.label}: {item.statusLabel}
                </span>
                <span className="voice-diagnostics-meta">{item.detail}</span>
              </li>
            ))}
          </ul>
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

        <section className="panel-section" aria-labelledby="settings-shortcuts-title">
          <div className="panel-section-header">
            <p className="panel-kicker">Keyboard</p>
            <h3 id="settings-shortcuts-title">Shortcut reference</h3>
            <p>The Reader uses one small command map so file opening, reading, search, and saved markers stay easy to remember.</p>
          </div>
          {groupedAppShortcuts.map((shortcutGroup) => (
            <div key={shortcutGroup.groupLabel} className="settings-shortcut-group">
              <p className="settings-shortcut-group-label">{shortcutGroup.groupLabel}</p>
              <ul className="simple-list" aria-label={`${shortcutGroup.groupLabel} shortcuts`}>
                {shortcutGroup.shortcuts.map((shortcut) => (
                  <li key={shortcut.action}>
                    <strong>{shortcut.keys}</strong>: {shortcut.description}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {groupedReaderShortcuts.map((shortcutGroup) => (
            <div key={shortcutGroup.groupLabel} className="settings-shortcut-group">
              <p className="settings-shortcut-group-label">{shortcutGroup.groupLabel}</p>
              <ul className="simple-list" aria-label={`${shortcutGroup.groupLabel} shortcuts`}>
                {shortcutGroup.shortcuts.map((shortcut) => (
                  <li key={shortcut.action}>
                    <strong>{shortcut.keys}</strong>: {shortcut.description}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="hint">
            Reader shortcuts stay inactive while you are typing in search, bookmark notes, highlight notes, sliders, or
            other form controls. `Escape` is the one exception and returns focus to the document text.
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
