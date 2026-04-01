import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type BrowserSpeechRecognitionConstructor,
  VOICE_COMMAND_DETECTED_MESSAGE,
  VOICE_COMMAND_UNAVAILABLE_MESSAGE,
  buildVoiceCommandIdleMessage,
  buildVoiceCommandSupportMessage,
  didVoiceRecognitionEndBeforeCapture,
  getVoiceReaderCommand,
  getVoiceRecognitionAvailability,
  hasVoiceRecognitionCaptureActivity,
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

test("voice command Reader copy stays compact while keeping keyboard-first fallback explicit", () => {
  assert.equal(
    buildVoiceCommandIdleMessage({
      availabilityMessage: VOICE_COMMAND_DETECTED_MESSAGE,
      trustState: "detected"
    }),
    "Voice commands are available to try on this device. Still experimental until listening stays active."
  );

  assert.equal(
    buildVoiceCommandIdleMessage({
      availabilityMessage: VOICE_COMMAND_DETECTED_MESSAGE,
      trustState: "confirmed"
    }),
    "Voice commands worked in this session. One exact English command per press."
  );

  assert.equal(
    buildVoiceCommandIdleMessage({
      availabilityMessage: VOICE_COMMAND_DETECTED_MESSAGE,
      trustState: "unreliable"
    }),
    "Voice commands are unavailable here. Listening stopped before any speech was captured."
  );

  assert.equal(
    buildVoiceCommandSupportMessage({
      interactionDisabled: true,
      trustState: "unsupported"
    }),
    "Keyboard shortcuts and screen readers stay primary. Voice support needs browser speech recognition."
  );

  assert.equal(
    buildVoiceCommandSupportMessage({
      interactionDisabled: true,
      trustState: "unreliable"
    }),
    "Keyboard shortcuts and screen readers stay primary. Voice listening was not reliable here."
  );

  assert.equal(
    buildVoiceCommandSupportMessage({
      interactionDisabled: false,
      trustState: "confirmed"
    }),
    "Keyboard shortcuts and screen readers stay primary. Voice commands stay experimental."
  );
});

test("voice recognition capture activity requires audio, speech, or a handled result", () => {
  assert.equal(
    hasVoiceRecognitionCaptureActivity({
      recognitionStartedAt: Date.now(),
      audioStartedAt: null,
      soundStartedAt: null,
      speechStartedAt: null,
      resultHandled: false
    }),
    false
  );

  assert.equal(
    hasVoiceRecognitionCaptureActivity({
      recognitionStartedAt: Date.now(),
      audioStartedAt: Date.now(),
      soundStartedAt: null,
      speechStartedAt: null,
      resultHandled: false
    }),
    true
  );
});

test("didVoiceRecognitionEndBeforeCapture flags immediate start-end failures without capture activity", () => {
  const recognitionStartedAt = Date.now();

  assert.equal(
    didVoiceRecognitionEndBeforeCapture(
      {
        recognitionStartedAt,
        audioStartedAt: null,
        soundStartedAt: null,
        speechStartedAt: null,
        resultHandled: false
      },
      250,
      900
    ),
    true
  );

  assert.equal(
    didVoiceRecognitionEndBeforeCapture(
      {
        recognitionStartedAt,
        audioStartedAt: recognitionStartedAt + 20,
        soundStartedAt: null,
        speechStartedAt: null,
        resultHandled: false
      },
      250,
      900
    ),
    false
  );
});
