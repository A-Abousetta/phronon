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

export const VOICE_COMMAND_DETECTED_MESSAGE =
  "Experimental voice commands can be tried on this device because browser speech recognition was detected. Phronon will only treat them as working after listening stays active long enough to use.";
export const VOICE_COMMAND_UNAVAILABLE_MESSAGE =
  "Experimental voice commands are unavailable on this device. Reader voice commands need browser speech recognition support.";

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
  onaudiostart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onnomatch: ((event: Event) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onspeechstart: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
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
      message: VOICE_COMMAND_DETECTED_MESSAGE
    };
  }

  return {
    available: false,
    message: VOICE_COMMAND_UNAVAILABLE_MESSAGE
  };
}
