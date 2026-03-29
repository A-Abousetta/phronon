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
  onend: ((event: Event) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

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
      message:
        "Voice command mode is available on this device. It listens only after you press the listen button."
    };
  }

  return {
    available: false,
    message:
      "Voice command mode is unavailable on this device. Reader voice commands need browser speech recognition support."
  };
}
