import assert from "node:assert/strict";
import { test } from "node:test";
import { getVoiceReaderCommand, getVoiceRecognitionAvailability, normalizeVoiceTranscript } from "./voiceCommands.js";
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
        }
    };
    assert.deepEqual(getVoiceRecognitionAvailability(mockWindow), {
        available: true,
        message: "Voice command mode is available on this device. It listens only after you press the listen button."
    });
    assert.deepEqual(getVoiceRecognitionAvailability({}), {
        available: false,
        message: "Voice command mode is unavailable on this device. Reader voice commands need browser speech recognition support."
    });
});
