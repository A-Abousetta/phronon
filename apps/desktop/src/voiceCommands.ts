import type { VoiceCommandCapabilityState } from "./voiceCommandProvider.js";

export type VoiceCommandUiState =
  | "starting"
  | "unsupported"
  | "availableToTry"
  | "listening"
  | "heardCommand"
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
  capabilityState: VoiceCommandCapabilityState;
  status: VoiceCommandStatus;
}) {
  if (options.status.detail?.trim()) {
    return options.status.detail;
  }

  switch (options.status.state) {
    case "starting":
      return "Checking microphone access for one Reader voice command.";
    case "listening":
      return "Listening for one exact English Reader command.";
    case "heardCommand":
      return "Reader voice command matched.";
    case "heardNothing":
      return "Voice command listening heard nothing before it ended.";
    case "noSupportedCommandMatched":
      return "Voice command heard speech, but no supported Reader command matched.";
    case "permissionDenied":
      return "Microphone permission was denied, so Reader voice commands cannot listen.";
    case "runtimeEndedEarly":
      return "The speech-recognition runtime ended before a Reader command could be captured.";
    case "unsupported":
      return "Voice commands are unavailable in this Electron/Chromium runtime.";
    case "unreliable":
      return "Voice commands are marked unreliable on this device/runtime.";
    case "availableToTry":
    default:
      return options.capabilityState === "availableToTry"
        ? "Voice commands are available to try with the experimental browser provider. Say one exact English command."
        : options.capabilityState === "unreliable"
          ? "Voice commands are marked unreliable on this device/runtime."
          : "Voice commands are unavailable in this Electron/Chromium runtime.";
  }
}

export function buildVoiceCommandSupportMessage(options: {
  capabilityState: VoiceCommandCapabilityState;
}) {
  if (options.capabilityState === "unsupported") {
    return "Keyboard shortcuts and screen readers stay primary. No voice-command provider is available here.";
  }

  if (options.capabilityState === "unreliable") {
    return "Keyboard shortcuts and screen readers stay primary. The experimental browser provider is disabled after ending early on this device/runtime.";
  }

  return "Keyboard shortcuts and screen readers stay primary. Current voice support uses the experimental browser provider, not a bundled local recognizer.";
}

export function buildVoiceCommandButtonLabel(options: {
  capabilityState: VoiceCommandCapabilityState;
  isListening: boolean;
}) {
  if (options.isListening) {
    return "Stop listening";
  }

  if (options.capabilityState === "unsupported") {
    return "Voice commands unavailable";
  }

  if (options.capabilityState === "unreliable") {
    return "Voice commands unreliable";
  }

  return "Listen for one command";
}
