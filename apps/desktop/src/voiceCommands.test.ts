import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildInitialVoiceCommandStatus,
  buildVoiceCommandButtonLabel,
  buildVoiceCommandStatusMessage,
  buildVoiceCommandSupportMessage
} from "./voiceCommands.js";

test("voice command UI status starts from capability state", () => {
  assert.deepEqual(buildInitialVoiceCommandStatus("availableToTry"), {
    state: "availableToTry"
  });
  assert.deepEqual(buildInitialVoiceCommandStatus("unsupported"), {
    state: "unsupported"
  });
  assert.deepEqual(buildInitialVoiceCommandStatus("unreliable"), {
    state: "unreliable"
  });
});

test("voice command status copy keeps capability and failure states explicit", () => {
  assert.equal(
    buildVoiceCommandStatusMessage({
      capabilityState: "availableToTry",
      status: {
        state: "availableToTry"
      }
    }),
    "Voice commands are available to try with the experimental browser provider. Say one exact English command."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capabilityState: "availableToTry",
      status: {
        state: "permissionDenied"
      }
    }),
    "Microphone permission was denied, so Reader voice commands cannot listen."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capabilityState: "unreliable",
      status: {
        state: "runtimeEndedEarly"
      }
    }),
    "The speech-recognition runtime ended before a Reader command could be captured."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capabilityState: "availableToTry",
      status: {
        state: "heardCommand",
        detail: "Heard command: Jump to search."
      }
    }),
    "Heard command: Jump to search."
  );
});

test("voice command support copy stays honest about the experimental browser provider", () => {
  assert.equal(
    buildVoiceCommandSupportMessage({
      capabilityState: "unsupported"
    }),
    "Keyboard shortcuts and screen readers stay primary. No voice-command provider is available here."
  );

  assert.equal(
    buildVoiceCommandSupportMessage({
      capabilityState: "availableToTry"
    }),
    "Keyboard shortcuts and screen readers stay primary. Current voice support uses the experimental browser provider, not a bundled local recognizer."
  );

  assert.equal(
    buildVoiceCommandSupportMessage({
      capabilityState: "unreliable"
    }),
    "Keyboard shortcuts and screen readers stay primary. The experimental browser provider is disabled after ending early on this device/runtime."
  );
});

test("voice command button labels reflect listening and downgrade states", () => {
  assert.equal(
    buildVoiceCommandButtonLabel({
      capabilityState: "availableToTry",
      isListening: true
    }),
    "Stop listening"
  );

  assert.equal(
    buildVoiceCommandButtonLabel({
      capabilityState: "unsupported",
      isListening: false
    }),
    "Voice commands unavailable"
  );

  assert.equal(
    buildVoiceCommandButtonLabel({
      capabilityState: "unreliable",
      isListening: false
    }),
    "Voice commands unreliable"
  );
});
