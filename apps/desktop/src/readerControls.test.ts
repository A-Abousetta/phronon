import assert from "node:assert/strict";

import {
  appShortcutDefinitions,
  findParagraphSearchMatches,
  getAppShortcutAction,
  getReaderShortcutAction,
  readerShortcutDefinitions,
  splitIntoParagraphs,
  splitParagraphIntoSpeechChunks
} from "./readerControls.js";

function runTests() {
  const paragraphs = splitIntoParagraphs("First line\nstill first\n\nSecond paragraph\r\n\r\nThird");

  assert.deepEqual(paragraphs, ["First line still first", "Second paragraph", "Third"]);

  assert.deepEqual(
    splitIntoParagraphs(
      "This is a wrapped PDF line\nthat continues the same thought\nand should stay together.\n\nNew section starts here."
    ),
    ["This is a wrapped PDF line that continues the same thought and should stay together.", "New section starts here."]
  );

  assert.deepEqual(
    splitIntoParagraphs(
      "Heading:\nA short explanatory line\ncontinues here\n\n1. First list item\n2. Second list item"
    ),
    ["Heading:", "A short explanatory line continues here", "1. First list item", "2. Second list item"]
  );

  assert.deepEqual(
    splitIntoParagraphs(
      "This OCR block keeps going without a blank line. It has several sentences that should stay readable together. It keeps explaining the same topic for a while. Another sentence pushes the paragraph past a comfortable reading size. One more sentence should create a second readable section instead of a giant wall of text."
    ),
    [
      "This OCR block keeps going without a blank line. It has several sentences that should stay readable together. It keeps explaining the same topic for a while.",
      "Another sentence pushes the paragraph past a comfortable reading size. One more sentence should create a second readable section instead of a giant wall of text."
    ]
  );

  assert.deepEqual(splitIntoParagraphs(null), []);
  assert.deepEqual(splitIntoParagraphs(" \n \n "), []);
  assert.deepEqual(splitParagraphIntoSpeechChunks("Single sentence"), ["Single sentence"]);
  assert.deepEqual(splitParagraphIntoSpeechChunks("First sentence. Second sentence? Third sentence!"), [
    "First sentence.",
    "Second sentence?",
    "Third sentence!"
  ]);
  assert.deepEqual(splitParagraphIntoSpeechChunks("First item.\nSecond item."), [
    "First item.",
    "Second item."
  ]);
  assert.deepEqual(
    findParagraphSearchMatches(
      ["Photosynthesis starts with light energy.", "Light helps the plant make food.", "No match here."],
      "light"
    ),
    [
      {
        paragraphIndex: 0,
        startIndex: 27,
        endIndex: 32
      },
      {
        paragraphIndex: 1,
        startIndex: 0,
        endIndex: 5
      }
    ]
  );
  assert.deepEqual(
    findParagraphSearchMatches(["Repeat repeat REPEAT", "Different"], "repeat"),
    [
      {
        paragraphIndex: 0,
        startIndex: 0,
        endIndex: 6
      },
      {
        paragraphIndex: 0,
        startIndex: 7,
        endIndex: 13
      },
      {
        paragraphIndex: 0,
        startIndex: 14,
        endIndex: 20
      }
    ]
  );
  assert.deepEqual(findParagraphSearchMatches(["Anything"], "   "), []);

  assert.equal(
    getAppShortcutAction({
      key: "o",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    "openDocument"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "o",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    null
  );

  assert.equal(
    getReaderShortcutAction({
      key: " ",
      code: "Space",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    "togglePlayPause"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "r",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    "repeatCurrentParagraph"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "f",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    "focusSearch"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "F3",
      code: "F3",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    "nextSearchMatch"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "F3",
      code: "F3",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: true
    }),
    "previousSearchMatch"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "m",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    "saveBookmark"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "b",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    "nextBookmark"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "B",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: true
    }),
    "previousBookmark"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "h",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    "nextHighlight"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "H",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: true
    }),
    "previousHighlight"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "/",
      code: "Slash",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    "focusSearch"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "Escape",
      code: "Escape",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    "focusReaderText"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "ArrowUp",
      code: "ArrowUp",
      ctrlKey: false,
      metaKey: false,
      altKey: true,
      shiftKey: false
    }),
    "increaseSpeed"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "ArrowDown",
      code: "ArrowDown",
      ctrlKey: false,
      metaKey: false,
      altKey: true,
      shiftKey: false
    }),
    "decreaseSpeed"
  );

  assert.equal(
    getReaderShortcutAction({
      key: "s",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    null
  );

  assert.equal(
    getReaderShortcutAction({
      key: "x",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false
    }),
    null
  );

  assert.ok(appShortcutDefinitions.some((shortcut) => shortcut.action === "openDocument"));
  assert.ok(readerShortcutDefinitions.some((shortcut) => shortcut.action === "focusSearch"));
  assert.ok(readerShortcutDefinitions.some((shortcut) => shortcut.action === "nextBookmark"));
}

runTests();
