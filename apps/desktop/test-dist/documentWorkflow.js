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
    readingSpeed: DEFAULT_READING_SPEED,
    lastOpenedDocumentPath: null,
    lastOpenedParagraphIndex: 0
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
export function parseReaderPersistenceState(rawValue) {
    if (!rawValue) {
        return defaultReaderPersistenceState;
    }
    try {
        const parsed = JSON.parse(rawValue);
        const recentDocuments = Array.isArray(parsed.recentDocuments)
            ? parsed.recentDocuments.filter(isRecentDocument).slice(0, 8)
            : [];
        return {
            recentDocuments,
            readingSpeed: clampReadingSpeed(typeof parsed.readingSpeed === "number" ? parsed.readingSpeed : DEFAULT_READING_SPEED),
            lastOpenedDocumentPath: typeof parsed.lastOpenedDocumentPath === "string" && parsed.lastOpenedDocumentPath.trim().length > 0
                ? parsed.lastOpenedDocumentPath
                : null,
            lastOpenedParagraphIndex: clampParagraphIndex(typeof parsed.lastOpenedParagraphIndex === "number" ? parsed.lastOpenedParagraphIndex : 0)
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
