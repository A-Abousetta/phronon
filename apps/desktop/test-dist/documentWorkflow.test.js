import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBookmarkPreviewText, buildDocumentLoadStatusMessage, buildReaderDocumentStatusMessage, buildRecentDocumentButtonLabel, buildDocumentOpenFailureMessage, clampParagraphIndex, clampReadingSpeed, createParagraphBookmark, getBookmarksForDocument, getDocumentFileName, parseReaderPersistenceState, upsertParagraphBookmark, upsertRecentDocument } from "./documentWorkflow.js";
test("getDocumentFileName returns the last path segment", () => {
    assert.equal(getDocumentFileName("C:\\docs\\Biology Chapter 3.txt"), "Biology Chapter 3.txt");
    assert.equal(getDocumentFileName("/tmp/notes.pdf"), "notes.pdf");
});
test("upsertRecentDocument adds the latest document to the front", () => {
    const recent = upsertRecentDocument([], {
        filePath: "C:\\docs\\Biology Chapter 3.txt",
        fileType: "txt"
    }, 1000);
    assert.deepEqual(recent, [
        {
            fileName: "Biology Chapter 3.txt",
            filePath: "C:\\docs\\Biology Chapter 3.txt",
            fileType: "txt",
            lastOpenedAt: 1000
        }
    ]);
});
test("upsertRecentDocument deduplicates by file path and moves reopened files to the front", () => {
    const recent = upsertRecentDocument([
        {
            fileName: "Old Notes.pdf",
            filePath: "C:\\docs\\Old Notes.pdf",
            fileType: "pdf",
            lastOpenedAt: 2000
        },
        {
            fileName: "Biology Chapter 3.txt",
            filePath: "C:\\docs\\Biology Chapter 3.txt",
            fileType: "txt",
            lastOpenedAt: 1000
        }
    ], {
        filePath: "C:\\docs\\Biology Chapter 3.txt",
        fileType: "txt"
    }, 3000);
    assert.deepEqual(recent, [
        {
            fileName: "Biology Chapter 3.txt",
            filePath: "C:\\docs\\Biology Chapter 3.txt",
            fileType: "txt",
            lastOpenedAt: 3000
        },
        {
            fileName: "Old Notes.pdf",
            filePath: "C:\\docs\\Old Notes.pdf",
            fileType: "pdf",
            lastOpenedAt: 2000
        }
    ]);
});
test("parseReaderPersistenceState returns safe defaults for invalid data", () => {
    assert.deepEqual(parseReaderPersistenceState("{not valid json"), {
        recentDocuments: [],
        bookmarksByDocument: {},
        readingSpeed: 1,
        speechVoicePreference: "automatic",
        preferredVoiceId: null,
        lastOpenedDocumentPath: null,
        lastOpenedParagraphIndex: 0,
        hasSeenOnboarding: false
    });
});
test("parseReaderPersistenceState keeps only valid persisted reader values", () => {
    const parsed = parseReaderPersistenceState(JSON.stringify({
        recentDocuments: [
            {
                fileName: "Notes.txt",
                filePath: "C:\\docs\\Notes.txt",
                fileType: "txt",
                lastOpenedAt: 1200
            },
            {
                fileName: "Broken",
                filePath: 4
            }
        ],
        bookmarksByDocument: {
            "C:\\docs\\Notes.txt": [
                {
                    documentPath: "C:\\docs\\Notes.txt",
                    paragraphIndex: 3.8,
                    previewText: "Saved paragraph preview",
                    createdAt: 4000
                },
                {
                    documentPath: 4
                }
            ]
        },
        readingSpeed: 2.7,
        speechVoicePreference: "manual",
        preferredVoiceId: "uri:voice-ar-sa",
        lastOpenedDocumentPath: "C:\\docs\\Notes.txt",
        lastOpenedParagraphIndex: 4.8,
        hasSeenOnboarding: true
    }));
    assert.deepEqual(parsed, {
        recentDocuments: [
            {
                fileName: "Notes.txt",
                filePath: "C:\\docs\\Notes.txt",
                fileType: "txt",
                lastOpenedAt: 1200
            }
        ],
        bookmarksByDocument: {
            "C:\\docs\\Notes.txt": [
                {
                    documentPath: "C:\\docs\\Notes.txt",
                    paragraphIndex: 3,
                    previewText: "Saved paragraph preview",
                    createdAt: 4000
                }
            ]
        },
        readingSpeed: 2,
        speechVoicePreference: "manual",
        preferredVoiceId: "uri:voice-ar-sa",
        lastOpenedDocumentPath: "C:\\docs\\Notes.txt",
        lastOpenedParagraphIndex: 4,
        hasSeenOnboarding: true
    });
});
test("reading and paragraph clamps keep persisted values in range", () => {
    assert.equal(clampReadingSpeed(0.2), 0.5);
    assert.equal(clampReadingSpeed(1.26), 1.3);
    assert.equal(clampReadingSpeed(4), 2);
    assert.equal(clampParagraphIndex(-3), 0);
    assert.equal(clampParagraphIndex(7.9), 7);
});
test("buildDocumentOpenFailureMessage keeps the current document clear", () => {
    assert.equal(buildDocumentOpenFailureMessage({
        attemptedFilePath: "C:\\docs\\New Notes.pdf",
        currentFilePath: "C:\\docs\\Current Notes.txt",
        reason: "Phronon could not extract readable text from that PDF."
    }), "New Notes.pdf did not open. Phronon could not extract readable text from that PDF. Current Notes.txt is still open.");
});
test("buildReaderDocumentStatusMessage reports the loaded file and position", () => {
    assert.equal(buildReaderDocumentStatusMessage({
        filePath: "C:\\docs\\Biology Chapter 3.txt",
        fileType: "txt",
        currentParagraphIndex: 2,
        paragraphCount: 8
    }), "Loaded text file: Biology Chapter 3.txt. Paragraph 3 of 8.");
});
test("buildReaderDocumentStatusMessage keeps empty reader state clear", () => {
    assert.equal(buildReaderDocumentStatusMessage({
        currentParagraphIndex: 0,
        paragraphCount: 0
    }), "No document loaded. Paragraph 0 of 0.");
});
test("buildReaderDocumentStatusMessage prefers the active load status when loading", () => {
    assert.equal(buildReaderDocumentStatusMessage({
        isLoading: true,
        loadingStatusMessage: "Restoring your last document: Notes.txt.",
        filePath: "C:\\docs\\Current Notes.txt",
        fileType: "txt",
        currentParagraphIndex: 1,
        paragraphCount: 4
    }), "Restoring your last document: Notes.txt.");
});
test("buildRecentDocumentButtonLabel creates a screen-reader-friendly name", () => {
    assert.equal(buildRecentDocumentButtonLabel({
        fileName: "Chemistry Notes.pdf",
        filePath: "C:\\docs\\Chemistry Notes.pdf",
        fileType: "pdf",
        lastOpenedAt: 1000
    }), "Open recent PDF document Chemistry Notes.pdf");
});
test("buildDocumentLoadStatusMessage explains the active load operation", () => {
    assert.equal(buildDocumentLoadStatusMessage({
        origin: "startupRestore",
        filePath: "C:\\docs\\History Notes.txt"
    }), "Restoring your last document: History Notes.txt.");
    assert.equal(buildDocumentLoadStatusMessage({
        origin: "recentDocument",
        filePath: "C:\\docs\\Chemistry.pdf"
    }), "Opening recent document: Chemistry.pdf.");
    assert.equal(buildDocumentLoadStatusMessage({
        origin: "filePicker"
    }), "Waiting for you to choose a document to open.");
});
test("bookmark helpers build, store, and read document-scoped bookmarks", () => {
    const bookmark = createParagraphBookmark({
        documentPath: "C:\\docs\\Notes.txt",
        paragraphIndex: 2,
        paragraphText: "This is a longer paragraph preview that should stay readable in the bookmark list.",
        now: 5000
    });
    assert.deepEqual(bookmark, {
        documentPath: "C:\\docs\\Notes.txt",
        paragraphIndex: 2,
        previewText: "This is a longer paragraph preview that should stay readable in the bookmark list.",
        createdAt: 5000
    });
    const updatedBookmarks = upsertParagraphBookmark([
        {
            documentPath: "C:\\docs\\Notes.txt",
            paragraphIndex: 5,
            previewText: "Later paragraph",
            createdAt: 2000
        }
    ], bookmark);
    assert.deepEqual(updatedBookmarks, [
        bookmark,
        {
            documentPath: "C:\\docs\\Notes.txt",
            paragraphIndex: 5,
            previewText: "Later paragraph",
            createdAt: 2000
        }
    ]);
    assert.deepEqual(getBookmarksForDocument({
        "C:\\docs\\Notes.txt": updatedBookmarks
    }, "C:\\docs\\Notes.txt"), updatedBookmarks);
});
test("buildBookmarkPreviewText trims long paragraphs safely", () => {
    assert.equal(buildBookmarkPreviewText("One two three four five six seven eight nine ten eleven twelve.", 20), "One two three four…");
});
