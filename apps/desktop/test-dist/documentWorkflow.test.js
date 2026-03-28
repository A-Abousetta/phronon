import assert from "node:assert/strict";
import { test } from "node:test";
import { getDocumentFileName, upsertRecentDocument } from "./documentWorkflow.js";
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
