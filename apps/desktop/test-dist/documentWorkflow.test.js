import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocumentOpenFailureMessage, clampParagraphIndex, clampReadingSpeed, getDocumentFileName, parseReaderPersistenceState, upsertRecentDocument } from "./documentWorkflow.js";
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
        readingSpeed: 1,
        lastOpenedDocumentPath: null,
        lastOpenedParagraphIndex: 0
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
        readingSpeed: 2.7,
        lastOpenedDocumentPath: "C:\\docs\\Notes.txt",
        lastOpenedParagraphIndex: 4.8
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
        readingSpeed: 2,
        lastOpenedDocumentPath: "C:\\docs\\Notes.txt",
        lastOpenedParagraphIndex: 4
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
