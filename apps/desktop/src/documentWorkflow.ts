import type { SpeechVoicePreference } from "./speechVoices.js";

export type InterfaceTextScale = "default" | "large" | "largest";
export type ReaderTextScale = "default" | "large" | "largest";
export type ContrastMode = "default" | "strong";

export type ReaderDocumentState = {
  filePath: string | null;
  text: string | null;
  fileType: "txt" | "pdf" | null;
  error: string | null;
  isLoading: boolean;
};

export type RecentDocument = {
  fileName: string;
  filePath: string;
  fileType: "txt" | "pdf";
  lastOpenedAt: number;
};

export type ParagraphBookmark = {
  documentPath: string;
  paragraphIndex: number;
  previewText: string;
  note: string;
  createdAt: number;
};

export type TextHighlight = {
  id: string;
  documentPath: string;
  paragraphIndex: number;
  selectedText: string;
  previewText: string;
  startOffset: number;
  endOffset: number;
  note: string;
  createdAt: number;
};

export type ReaderPersistenceState = {
  recentDocuments: RecentDocument[];
  bookmarksByDocument: Record<string, ParagraphBookmark[]>;
  highlightsByDocument: Record<string, TextHighlight[]>;
  readingSpeed: number;
  interfaceTextScale: InterfaceTextScale;
  readerTextScale: ReaderTextScale;
  contrastMode: ContrastMode;
  speechVoicePreference: SpeechVoicePreference;
  preferredVoiceId: string | null;
  lastOpenedDocumentPath: string | null;
  lastOpenedParagraphIndex: number;
  hasSeenOnboarding: boolean;
};

export type DocumentLoadOrigin = "startupRestore" | "filePicker" | "recentDocument";

const READER_PERSISTENCE_KEY = "phronon.reader.persistence";
const DEFAULT_READING_SPEED = 1;
const MIN_READING_SPEED = 0.5;
const MAX_READING_SPEED = 2;
export const MAX_BOOKMARK_NOTE_LENGTH = 160;
export const MAX_HIGHLIGHT_NOTE_LENGTH = 160;
export const MAX_HIGHLIGHT_SELECTION_LENGTH = 240;

export const emptyReaderDocumentState: ReaderDocumentState = {
  filePath: null,
  text: null,
  fileType: null,
  error: null,
  isLoading: false
};

export const defaultReaderPersistenceState: ReaderPersistenceState = {
  recentDocuments: [],
  bookmarksByDocument: {},
  highlightsByDocument: {},
  readingSpeed: DEFAULT_READING_SPEED,
  interfaceTextScale: "default",
  readerTextScale: "default",
  contrastMode: "default",
  speechVoicePreference: "automatic",
  preferredVoiceId: null,
  lastOpenedDocumentPath: null,
  lastOpenedParagraphIndex: 0,
  hasSeenOnboarding: false
};

export function getDocumentFileName(filePath: string) {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

export function clampParagraphIndex(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export function clampReadingSpeed(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_READING_SPEED;
  }

  const roundedValue = Math.round(value * 10) / 10;
  return Math.min(MAX_READING_SPEED, Math.max(MIN_READING_SPEED, roundedValue));
}

export function parseInterfaceTextScale(value: unknown): InterfaceTextScale {
  return value === "large" || value === "largest" ? value : "default";
}

export function parseReaderTextScale(value: unknown): ReaderTextScale {
  return value === "large" || value === "largest" ? value : "default";
}

export function parseContrastMode(value: unknown): ContrastMode {
  return value === "strong" ? "strong" : "default";
}

export function createLoadedDocumentState(result: {
  filePath: string;
  text: string;
  fileType: "txt" | "pdf";
}): ReaderDocumentState {
  return {
    filePath: result.filePath,
    text: result.text,
    fileType: result.fileType,
    error: null,
    isLoading: false
  };
}

export function buildDocumentOpenFailureMessage(options: {
  attemptedFilePath?: string;
  currentFilePath?: string | null;
  reason?: string;
}) {
  const attemptedFileName = options.attemptedFilePath
    ? getDocumentFileName(options.attemptedFilePath)
    : "the selected document";
  const currentFileName = options.currentFilePath ? getDocumentFileName(options.currentFilePath) : null;
  const reason = options.reason?.trim() || "Phronon could not open that document.";
  const currentDocumentMessage = currentFileName
    ? ` ${currentFileName} is still open.`
    : " No document was replaced.";

  return `${attemptedFileName} did not open. ${reason}${currentDocumentMessage}`;
}

export function buildReaderDocumentStatusMessage(options: {
  isLoading?: boolean;
  loadingStatusMessage?: string | null;
  error?: string | null;
  filePath?: string | null;
  fileType?: "txt" | "pdf" | null;
  currentParagraphIndex: number;
  paragraphCount: number;
}) {
  if (options.isLoading && options.loadingStatusMessage?.trim()) {
    return options.loadingStatusMessage.trim();
  }

  if (options.error?.trim()) {
    return options.error.trim();
  }

  if (!options.filePath) {
    return "No document loaded. Paragraph 0 of 0.";
  }

  const fileName = getDocumentFileName(options.filePath);
  const fileTypeLabel = options.fileType === "pdf" ? "PDF" : "text";
  const safeParagraphCount = Math.max(0, options.paragraphCount);
  const safeParagraphIndex =
    safeParagraphCount > 0
      ? Math.min(clampParagraphIndex(options.currentParagraphIndex) + 1, safeParagraphCount)
      : 0;

  return `Loaded ${fileTypeLabel} file: ${fileName}. Paragraph ${safeParagraphIndex} of ${safeParagraphCount}.`;
}

export function buildRecentDocumentButtonLabel(document: RecentDocument) {
  return `Open recent ${document.fileType.toUpperCase()} document ${document.fileName}`;
}

export function buildBookmarkPreviewText(paragraphText: string, maxLength = 96) {
  const normalizedText = paragraphText.replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return "Empty paragraph";
  }

  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function normalizeHighlightSelectionText(selectionText: string, maxLength = MAX_HIGHLIGHT_SELECTION_LENGTH) {
  const normalizedText = selectionText.replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return "";
  }

  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return normalizedText.slice(0, maxLength).trimEnd();
}

