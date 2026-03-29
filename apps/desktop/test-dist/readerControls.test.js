import assert from "node:assert/strict";
import { getAppShortcutAction, getReaderShortcutAction, splitIntoParagraphs, splitParagraphIntoSpeechChunks } from "./readerControls.js";
function runTests() {
    const paragraphs = splitIntoParagraphs("First line\nstill first\n\nSecond paragraph\r\n\r\nThird");
    assert.deepEqual(paragraphs, ["First line still first", "Second paragraph", "Third"]);
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
    assert.equal(getAppShortcutAction({
        key: "o",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false
    }), "openDocument");
    assert.equal(getReaderShortcutAction({
        key: "o",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false
    }), null);
    assert.equal(getReaderShortcutAction({
        key: " ",
        code: "Space",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false
    }), "togglePlayPause");
    assert.equal(getReaderShortcutAction({
        key: "r",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false
    }), "repeatCurrentParagraph");
    assert.equal(getReaderShortcutAction({
        key: "ArrowUp",
        code: "ArrowUp",
        ctrlKey: false,
        metaKey: false,
        altKey: true,
        shiftKey: false
    }), "increaseSpeed");
    assert.equal(getReaderShortcutAction({
        key: "ArrowDown",
        code: "ArrowDown",
        ctrlKey: false,
        metaKey: false,
        altKey: true,
        shiftKey: false
    }), "decreaseSpeed");
    assert.equal(getReaderShortcutAction({
        key: "s",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false
    }), null);
    assert.equal(getReaderShortcutAction({
        key: "x",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false
    }), null);
}
runTests();
