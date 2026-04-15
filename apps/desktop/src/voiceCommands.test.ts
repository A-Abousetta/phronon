import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildVoiceCommandHelpMessage,
  buildInitialVoiceCommandStatus,
  buildVoiceCommandButtonLabel,
  buildVoiceCommandStatusMessage,
  buildVoiceCommandSupportMessage
} from "./voiceCommands.js";

const browserCapability = {
  providerId: "browserSpeechRecognition",
  providerLabel: "Experimental browser speech recognition",
  state: "availableToTry" as const,
  detail: "Voice commands are available to try with the experimental browser speech provider.",
  experimental: true,
  bundledLocalRecognizer: false
};

const localCapability = {
  providerId: "localVosk",
  providerLabel: "Local offline speech recognition (Vosk)",
  state: "availableToTry" as const,
  detail: "Local offline Reader voice commands are ready through Vosk with a fixed English command grammar.",
  experimental: false,
  bundledLocalRecognizer: true
};

const experimentalLocalCapability = {
  providerId: "localVoskCommandV2",
  providerLabel: "Experimental offline speech recognition (Vosk v2)",
  state: "availableToTry" as const,
  detail: "Experimental local Reader voice v2 is ready through a warm Vosk service with streaming capture and VAD.",
  experimental: true,
  bundledLocalRecognizer: true
};

const localSupport = {
  providerId: "localVosk",
  providerLabel: "Local offline speech recognition (Vosk)",
  state: "ready" as const,
  detail: "Local offline Reader voice commands are ready through Vosk with a fixed English command grammar.",
  setupCommand: 'python -m pip install -e "./backend[voice]"',
  modelPath: "C:/models/vosk-model-small-en-us-0.15",
  paths: {
    baseline: {
      providerId: "localVosk",
      providerLabel: "Local offline speech recognition (Vosk)",
      state: "ready" as const,
      detail: "Local offline Reader voice commands are ready through Vosk with a fixed English command grammar.",
      experimental: false as const
    },
    experimentalV2: {
      providerId: "localVoskCommandV2",
      providerLabel: "Experimental offline speech recognition (Vosk v2)",
      state: "ready" as const,
      detail: "Experimental local Reader voice v2 is ready through a warm Vosk service with streaming capture and VAD.",
      experimental: true as const
    }
  }
};

const localSetupRequired = {
  ...localSupport,
  state: "optionalSetup" as const,
  detail: "Local offline Reader voice commands need optional setup: install the backend voice extras and a Vosk English model.",
  modelPath: null,
  paths: {
    ...localSupport.paths,
    baseline: {
      ...localSupport.paths.baseline,
      state: "optionalSetup" as const,
      detail: "Local offline Reader voice commands need optional setup: install the backend voice extras and a Vosk English model."
    },
    experimentalV2: {
      ...localSupport.paths.experimentalV2,
      state: "optionalSetup" as const,
      detail: "Experimental local Reader voice v2 shares the same setup requirements as the baseline Vosk path."
    }
  }
};

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
      capability: browserCapability,
      localSupport: localSetupRequired,
      status: {
        state: "availableToTry"
      }
    }),
    "Voice commands are available to try with the experimental browser fallback. Say one supported English command."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capability: browserCapability,
      localSupport: localSetupRequired,
      status: {
        state: "permissionDenied"
      }
    }),
    "Microphone permission was denied, so Reader voice commands cannot listen."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capability: {
        ...browserCapability,
        state: "unreliable",
        detail: "The experimental browser fallback ended early."
      },
      localSupport: localSetupRequired,
      status: {
        state: "runtimeEndedEarly"
      }
    }),
    "The speech-recognition runtime ended before a Reader command could be captured."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capability: experimentalLocalCapability,
      localSupport,
      status: {
        state: "serviceReady"
      }
    }),
    "Experimental local voice v2 service is warm. Opening microphone."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capability: experimentalLocalCapability,
      localSupport,
      status: {
        state: "microphoneActive"
      }
    }),
    "Microphone active. Ready for one Reader command."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capability: localCapability,
      localSupport,
      status: {
        state: "heardCommand",
        detail: "Heard command: Jump to search."
      }
    }),
    "Heard command: Jump to search."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capability: localCapability,
      localSupport,
      status: {
        state: "noSignalDetected"
      }
    }),
    "No microphone signal was detected."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capability: localCapability,
      localSupport,
      status: {
        state: "speechUnclear"
      }
    }),
    "The microphone heard audio, but speech was unclear."
  );

  assert.equal(
    buildVoiceCommandStatusMessage({
      capability: localCapability,
      localSupport,
      status: {
        state: "commandNeedsFullerPhrase"
      }
    }),
    "Heard part of a Reader command. Say the fuller phrase."
  );
});