export function normalizeBookmarkNote(noteText: string, maxLength = MAX_BOOKMARK_NOTE_LENGTH) {
  const normalizedText = noteText.replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return "";
  }

  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return normalizedText.slice(0, maxLength).trimEnd();
}

export function normalizeHighlightNote(noteText: string) {
  return normalizeBookmarkNote(noteText, MAX_HIGHLIGHT_NOTE_LENGTH);
}

function clampTextOffset(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function buildTextHighlightId(options: {
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  selectedText: string;
}) {
  const safeText = options.selectedText.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return `p${options.paragraphIndex}-s${options.startOffset}-e${options.endOffset}-${safeText || "highlight"}`;
}

export function createParagraphBookmark(options: {
  documentPath: string;
  paragraphIndex: number;
  paragraphText: string;
  noteText?: string;
  now?: number;
}): ParagraphBookmark {
  return {
    documentPath: options.documentPath,
    paragraphIndex: clampParagraphIndex(options.paragraphIndex),
    previewText: buildBookmarkPreviewText(options.paragraphText),
    note: normalizeBookmarkNote(options.noteText ?? ""),
    createdAt: options.now ?? Date.now()
  };
}

export function createTextHighlight(options: {
  documentPath: string;
  paragraphIndex: number;
  paragraphText: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  noteText?: string;
  now?: number;
}): TextHighlight {
  const safeParagraphIndex = clampParagraphIndex(options.paragraphIndex);
  const paragraphLength = options.paragraphText.length;
  const safeStartOffset = Math.min(clampTextOffset(options.startOffset), paragraphLength);
  const safeEndOffset = Math.min(Math.max(clampTextOffset(options.endOffset), safeStartOffset), paragraphLength);
  const normalizedSelection = normalizeHighlightSelectionText(options.selectedText);
  const selectedText =
    normalizedSelection ||
    normalizeHighlightSelectionText(options.paragraphText.slice(safeStartOffset, safeEndOffset));

  return {
    id: buildTextHighlightId({
      paragraphIndex: safeParagraphIndex,
      startOffset: safeStartOffset,
      endOffset: safeEndOffset,
      selectedText
    }),
    documentPath: options.documentPath,
    paragraphIndex: safeParagraphIndex,
    selectedText,
    previewText: buildBookmarkPreviewText(selectedText, 72),
    startOffset: safeStartOffset,
    endOffset: safeEndOffset,
    note: normalizeHighlightNote(options.noteText ?? ""),
    createdAt: options.now ?? Date.now()
  };
}

export function upsertParagraphBookmark(
  bookmarks: ParagraphBookmark[],
  nextBookmark: ParagraphBookmark
) {
  const otherBookmarks = bookmarks.filter(
    (bookmark) =>
      !(bookmark.documentPath === nextBookmark.documentPath && bookmark.paragraphIndex === nextBookmark.paragraphIndex)
  );

  return [nextBookmark, ...otherBookmarks]
    .sort((left, right) => left.paragraphIndex - right.paragraphIndex)
    .slice(0, 100);
}

export function upsertTextHighlight(highlights: TextHighlight[], nextHighlight: TextHighlight) {
  const otherHighlights = highlights.filter((highlight) => highlight.id !== nextHighlight.id);

  return [nextHighlight, ...otherHighlights]
    .sort((left, right) => {
      if (left.paragraphIndex !== right.paragraphIndex) {
        return left.paragraphIndex - right.paragraphIndex;
      }

      if (left.startOffset !== right.startOffset) {
        return left.startOffset - right.startOffset;
      }

      return left.endOffset - right.endOffset;
    })
    .slice(0, 200);
}

export function removeTextHighlight(highlights: TextHighlight[], highlightId: string) {
  return highlights.filter((highlight) => highlight.id !== highlightId);
}

export function getBookmarksForDocument(
  bookmarksByDocument: Record<string, ParagraphBookmark[]>,
  documentPath: string | null | undefined
) {
  if (!documentPath) {
    return [];
  }

  return bookmarksByDocument[documentPath] ?? [];
}

export function getHighlightsForDocument(
  highlightsByDocument: Record<string, TextHighlight[]>,
  documentPath: string | null | undefined
) {
  if (!documentPath) {
    return [];
  }

  return highlightsByDocument[documentPath] ?? [];
}

export function buildDocumentLoadStatusMessage(options: {
  origin: DocumentLoadOrigin;
  filePath?: string | null;
}) {
  const isPdf = options.filePath?.toLowerCase().endsWith(".pdf") ?? false;
  const pdfOcrNote = " If it is a scanned PDF, Phronon may use optional local OCR, so opening can take a little longer.";

  if (options.origin === "startupRestore") {
    return options.filePath
      ? `Restoring your last document: ${getDocumentFileName(options.filePath)}.${isPdf ? pdfOcrNote : ""}`
      : "Restoring your last document.";
  }

  if (options.origin === "recentDocument") {
    return options.filePath
      ? `Opening recent document: ${getDocumentFileName(options.filePath)}.${isPdf ? pdfOcrNote : ""}`
      : "Opening a recent document.";
  }

  return "Waiting for you to choose a document to open. Scanned PDFs can take a little longer because Phronon may need local OCR.";
}

export function upsertRecentDocument(
  recentDocuments: RecentDocument[],
  documentState: {
    filePath: string;
    fileType: "txt" | "pdf";
  },
  now = Date.now()
) {
  const nextDocument: RecentDocument = {
    fileName: getDocumentFileName(documentState.filePath),
    filePath: documentState.filePath,
    fileType: documentState.fileType,
    lastOpenedAt: now
  };

  const otherDocuments = recentDocuments.filter((entry) => entry.filePath !== documentState.filePath);
  return [nextDocument, ...otherDocuments].slice(0, 8);
}

function isRecentDocument(value: unknown): value is RecentDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RecentDocument>;
  return (
    typeof candidate.fileName === "string" &&
    typeof candidate.filePath === "string" &&
    (candidate.fileType === "txt" || candidate.fileType === "pdf") &&
    typeof candidate.lastOpenedAt === "number" &&
    Number.isFinite(candidate.lastOpenedAt)
  );
}

