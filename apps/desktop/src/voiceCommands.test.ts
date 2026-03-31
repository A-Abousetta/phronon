import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type BrowserSpeechRecognitionConstructor,
  VOICE_COMMAND_DETECTED_MESSAGE,
  VOICE_COMMAND_UNAVAILABLE_MESSAGE,
  getVoiceReaderCommand,
  getVoiceRecognitionAvailability,
  normalizeVoiceTranscript
} from "./voiceCommands.js";

test("normalizeVoiceTranscript trims casing, spacing, and simple punctuation", () => {
  assert.equal(normalizeVoiceTranscript("  Next   paragraph! "), "next paragraph");
  assert.equal(normalizeVoiceTranscript("repeat-paragraph"), "repeat paragraph");
});

test("getVoiceReaderCommand matches only the supported exact commands", () => {
  assert.equal(getVoiceReaderCommand("Open file"), "openFile");
  assert.equal(getVoiceReaderCommand("pause."), "pause");
  assert.equal(getVoiceReaderCommand("next paragraph"), "nextParagraph");
  assert.equal(getVoiceReaderCommand("please play"), null);
  assert.equal(getVoiceReaderCommand(""), null);
});

test("getVoiceRecognitionAvailability reports support clearly", () => {
  const mockWindow = {
    SpeechRecognition: function MockRecognition() {
      return undefined;
    } as unknown as BrowserSpeechRecognitionConstructor
  } as unknown as Window;

  assert.deepEqual(
    getVoiceRecognitionAvailability(mockWindow),
    {
      available: true,
      message: VOICE_COMMAND_DETECTED_MESSAGE
    }
  );

  assert.deepEqual(getVoiceRecognitionAvailability({} as unknown as Window), {
    available: false,
    message: VOICE_COMMAND_UNAVAILABLE_MESSAGE
  });
});