test("voice command support copy stays honest about the experimental browser provider", () => {
  assert.equal(
    buildVoiceCommandSupportMessage({
      capability: {
        ...browserCapability,
        state: "unsupported",
        detail: "Voice commands are unavailable in this Electron/Chromium runtime."
      },
      localSupport: null
    }),
    "Keyboard shortcuts and screen readers stay primary. No voice-command provider is available here."
  );

  assert.equal(
    buildVoiceCommandSupportMessage({
      capability: browserCapability,
      localSupport: localSetupRequired
    }),
    "Keyboard shortcuts and screen readers stay primary. Local offline voice commands need optional setup on this device, so Phronon is using the experimental browser fallback for now."
  );

  assert.equal(
    buildVoiceCommandSupportMessage({
      capability: {
        ...browserCapability,
        state: "unreliable",
        detail: "The experimental browser fallback ended early."
      },
      localSupport: localSetupRequired
    }),
    "Keyboard shortcuts and screen readers stay primary. The experimental browser fallback is disabled after ending early on this device/runtime."
  );

  assert.equal(
    buildVoiceCommandSupportMessage({
      capability: localCapability,
      localSupport
    }),
    "Keyboard shortcuts and screen readers stay primary. Current voice support uses the local offline Vosk provider with a fixed Reader command grammar."
  );
});

test("voice command button labels reflect listening and downgrade states", () => {
  assert.equal(
    buildVoiceCommandButtonLabel({
      capability: browserCapability,
      localSupport: localSetupRequired,
      isListening: true
    }),
    "Stop listening"
  );

  assert.equal(
    buildVoiceCommandButtonLabel({
      capability: localCapability,
      localSupport,
      isListening: false
    }),
    "Press to listen"
  );

  assert.equal(
    buildVoiceCommandButtonLabel({
      capability: {
        ...browserCapability,
        state: "unsupported",
        detail: "Voice commands are unavailable in this Electron/Chromium runtime."
      },
      localSupport: localSetupRequired,
      isListening: false
    }),
    "Voice commands need setup"
  );

  assert.equal(
    buildVoiceCommandButtonLabel({
      capability: {
        ...browserCapability,
        state: "unreliable",
        detail: "The experimental browser fallback ended early."
      },
      localSupport: localSetupRequired,
      isListening: false
    }),
    "Voice commands unreliable"
  );
});

test("voice command help copy explains local readiness versus fallback honestly", () => {
  assert.equal(
    buildVoiceCommandHelpMessage({
      capability: localCapability,
      localSupport
    }),
    "Local offline Vosk provider. Press `Press to listen`, wait for `Microphone active`, then say one supported English command or alias."
  );

  assert.equal(
    buildVoiceCommandHelpMessage({
      capability: experimentalLocalCapability,
      localSupport
    }),
    "Experimental local Vosk v2. Press `Press to listen`, wait for `Microphone active`, then say one supported English command or alias."
  );

  assert.equal(
    buildVoiceCommandHelpMessage({
      capability: browserCapability,
      localSupport: localSetupRequired
    }),
    "Local offline voice commands need optional setup on this device. Phronon is using the experimental browser fallback for now."
  );
});
