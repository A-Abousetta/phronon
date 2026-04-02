import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getVoiceReaderCommandMatch,
  getVoiceReaderCommandMatchFromAlternatives,
  normalizeVoiceTranscript,
  readerVoiceCommandLabels
} from "./voiceCommandGrammar.js";

test("normalizeVoiceTranscript trims casing, spacing, and simple punctuation", () => {
  assert.equal(normalizeVoiceTranscript("  Next   paragraph! "), "next paragraph");
  assert.equal(normalizeVoiceTranscript("jump-to-help"), "jump to help");
});

test("strict Reader command grammar matches only the supported phrases", () => {
  assert.equal(getVoiceReaderCommandMatch("Open file")?.command, "openFile");
  assert.equal(getVoiceReaderCommandMatch("open document")?.command, "openFile");
  assert.equal(getVoiceReaderCommandMatch("speed up")?.command, "faster");
  assert.equal(getVoiceReaderCommandMatch("jump to help")?.command, "jumpToHelp");
  assert.equal(getVoiceReaderCommandMatch("jump to search")?.command, "jumpToSearch");
  assert.equal(getVoiceReaderCommandMatch("please play"), null);
  assert.equal(getVoiceReaderCommandMatch("play now"), null);
  assert.equal(getVoiceReaderCommandMatch(""), null);
});

test("command matching scans alternatives until a supported phrase is found", () => {
  const match = getVoiceReaderCommandMatchFromAlternatives([
    "play now",
    "jump to bookmarks"
  ]);

  assert.equal(match?.command, "jumpToBookmarks");
  assert.equal(match?.definition.label, "Jump to bookmarks");
});

test("canonical Reader voice command labels cover navigation and playback scopes", () => {
  assert.deepEqual(readerVoiceCommandLabels, [
    "Open file",
    "Play",
    "Pause",
    "Stop",
    "Next paragraph",
    "Previous paragraph",
    "Repeat paragraph",
    "Faster",
    "Slower",
    "Jump to document",
    "Jump to playback",
    "Jump to search",
    "Jump to highlights",
    "Jump to bookmarks",
    "Jump to shortcuts"
  ]);
});
