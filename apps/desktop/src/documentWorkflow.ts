import type { SpeechVoicePreference } from "./speechVoices.js";

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

export type ReaderPersistenceState = {
  recentDocuments: RecentDocument[];
  readingSpeed: number;
  speechVoicePreference: SpeechVoicePreference;
  lastOpenedDocumentPath: string | null;
  lastOpenedParagraphIndex: number;
};

export type DocumentLoadOrigin = "startupRestore" | "filePicker" | "recentDocument";

const READER_PERSISTENCE_KEY = "phronon.reader.persistence";
const DEFAULT_READING_SPEED = 1;
const MIN_READING_SPEED = 0.5;
const MAX_READING_SPEED = 2;

export const emptyReaderDocumentState: ReaderDocumentState = {
  filePath: null,
  text: null,
  fileType: null,
  error: null,
  isLoading: false
};

export const defaultReaderPersistenceState: ReaderPersistenceState = {
  recentDocuments: [],
  readingSpeed: DEFAULT_READING_SPEED,
  speechVoicePreference: "automatic",
  lastOpenedDocumentPath: null,
  lastOpenedParagraphIndex: 0
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

export function buildDocumentLoadStatusMessage(options: {
  origin: DocumentLoadOrigin;
  filePath?: string | null;
}) {
  if (options.origin === "startupRestore") {
    return options.filePath
      ? `Restoring your last document: ${getDocumentFileName(options.filePath)}.`
      : "Restoring your last document.";
  }

  if (options.origin === "recentDocument") {
    return options.filePath
      ? `Opening recent document: ${getDocumentFileName(options.filePath)}.`
      : "Opening a recent document.";
  }

  return "Waiting for you to choose a document to open.";
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

export function parseReaderPersistenceState(rawValue: string | null): ReaderPersistenceState {
  if (!rawValue) {
    return defaultReaderPersistenceState;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ReaderPersistenceState>;
    const recentDocuments = Array.isArray(parsed.recentDocuments)
      ? parsed.recentDocuments.filter(isRecentDocument).slice(0, 8)
      : [];

    return {
      recentDocuments,
      readingSpeed: clampReadingSpeed(
        typeof parsed.readingSpeed === "number" ? parsed.readingSpeed : DEFAULT_READING_SPEED
      ),
      speechVoicePreference:
        parsed.speechVoicePreference === "default" ? "default" : "automatic",
      lastOpenedDocumentPath:
        typeof parsed.lastOpenedDocumentPath === "string" && parsed.lastOpenedDocumentPath.trim().length > 0
          ? parsed.lastOpenedDocumentPath
          : null,
      lastOpenedParagraphIndex: clampParagraphIndex(
        typeof parsed.lastOpenedParagraphIndex === "number" ? parsed.lastOpenedParagraphIndex : 0
      )
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
