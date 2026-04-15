import type { RuntimeSupportStatus } from "./runtimeDiagnostics.js";
import type { VoiceCommandCapability, VoiceCommandCapabilityState } from "./voiceCommandProvider.js";

export type VoiceCommandUiState =
  | "starting"
  | "serviceReady"
  | "microphoneActive"
  | "waitingForSpeech"
  | "speechDetected"
  | "postSpeechSilence"
  | "unsupported"
  | "availableToTry"
  | "listening"
  | "heardCommand"
  | "heardSpeechNoMatch"
  | "commandNeedsFullerPhrase"
  | "noSignalDetected"
  | "speechUnclear"
  | "heardNothing"
  | "noSupportedCommandMatched"
  | "permissionDenied"
  | "runtimeEndedEarly"
  | "unreliable";

export type VoiceCommandStatus = {
  state: VoiceCommandUiState;
  detail?: string | null;
};

export function buildInitialVoiceCommandStatus(
  capabilityState: VoiceCommandCapabilityState
): VoiceCommandStatus {
  switch (capabilityState) {
    case "unsupported":
      return {
        state: "unsupported"
      };
    case "unreliable":
      return {
        state: "unreliable"
      };
    case "availableToTry":
    default:
      return {
        state: "availableToTry"
      };
  }
}

export function buildVoiceCommandStatusMessage(options: {
  capability: VoiceCommandCapability;
  localSupport: RuntimeSupportStatus["voiceCommandSupport"] | null;
  status: VoiceCommandStatus;
}) {
  if (options.status.detail?.trim()) {
    return options.status.detail;
  }

  switch (options.status.state) {
    case "starting":
      return options.capability.experimental
        ? "Warming experimental local voice v2 service."
        : "Preparing local voice recognition for one Reader command.";
    case "serviceReady":
      return "Experimental local voice v2 service is warm. Opening microphone.";
    case "microphoneActive":
      return "Microphone active. Ready for one Reader command.";
    case "waitingForSpeech":
      return "Waiting for speech onset. Say one supported English Reader command.";
    case "speechDetected":
      return "Speech detected. Matching one Reader command.";
    case "postSpeechSilence":
      return "Speech ended. Finalizing one Reader command.";
    case "listening":
      return options.capability.experimental
        ? "Experimental voice v2 is listening. Say one supported English Reader command."
        : "Microphone active. Say one supported English Reader command.";
    case "heardCommand":
      return "Reader voice command matched.";
    case "commandNeedsFullerPhrase":
      return "Heard part of a Reader command. Say the fuller phrase.";
    case "heardSpeechNoMatch":
      return "Heard speech, but it did not match a supported Reader command.";
    case "noSignalDetected":
      return "No microphone signal was detected.";
    case "speechUnclear":
      return "The microphone heard audio, but speech was unclear.";
    case "heardNothing":
      return "Voice command listening heard nothing before it ended.";
    case "noSupportedCommandMatched":
      return "Voice command heard speech, but no supported Reader command matched.";
    case "permissionDenied":
      return "Microphone permission was denied, so Reader voice commands cannot listen.";
    case "runtimeEndedEarly":
      return "The speech-recognition runtime ended before a Reader command could be captured.";
    case "unsupported":
      return options.localSupport?.state === "optionalSetup"
        ? "Local offline voice commands need optional setup, and no browser fallback is available in this runtime."
        : options.capability.detail;
    case "unreliable":
      return "Voice commands are marked unreliable on this device/runtime.";
    case "availableToTry":
    default:
      return options.capability.state === "availableToTry"
        ? options.capability.bundledLocalRecognizer
          ? options.capability.experimental
            ? "Experimental local voice v2 is ready. Press to listen, wait for `Microphone active`, then say one Reader command."
            : "Local offline voice commands are ready. Press to listen, wait for microphone active, then say one Reader command."
          : "Voice commands are available to try with the experimental browser fallback. Say one supported English command."
        : options.capability.state === "unreliable"
          ? "Voice commands are marked unreliable on this device/runtime."
          : options.capability.detail;
  }
}

export function buildVoiceCommandSupportMessage(options: {
  capability: VoiceCommandCapability;
  localSupport: RuntimeSupportStatus["voiceCommandSupport"] | null;
}) {
  if (options.capability.state === "unsupported") {
    return options.localSupport?.state === "optionalSetup"
      ? "Keyboard shortcuts and screen readers stay primary. Local offline voice commands need optional setup here, and no browser fallback is available in this runtime."
      : "Keyboard shortcuts and screen readers stay primary. No voice-command provider is available here.";
  }

  if (options.capability.state === "unreliable") {
    return options.capability.bundledLocalRecognizer
      ? options.capability.experimental
        ? "Keyboard shortcuts and screen readers stay primary. Experimental local voice v2 stopped early and is disabled until restart."
        : "Keyboard shortcuts and screen readers stay primary. The local offline voice provider stopped early and is disabled until restart."
      : "Keyboard shortcuts and screen readers stay primary. The experimental browser fallback is disabled after ending early on this device/runtime.";
  }

  if (options.capability.bundledLocalRecognizer) {
    return options.capability.experimental
      ? "Keyboard shortcuts and screen readers stay primary. Current voice support uses the experimental local Vosk v2 path with streaming capture, VAD, and a fixed Reader command grammar."
      : "Keyboard shortcuts and screen readers stay primary. Current voice support uses the local offline Vosk provider with a fixed Reader command grammar.";
  }

  if (options.localSupport?.state === "optionalSetup") {
    return "Keyboard shortcuts and screen readers stay primary. Local offline voice commands need optional setup on this device, so Phronon is using the experimental browser fallback for now.";
  }

  if (options.localSupport?.state === "unavailable") {
    return "Keyboard shortcuts and screen readers stay primary. Local offline voice commands are unavailable on this device, so Phronon is using the experimental browser fallback.";
  }

  return "Keyboard shortcuts and screen readers stay primary. Current voice support uses the experimental browser fallback.";
}

export function buildVoiceCommandButtonLabel(options: {
  capability: VoiceCommandCapability;
  localSupport: RuntimeSupportStatus["voiceCommandSupport"] | null;
  isListening: boolean;
}) {
  if (options.isListening) {
    return "Stop listening";
  }

  if (options.capability.state === "unsupported") {
    return options.localSupport?.state === "optionalSetup" ? "Voice commands need setup" : "Voice commands unavailable";
  }

  if (options.capability.state === "unreliable") {
    return "Voice commands unreliable";
  }

  return "Press to listen";
}

export function buildVoiceCommandHelpMessage(options: {
  capability: VoiceCommandCapability;
  localSupport: RuntimeSupportStatus["voiceCommandSupport"] | null;
}) {
  if (options.capability.bundledLocalRecognizer && options.capability.state === "availableToTry") {
    return options.capability.experimental
      ? "Experimental local Vosk v2. Press `Press to listen`, wait for `Microphone active`, then say one supported English command or alias."
      : "Local offline Vosk provider. Press `Press to listen`, wait for `Microphone active`, then say one supported English command or alias.";
  }

  if (options.capability.state === "availableToTry") {
    return options.localSupport?.state === "optionalSetup"
      ? "Local offline voice commands need optional setup on this device. Phronon is using the experimental browser fallback for now."
      : "Experimental browser fallback. Press `Press to listen`, then say one supported English phrase.";
  }

  if (options.localSupport?.state === "optionalSetup") {
    return "Local offline voice commands need optional setup here, and no browser fallback is currently available.";
  }

  return "No voice-command provider is ready on this device. Keyboard shortcuts remain primary.";
}
