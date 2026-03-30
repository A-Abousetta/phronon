import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBookmarkPreviewText,
  buildDocumentLoadStatusMessage,
  buildReaderDocumentStatusMessage,
  buildRecentDocumentButtonLabel,
  buildDocumentOpenFailureMessage,
  clampParagraphIndex,
  clampReadingSpeed,
  createParagraphBookmark,
  createTextHighlight,
  getBookmarksForDocument,
  getDocumentFileName,
  getHighlightsForDocument,
  normalizeBookmarkNote,
  normalizeHighlightNote,
  normalizeHighlightSelectionText,
  parseReaderPersistenceState,
  removeTextHighlight,
  upsertParagraphBookmark,
  upsertTextHighlight,
  upsertRecentDocument
} from "./documentWorkflow.js";

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
  const recent = upsertRecentDocument(
    [
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
    ],
    {
      filePath: "C:\\docs\\Biology Chapter 3.txt",
      fileType: "txt"
    },
    3000
  );

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
    highlightsByDocument: {},
    readingSpeed: 1,
    interfaceTextScale: "default",
    readerTextScale: "default",
    contrastMode: "default",
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
          note: "Review this part later",
          createdAt: 4000
        },
        {
          documentPath: 4
        }
      ]
    },
    highlightsByDocument: {
      "C:\\docs\\Notes.txt": [
        {
          id: "p3-s5-e17-important-phrase",
          documentPath: "C:\\docs\\Notes.txt",
          paragraphIndex: 3.8,
          selectedText: " Important   phrase ",
          previewText: " Important   phrase ",
          startOffset: 5.9,
          endOffset: 17.4,
          note: " Review  this ",
          createdAt: 4500
        }
      ]
    },
    readingSpeed: 2.7,
    interfaceTextScale: "largest",
    readerTextScale: "large",
    contrastMode: "strong",
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
          note: "Review this part later",
          createdAt: 4000
        }
      ]
    },
    highlightsByDocument: {
      "C:\\docs\\Notes.txt": [
        {
          id: "p3-s5-e17-important-phrase",
          documentPath: "C:\\docs\\Notes.txt",
          paragraphIndex: 3,
          selectedText: "Important phrase",
          previewText: "Important phrase",
          startOffset: 5,
          endOffset: 17,
          note: "Review this",
          createdAt: 4500
        }
      ]
    },
    readingSpeed: 2,
    interfaceTextScale: "largest",
    readerTextScale: "large",
    contrastMode: "strong",
    speechVoicePreference: "manual",
    preferredVoiceId: "uri:voice-ar-sa",
    lastOpenedDocumentPath: "C:\\docs\\Notes.txt",
    lastOpenedParagraphIndex: 4,
    hasSeenOnboarding: true
  });
});

test("parseReaderPersistenceState falls back for invalid display preferences", () => {
  const parsed = parseReaderPersistenceState(JSON.stringify({
    interfaceTextScale: "huge",
    readerTextScale: 2,
    contrastMode: "extra"
  }));

  assert.equal(parsed.interfaceTextScale, "default");
  assert.equal(parsed.readerTextScale, "default");
  assert.equal(parsed.contrastMode, "default");
});

test("reading and paragraph clamps keep persisted values in range", () => {
  assert.equal(clampReadingSpeed(0.2), 0.5);
  assert.equal(clampReadingSpeed(1.26), 1.3);
  assert.equal(clampReadingSpeed(4), 2);
  assert.equal(clampParagraphIndex(-3), 0);
  assert.equal(clampParagraphIndex(7.9), 7);
});

test("buildDocumentOpenFailureMessage keeps the current document clear", () => {
  assert.equal(
    buildDocumentOpenFailureMessage({
      attemptedFilePath: "C:\\docs\\New Notes.pdf",
      currentFilePath: "C:\\docs\\Current Notes.txt",
      reason: "Phronon could not extract readable text from that PDF."
    }),
    "New Notes.pdf did not open. Phronon could not extract readable text from that PDF. Current Notes.txt is still open."
  );
});

test("buildReaderDocumentStatusMessage reports the loaded file and position", () => {
  assert.equal(
    buildReaderDocumentStatusMessage({
      filePath: "C:\\docs\\Biology Chapter 3.txt",
      fileType: "txt",
      currentParagraphIndex: 2,
      paragraphCount: 8
    }),
    "Loaded text file: Biology Chapter 3.txt. Paragraph 3 of 8."
  );
});

test("buildReaderDocumentStatusMessage keeps empty reader state clear", () => {
  assert.equal(
    buildReaderDocumentStatusMessage({
      currentParagraphIndex: 0,
      paragraphCount: 0
    }),
    "No document loaded. Paragraph 0 of 0."
  );
});

test("buildReaderDocumentStatusMessage prefers the active load status when loading", () => {
  assert.equal(
    buildReaderDocumentStatusMessage({
      isLoading: true,
      loadingStatusMessage: "Restoring your last document: Notes.txt.",
      filePath: "C:\\docs\\Current Notes.txt",
      fileType: "txt",
      currentParagraphIndex: 1,
      paragraphCount: 4
    }),
    "Restoring your last document: Notes.txt."
  );
});

test("buildRecentDocumentButtonLabel creates a screen-reader-friendly name", () => {
  assert.equal(
    buildRecentDocumentButtonLabel({
      fileName: "Chemistry Notes.pdf",
      filePath: "C:\\docs\\Chemistry Notes.pdf",
      fileType: "pdf",
      lastOpenedAt: 1000
    }),
    "Open recent PDF document Chemistry Notes.pdf"
  );
});