function isParagraphBookmark(value: unknown): value is ParagraphBookmark {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ParagraphBookmark>;
  return (
    typeof candidate.documentPath === "string" &&
    typeof candidate.previewText === "string" &&
    (candidate.note === undefined || typeof candidate.note === "string") &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt) &&
    typeof candidate.paragraphIndex === "number" &&
    Number.isFinite(candidate.paragraphIndex)
  );
}

function isTextHighlight(value: unknown): value is TextHighlight {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TextHighlight>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.documentPath === "string" &&
    typeof candidate.selectedText === "string" &&
    typeof candidate.previewText === "string" &&
    typeof candidate.note === "string" &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt) &&
    typeof candidate.paragraphIndex === "number" &&
    Number.isFinite(candidate.paragraphIndex) &&
    typeof candidate.startOffset === "number" &&
    Number.isFinite(candidate.startOffset) &&
    typeof candidate.endOffset === "number" &&
    Number.isFinite(candidate.endOffset)
  );
}

export function parseReaderPersistenceState(rawValue: string | null): ReaderPersistenceState {
  if (!rawValue) {
    return defaultReaderPersistenceState;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ReaderPersistenceState> & {
      preferredVoiceURI?: string;
    };
    const recentDocuments = Array.isArray(parsed.recentDocuments)
      ? parsed.recentDocuments.filter(isRecentDocument).slice(0, 8)
      : [];
    const bookmarksByDocument =
      parsed.bookmarksByDocument && typeof parsed.bookmarksByDocument === "object"
        ? Object.fromEntries(
            Object.entries(parsed.bookmarksByDocument)
              .filter(([documentPath]) => typeof documentPath === "string" && documentPath.trim().length > 0)
              .map(([documentPath, bookmarks]) => [
                documentPath,
                Array.isArray(bookmarks)
                  ? bookmarks
                      .filter(isParagraphBookmark)
                      .map((bookmark) => ({
                        ...bookmark,
                        note: normalizeBookmarkNote(bookmark.note ?? ""),
                        paragraphIndex: clampParagraphIndex(bookmark.paragraphIndex)
                      }))
                      .sort((left, right) => left.paragraphIndex - right.paragraphIndex)
                      .slice(0, 100)
                  : []
              ])
          )
        : {};
    const highlightsByDocument =
      parsed.highlightsByDocument && typeof parsed.highlightsByDocument === "object"
        ? Object.fromEntries(
            Object.entries(parsed.highlightsByDocument)
              .filter(([documentPath]) => typeof documentPath === "string" && documentPath.trim().length > 0)
              .map(([documentPath, highlights]) => [
                documentPath,
                Array.isArray(highlights)
                  ? highlights
                      .filter(isTextHighlight)
                      .map((highlight) => {
                        const paragraphIndex = clampParagraphIndex(highlight.paragraphIndex);
                        const startOffset = clampTextOffset(highlight.startOffset);
                        const endOffset = Math.max(clampTextOffset(highlight.endOffset), startOffset);
                        const selectedText = normalizeHighlightSelectionText(highlight.selectedText);

                        return {
                          ...highlight,
                          id:
                            highlight.id.trim().length > 0
                              ? highlight.id
                              : buildTextHighlightId({
                                  paragraphIndex,
                                  startOffset,
                                  endOffset,
                                  selectedText
                                }),
                          paragraphIndex,
                          selectedText,
                          previewText: buildBookmarkPreviewText(
                            highlight.previewText.trim().length > 0 ? highlight.previewText : selectedText,
                            72
                          ),
                          startOffset,
                          endOffset,
                          note: normalizeHighlightNote(highlight.note)
                        };
                      })
                      .sort((left, right) => {
                        if (left.paragraphIndex !== right.paragraphIndex) {
                          return left.paragraphIndex - right.paragraphIndex;
                        }

                        if (left.startOffset !== right.startOffset) {
                          return left.startOffset - right.startOffset;
                        }

                        return left.endOffset - right.endOffset;
                      })
                      .slice(0, 200)
                  : []
              ])
          )
        : {};

    return {
      recentDocuments,
      bookmarksByDocument,
      highlightsByDocument,
      readingSpeed: clampReadingSpeed(
        typeof parsed.readingSpeed === "number" ? parsed.readingSpeed : DEFAULT_READING_SPEED
      ),
      interfaceTextScale: parseInterfaceTextScale(parsed.interfaceTextScale),
      readerTextScale: parseReaderTextScale(parsed.readerTextScale),
      contrastMode: parseContrastMode(parsed.contrastMode),
      speechVoicePreference:
        parsed.speechVoicePreference === "default"
          ? "default"
          : parsed.speechVoicePreference === "manual"
            ? "manual"
            : "automatic",
      preferredVoiceId:
        typeof parsed.preferredVoiceId === "string" && parsed.preferredVoiceId.trim().length > 0
          ? parsed.preferredVoiceId
          : typeof parsed.preferredVoiceURI === "string" && parsed.preferredVoiceURI.trim().length > 0
            ? parsed.preferredVoiceURI
          : null,
      lastOpenedDocumentPath:
        typeof parsed.lastOpenedDocumentPath === "string" && parsed.lastOpenedDocumentPath.trim().length > 0
          ? parsed.lastOpenedDocumentPath
          : null,
      lastOpenedParagraphIndex: clampParagraphIndex(
        typeof parsed.lastOpenedParagraphIndex === "number" ? parsed.lastOpenedParagraphIndex : 0
      ),
      hasSeenOnboarding: parsed.hasSeenOnboarding === true
    };
  } catch {
    return defaultReaderPersistenceState;
  }
}

export function readReaderPersistenceState(storage: Pick<Storage, "getItem"> | undefined) {
  if (!storage) {
    return defaultReaderPersistenceState;
  }

  try {
    return parseReaderPersistenceState(storage.getItem(READER_PERSISTENCE_KEY));
  } catch {
    return defaultReaderPersistenceState;
  }
}

export function writeReaderPersistenceState(
  storage: Pick<Storage, "setItem"> | undefined,
  state: ReaderPersistenceState
) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(READER_PERSISTENCE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures so document loading stays usable.
  }
}
