const READER_PERSISTENCE_KEY = "phronon.reader.persistence";
const DEFAULT_READING_SPEED = 1;
const MIN_READING_SPEED = 0.5;
const MAX_READING_SPEED = 2;
export const emptyReaderDocumentState = {
    filePath: null,
    text: null,
    fileType: null,
    error: null,
    isLoading: false
};
export const defaultReaderPersistenceState = {
    recentDocuments: [],
    bookmarksByDocument: {},
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
export function getDocumentFileName(filePath) {
    const parts = filePath.split(/[\\/]/);
    return parts[parts.length - 1] || filePath;
}
export function clampParagraphIndex(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.floor(value));
}
export function clampReadingSpeed(value) {
    if (!Number.isFinite(value)) {
        return DEFAULT_READING_SPEED;
    }
    const roundedValue = Math.round(value * 10) / 10;
    return Math.min(MAX_READING_SPEED, Math.max(MIN_READING_SPEED, roundedValue));
}
export function parseInterfaceTextScale(value) {
    return value === "large" || value === "largest" ? value : "default";
}
export function parseReaderTextScale(value) {
    return value === "large" || value === "largest" ? value : "default";
}
export function parseContrastMode(value) {
    return value === "strong" ? "strong" : "default";
}
export function createLoadedDocumentState(result) {
    return {
        filePath: result.filePath,
        text: result.text,
        fileType: result.fileType,
        error: null,
        isLoading: false
    };
}
export function buildDocumentOpenFailureMessage(options) {
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
export function buildReaderDocumentStatusMessage(options) {
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
    const safeParagraphIndex = safeParagraphCount > 0
        ? Math.min(clampParagraphIndex(options.currentParagraphIndex) + 1, safeParagraphCount)
        : 0;
    return `Loaded ${fileTypeLabel} file: ${fileName}. Paragraph ${safeParagraphIndex} of ${safeParagraphCount}.`;
}
export function buildRecentDocumentButtonLabel(document) {
    return `Open recent ${document.fileType.toUpperCase()} document ${document.fileName}`;
}
export function buildBookmarkPreviewText(paragraphText, maxLength = 96) {
    const normalizedText = paragraphText.replace(/\s+/g, " ").trim();
    if (!normalizedText) {
        return "Empty paragraph";
    }
    if (normalizedText.length <= maxLength) {
        return normalizedText;
    }
    return `${normalizedText.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
export function createParagraphBookmark(options) {
    return {
        documentPath: options.documentPath,
        paragraphIndex: clampParagraphIndex(options.paragraphIndex),
        previewText: buildBookmarkPreviewText(options.paragraphText),
        createdAt: options.now ?? Date.now()
    };
}
export function upsertParagraphBookmark(bookmarks, nextBookmark) {
    const otherBookmarks = bookmarks.filter((bookmark) => !(bookmark.documentPath === nextBookmark.documentPath && bookmark.paragraphIndex === nextBookmark.paragraphIndex));
    return [nextBookmark, ...otherBookmarks]
        .sort((left, right) => left.paragraphIndex - right.paragraphIndex)
        .slice(0, 100);
}
export function getBookmarksForDocument(bookmarksByDocument, documentPath) {
    if (!documentPath) {
        return [];
    }
    return bookmarksByDocument[documentPath] ?? [];
}
export function buildDocumentLoadStatusMessage(options) {
    const isPdf = options.filePath?.toLowerCase().endsWith(".pdf") ?? false;
    const pdfOcrNote = " If it is scanned, Phronon may need local OCR and this can take a little longer.";
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
export function upsertRecentDocument(recentDocuments, documentState, now = Date.now()) {
    const nextDocument = {
        fileName: getDocumentFileName(documentState.filePath),
        filePath: documentState.filePath,
        fileType: documentState.fileType,
        lastOpenedAt: now
    };
    const otherDocuments = recentDocuments.filter((entry) => entry.filePath !== documentState.filePath);
    return [nextDocument, ...otherDocuments].slice(0, 8);
}
function isRecentDocument(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return (typeof candidate.fileName === "string" &&
        typeof candidate.filePath === "string" &&
        (candidate.fileType === "txt" || candidate.fileType === "pdf") &&
        typeof candidate.lastOpenedAt === "number" &&
        Number.isFinite(candidate.lastOpenedAt));
}
function isParagraphBookmark(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return (typeof candidate.documentPath === "string" &&
        typeof candidate.previewText === "string" &&
        typeof candidate.createdAt === "number" &&
        Number.isFinite(candidate.createdAt) &&
        typeof candidate.paragraphIndex === "number" &&
        Number.isFinite(candidate.paragraphIndex));
}
export function parseReaderPersistenceState(rawValue) {
    if (!rawValue) {
        return defaultReaderPersistenceState;
    }
    try {
        const parsed = JSON.parse(rawValue);
        const recentDocuments = Array.isArray(parsed.recentDocuments)
            ? parsed.recentDocuments.filter(isRecentDocument).slice(0, 8)
            : [];
        const bookmarksByDocument = parsed.bookmarksByDocument && typeof parsed.bookmarksByDocument === "object"
            ? Object.fromEntries(Object.entries(parsed.bookmarksByDocument)
                .filter(([documentPath]) => typeof documentPath === "string" && documentPath.trim().length > 0)
                .map(([documentPath, bookmarks]) => [
                documentPath,
                Array.isArray(bookmarks)
                    ? bookmarks
                        .filter(isParagraphBookmark)
                        .map((bookmark) => ({
                        ...bookmark,
                        paragraphIndex: clampParagraphIndex(bookmark.paragraphIndex)
                    }))
                        .sort((left, right) => left.paragraphIndex - right.paragraphIndex)
                        .slice(0, 100)
                    : []
            ]))
            : {};
        return {
            recentDocuments,
            bookmarksByDocument,
            readingSpeed: clampReadingSpeed(typeof parsed.readingSpeed === "number" ? parsed.readingSpeed : DEFAULT_READING_SPEED),
            interfaceTextScale: parseInterfaceTextScale(parsed.interfaceTextScale),
            readerTextScale: parseReaderTextScale(parsed.readerTextScale),
            contrastMode: parseContrastMode(parsed.contrastMode),
            speechVoicePreference: parsed.speechVoicePreference === "default"
                ? "default"
                : parsed.speechVoicePreference === "manual"
                    ? "manual"
                    : "automatic",
            preferredVoiceId: typeof parsed.preferredVoiceId === "string" && parsed.preferredVoiceId.trim().length > 0
                ? parsed.preferredVoiceId
                : typeof parsed.preferredVoiceURI === "string" && parsed.preferredVoiceURI.trim().length > 0
                    ? parsed.preferredVoiceURI
                    : null,
            lastOpenedDocumentPath: typeof parsed.lastOpenedDocumentPath === "string" && parsed.lastOpenedDocumentPath.trim().length > 0
                ? parsed.lastOpenedDocumentPath
                : null,
            lastOpenedParagraphIndex: clampParagraphIndex(typeof parsed.lastOpenedParagraphIndex === "number" ? parsed.lastOpenedParagraphIndex : 0),
            hasSeenOnboarding: parsed.hasSeenOnboarding === true
        };
    }
    catch {
        return defaultReaderPersistenceState;
    }
}
export function readReaderPersistenceState(storage) {
    if (!storage) {
        return defaultReaderPersistenceState;
    }
    try {
        return parseReaderPersistenceState(storage.getItem(READER_PERSISTENCE_KEY));
    }
    catch {
        return defaultReaderPersistenceState;
    }
}
export function writeReaderPersistenceState(storage, state) {
    if (!storage) {
        return;
    }
    try {
        storage.setItem(READER_PERSISTENCE_KEY, JSON.stringify(state));
    }
    catch {
        // Ignore storage failures so document loading stays usable.
    }
}