test("buildDocumentLoadStatusMessage explains the active load operation", () => {
  assert.equal(
    buildDocumentLoadStatusMessage({
      origin: "startupRestore",
      filePath: "C:\\docs\\History Notes.txt"
    }),
    "Restoring your last document: History Notes.txt."
  );

  assert.equal(
    buildDocumentLoadStatusMessage({
      origin: "recentDocument",
      filePath: "C:\\docs\\Chemistry.pdf"
    }),
    "Opening recent document: Chemistry.pdf. If it is a scanned PDF, Phronon may use optional local OCR, so opening can take a little longer."
  );

  assert.equal(
    buildDocumentLoadStatusMessage({
      origin: "filePicker"
    }),
    "Waiting for you to choose a document to open. Scanned PDFs can take a little longer because Phronon may need local OCR."
  );
});

test("bookmark helpers build, store, and read document-scoped bookmarks", () => {
  const bookmark = createParagraphBookmark({
    documentPath: "C:\\docs\\Notes.txt",
    paragraphIndex: 2,
    paragraphText: "This is a longer paragraph preview that should stay readable in the bookmark list.",
    noteText: "Quiz on Tuesday",
    now: 5000
  });

  assert.deepEqual(bookmark, {
    documentPath: "C:\\docs\\Notes.txt",
    paragraphIndex: 2,
    previewText: "This is a longer paragraph preview that should stay readable in the bookmark list.",
    note: "Quiz on Tuesday",
    createdAt: 5000
  });

  const updatedBookmarks = upsertParagraphBookmark(
    [
      {
        documentPath: "C:\\docs\\Notes.txt",
        paragraphIndex: 5,
        previewText: "Later paragraph",
        note: "",
        createdAt: 2000
      }
    ],
    bookmark
  );

  assert.deepEqual(updatedBookmarks, [
    bookmark,
    {
      documentPath: "C:\\docs\\Notes.txt",
      paragraphIndex: 5,
      previewText: "Later paragraph",
      note: "",
      createdAt: 2000
    }
  ]);

  assert.deepEqual(
    getBookmarksForDocument(
      {
        "C:\\docs\\Notes.txt": updatedBookmarks
      },
      "C:\\docs\\Notes.txt"
    ),
    updatedBookmarks
  );
});

test("highlight helpers build, store, update, and remove document-scoped highlights", () => {
  const highlight = createTextHighlight({
    documentPath: "C:\\docs\\Notes.txt",
    paragraphIndex: 2,
    paragraphText: "This paragraph contains an important phrase for the exam.",
    selectedText: "important phrase",
    startOffset: 27,
    endOffset: 43,
    noteText: "Review this",
    now: 6000
  });

  assert.deepEqual(highlight, {
    id: "p2-s27-e43-important-phrase",
    documentPath: "C:\\docs\\Notes.txt",
    paragraphIndex: 2,
    selectedText: "important phrase",
    previewText: "important phrase",
    startOffset: 27,
    endOffset: 43,
    note: "Review this",
    createdAt: 6000
  });

  const updatedHighlight = createTextHighlight({
    documentPath: "C:\\docs\\Notes.txt",
    paragraphIndex: 2,
    paragraphText: "This paragraph contains an important phrase for the exam.",
    selectedText: "important phrase",
    startOffset: 27,
    endOffset: 43,
    noteText: "Quiz topic",
    now: 7000
  });

  const savedHighlights = upsertTextHighlight(
    [
      {
        id: "p5-s0-e4-later",
        documentPath: "C:\\docs\\Notes.txt",
        paragraphIndex: 5,
        selectedText: "Later",
        previewText: "Later",
        startOffset: 0,
        endOffset: 4,
        note: "",
        createdAt: 6500
      }
    ],
    highlight
  );

  assert.deepEqual(
    getHighlightsForDocument(
      {
        "C:\\docs\\Notes.txt": savedHighlights
      },
      "C:\\docs\\Notes.txt"
    ),
    savedHighlights
  );

  assert.deepEqual(upsertTextHighlight(savedHighlights, updatedHighlight), [
    {
      ...updatedHighlight
    },
    {
      id: "p5-s0-e4-later",
      documentPath: "C:\\docs\\Notes.txt",
      paragraphIndex: 5,
      selectedText: "Later",
      previewText: "Later",
      startOffset: 0,
      endOffset: 4,
      note: "",
      createdAt: 6500
    }
  ]);

  assert.deepEqual(removeTextHighlight(savedHighlights, highlight.id), [
    {
      id: "p5-s0-e4-later",
      documentPath: "C:\\docs\\Notes.txt",
      paragraphIndex: 5,
      selectedText: "Later",
      previewText: "Later",
      startOffset: 0,
      endOffset: 4,
      note: "",
      createdAt: 6500
    }
  ]);
});

test("buildBookmarkPreviewText trims long paragraphs safely", () => {
  assert.equal(
    buildBookmarkPreviewText("One two three four five six seven eight nine ten eleven twelve.", 20),
    "One two three four…"
  );
});

test("normalizeBookmarkNote keeps notes short and blank-safe", () => {
  assert.equal(normalizeBookmarkNote("   exam topic   "), "exam topic");
  assert.equal(normalizeBookmarkNote(""), "");
  assert.equal(normalizeBookmarkNote("one two three four five", 12), "one two thre");
});

test("highlight normalization keeps selections and notes short and blank-safe", () => {
  assert.equal(normalizeHighlightSelectionText("   key   phrase   "), "key phrase");
  assert.equal(normalizeHighlightSelectionText(""), "");
  assert.equal(normalizeHighlightNote("   exam topic   "), "exam topic");
});
