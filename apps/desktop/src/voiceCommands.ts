export type VoiceReaderCommand =
  | "openFile"
  | "play"
  | "pause"
  | "stop"
  | "nextParagraph"
  | "previousParagraph"
  | "repeatParagraph"
  | "faster"
  | "slower";

export type VoiceRecognitionAvailability = {
  available: boolean;
  message: string;
};

export type VoiceCommandTrustState = "unsupported" | "detected" | "confirmed" | "unreliable";

export const VOICE_COMMAND_DETECTED_MESSAGE = "Voice commands are available to try on this device.";
export const VOICE_COMMAND_UNAVAILABLE_MESSAGE = "Voice commands are unavailable on this device.";

export type BrowserSpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

export type BrowserSpeechRecognitionResult = {
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
};

export type BrowserSpeechRecognitionResultList = {
  [index: number]: BrowserSpeechRecognitionResult;
};

export type BrowserSpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
};

export type BrowserSpeechRecognitionErrorEvent = Event & {
  error: string;
  message?: string;
};

export type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((event: Event) => void) | null;
  onaudiostart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onnomatch: ((event: Event) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onsoundend: ((event: Event) => void) | null;
  onsoundstart: ((event: Event) => void) | null;
  onspeechend: ((event: Event) => void) | null;
  onspeechstart: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export type VoiceRecognitionLifecycleSnapshot = {
  recognitionStartedAt: number | null;
  audioStartedAt: number | null;
  soundStartedAt: number | null;
  speechStartedAt: number | null;
  resultHandled: boolean;
};

const transcriptCommandMap: Record<string, VoiceReaderCommand> = {
  "open file": "openFile",
  play: "play",
  pause: "pause",
  stop: "stop",
  "next paragraph": "nextParagraph",
  "previous paragraph": "previousParagraph",
  "repeat paragraph": "repeatParagraph",
  faster: "faster",
  slower: "slower"
};

export function normalizeVoiceTranscript(transcript: string) {
  return transcript
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getVoiceReaderCommand(transcript: string) {
  const normalizedTranscript = normalizeVoiceTranscript(transcript);

  if (!normalizedTranscript) {
    return null;
  }

  return transcriptCommandMap[normalizedTranscript] ?? null;
}

export function hasVoiceRecognitionCaptureActivity(snapshot: VoiceRecognitionLifecycleSnapshot) {
  return (
    snapshot.audioStartedAt !== null ||
    snapshot.soundStartedAt !== null ||
    snapshot.speechStartedAt !== null ||
    snapshot.resultHandled
  );
}

export function didVoiceRecognitionEndBeforeCapture(
  snapshot: VoiceRecognitionLifecycleSnapshot,
  elapsedSinceStartMs: number,
  earlyEndThresholdMs: number
) {
  return (
    snapshot.recognitionStartedAt !== null &&
    elapsedSinceStartMs < earlyEndThresholdMs &&
    !hasVoiceRecognitionCaptureActivity(snapshot)
  );
}

export function getVoiceRecognitionConstructor(windowObject: Window) {
  const voiceRecognitionWindow = windowObject as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  return voiceRecognitionWindow.SpeechRecognition ?? voiceRecognitionWindow.webkitSpeechRecognition ?? null;
}

export function getVoiceRecognitionAvailability(windowObject: Window): VoiceRecognitionAvailability {
  if (getVoiceRecognitionConstructor(windowObject)) {
    return {
      available: true,
      message: VOICE_COMMAND_DETECTED_MESSAGE
    };
  }

  return {
    available: false,
    message: VOICE_COMMAND_UNAVAILABLE_MESSAGE
  };
}

export function buildVoiceCommandIdleMessage(options: {
  availabilityMessage: string;
  trustState: VoiceCommandTrustState;
}) {
  switch (options.trustState) {
    case "unsupported":
      return options.availabilityMessage;
    case "confirmed":
      return "Voice commands worked in this session. One exact English command per press.";
    case "unreliable":
      return "Voice commands are unavailable here. Listening stopped before any speech was captured.";
    case "detected":
    default:
      return `${options.availabilityMessage} Still experimental until listening stays active.`;
  }
}

export function buildVoiceCommandSupportMessage(options: {
  interactionDisabled: boolean;
  trustState: VoiceCommandTrustState;
}) {
  if (options.trustState === "unsupported") {
    return "Keyboard shortcuts and screen readers stay primary. Voice support needs browser speech recognition.";
  }

  if (options.trustState === "unreliable" && options.interactionDisabled) {
    return "Keyboard shortcuts and screen readers stay primary. Voice listening was not reliable here.";
  }

  return "Keyboard shortcuts and screen readers stay primary. Voice commands stay experimental.";
}
