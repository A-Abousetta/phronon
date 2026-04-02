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

export type VoiceCommandCapabilityState = "unsupported" | "availableToTry" | "unreliable";

export type VoiceCommandCapability = {
  providerId: string;
  providerLabel: string;
  state: VoiceCommandCapabilityState;
  detail: string;
  experimental: boolean;
  bundledLocalRecognizer: boolean;
};

export type VoiceCommandProviderListeningState = "starting" | "listening";

export type VoiceCommandProviderResult =
  | {
      kind: "unsupported";
      detail: string;
      capabilityState: "unsupported";
    }
  | {
      kind: "cancelled";
      detail: string;
      capabilityState: VoiceCommandCapabilityState;
    }
  | {
      kind: "permissionDenied";
      detail: string;
      capabilityState: "availableToTry";
    }
  | {
      kind: "heardNothing";
      detail: string;
      capabilityState: "availableToTry";
    }
  | {
      kind: "heardSpeech";
      detail: string;
      transcripts: string[];
      heardText: string | null;
      capabilityState: "availableToTry";
    }
  | {
      kind: "runtimeEndedEarly";
      detail: string;
      capabilityState: "unreliable";
    };

export type VoiceCommandProvider = {
  id: string;
  label: string;
  getCapability(windowObject: Window): VoiceCommandCapability;
  listenOnce(options: {
    windowObject: Window;
    navigatorObject: Navigator;
    signal?: AbortSignal;
    onStateChange?: (state: VoiceCommandProviderListeningState) => void;
    onDiagnostic?: (eventName: string, details?: Record<string, unknown>) => void;
    earlyEndThresholdMs?: number;
  }): Promise<VoiceCommandProviderResult>;
};

type BrowserVoiceRecognitionSession = {
  recognitionStartedAt: number | null;
  audioStartedAt: number | null;
  soundStartedAt: number | null;
  speechStartedAt: number | null;
  resultHandled: boolean;
  manualStop: boolean;
  transcripts: string[];
};

type MicrophoneProbeResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason:
        | "mediaDevicesUnavailable"
        | "permissionDenied"
        | "noMicrophone"
        | "microphoneBusy"
        | "unknown";
      detail: string;
    };

type BrowserVoiceCommandProviderOptions = {
  getRecognitionConstructor?: (windowObject: Window) => BrowserSpeechRecognitionConstructor | null;
  probeMicrophoneReadiness?: (navigatorObject: Navigator) => Promise<MicrophoneProbeResult>;
  now?: () => number;
};

const browserVoiceCommandProviderId = "browserSpeechRecognition";
const browserVoiceCommandProviderLabel = "Experimental browser speech recognition";
const browserVoiceCommandAvailableMessage =
  "Voice commands are available to try with the experimental browser speech provider.";
const browserVoiceCommandUnavailableMessage =
  "Voice commands are unavailable in this Electron/Chromium runtime.";
const defaultVoiceCommandEarlyEndThresholdMs = 900;

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

export function getBrowserSpeechRecognitionConstructor(windowObject: Window) {
  const voiceRecognitionWindow = windowObject as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  return voiceRecognitionWindow.SpeechRecognition ?? voiceRecognitionWindow.webkitSpeechRecognition ?? null;
}

function clearBrowserSpeechRecognitionHandlers(recognition: BrowserSpeechRecognition) {
  recognition.onaudioend = null;
  recognition.onaudiostart = null;
  recognition.onend = null;
  recognition.onnomatch = null;
  recognition.onerror = null;
  recognition.onresult = null;
  recognition.onsoundend = null;
  recognition.onsoundstart = null;
  recognition.onspeechend = null;
  recognition.onspeechstart = null;
  recognition.onstart = null;
}

async function defaultProbeMicrophoneReadiness(navigatorObject: Navigator): Promise<MicrophoneProbeResult> {
  if (!navigatorObject.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reason: "mediaDevicesUnavailable",
      detail: "This runtime cannot open microphone capture for Reader voice commands."
    };
  }

  try {
    const stream = await navigatorObject.mediaDevices.getUserMedia({
      audio: true
    });

    stream.getTracks().forEach((track) => {
      track.stop();
    });

    return {
      ok: true
    };
  } catch (error) {
    const errorName =
      error instanceof DOMException
        ? error.name
        : error && typeof error === "object" && "name" in error && typeof error.name === "string"
          ? error.name
          : "UnknownError";
    const errorMessage =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message
          : "";

    if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError" || errorName === "SecurityError") {
      return {
        ok: false,
        reason: "permissionDenied",
        detail: errorMessage || "Microphone permission was denied before voice commands could listen."
      };
    }

    if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
      return {
        ok: false,
        reason: "noMicrophone",
        detail: errorMessage || "No microphone input device is available for Reader voice commands."
      };
    }

    if (errorName === "NotReadableError" || errorName === "TrackStartError" || errorName === "AbortError") {
      return {
        ok: false,
        reason: "microphoneBusy",
        detail: errorMessage || "The microphone could not be opened for Reader voice commands."
      };
    }

    return {
      ok: false,
      reason: "unknown",
      detail: errorMessage || `${errorName} prevented microphone access for Reader voice commands.`
    };
  }
}

export function createBrowserVoiceCommandProvider(
  options: BrowserVoiceCommandProviderOptions = {}
): VoiceCommandProvider {
  const getRecognitionConstructor = options.getRecognitionConstructor ?? getBrowserSpeechRecognitionConstructor;
  const probeMicrophoneReadiness = options.probeMicrophoneReadiness ?? defaultProbeMicrophoneReadiness;
  const now = options.now ?? (() => Date.now());

  return {
    id: browserVoiceCommandProviderId,
    label: browserVoiceCommandProviderLabel,
    getCapability(windowObject) {
      if (getRecognitionConstructor(windowObject)) {
        return {
          providerId: browserVoiceCommandProviderId,
          providerLabel: browserVoiceCommandProviderLabel,
          state: "availableToTry",
          detail: browserVoiceCommandAvailableMessage,
          experimental: true,
          bundledLocalRecognizer: false
        };
      }

      return {
        providerId: browserVoiceCommandProviderId,
        providerLabel: browserVoiceCommandProviderLabel,
        state: "unsupported",
        detail: browserVoiceCommandUnavailableMessage,
        experimental: true,
        bundledLocalRecognizer: false
      };
    },
    async listenOnce({
      windowObject,
      navigatorObject,
      signal,
      onStateChange,
      onDiagnostic,
      earlyEndThresholdMs = defaultVoiceCommandEarlyEndThresholdMs
    }) {
      const recognitionConstructor = getRecognitionConstructor(windowObject);

      if (!recognitionConstructor) {
        return {
          kind: "unsupported",
          detail: browserVoiceCommandUnavailableMessage,
          capabilityState: "unsupported"
        };
      }

      if (signal?.aborted) {
        return {
          kind: "cancelled",
          detail: "Voice command listening stopped before a command was captured.",
          capabilityState: "availableToTry"
        };
      }

      onStateChange?.("starting");

      const microphoneProbe = await probeMicrophoneReadiness(navigatorObject);
      onDiagnostic?.("microphone-probe", microphoneProbe.ok ? { ok: true } : microphoneProbe);

      if (signal?.aborted) {
        return {
          kind: "cancelled",
          detail: "Voice command listening stopped before a command was captured.",
          capabilityState: "availableToTry"
        };
      }

      if (!microphoneProbe.ok) {
        if (microphoneProbe.reason === "permissionDenied") {
          return {
            kind: "permissionDenied",
            detail: "Microphone permission was denied, so Reader voice commands cannot listen.",
            capabilityState: "availableToTry"
          };
        }

        if (microphoneProbe.reason === "mediaDevicesUnavailable") {
          return {
            kind: "runtimeEndedEarly",
            detail:
              "Speech recognition was detected, but this Electron/Chromium runtime could not keep microphone capture open.",
            capabilityState: "unreliable"
          };
        }

        return {
          kind: "unsupported",
          detail:
            microphoneProbe.reason === "noMicrophone"
              ? "No microphone input device is available for Reader voice commands."
              : "Reader voice commands could not open the microphone on this device.",
          capabilityState: "unsupported"
        };
      }

      const recognition = new recognitionConstructor();
      const session: BrowserVoiceRecognitionSession = {
        recognitionStartedAt: null,
        audioStartedAt: null,
        soundStartedAt: null,
        speechStartedAt: null,
        resultHandled: false,
        manualStop: false,
        transcripts: []
      };

      return await new Promise<VoiceCommandProviderResult>((resolve) => {
        let finished = false;

        const finish = (result: VoiceCommandProviderResult, closeMode: "abort" | "stop" | null = null) => {
          if (finished) {
            return;
          }

          finished = true;
          clearBrowserSpeechRecognitionHandlers(recognition);
          signal?.removeEventListener("abort", handleAbort);

          if (closeMode === "abort") {
            try {
              recognition.abort();
            } catch {
              // Some runtimes throw if recognition already ended.
            }
          } else if (closeMode === "stop") {
            try {
              recognition.stop();
            } catch {
              // Some runtimes throw if recognition already ended.
            }
          }

          resolve(result);
        };

        const handleAbort = () => {
          session.manualStop = true;

          try {
            recognition.abort();
          } catch {
            finish(
              {
                kind: "cancelled",
                detail: "Voice command listening stopped before a command was captured.",
                capabilityState: "availableToTry"
              },
              null
            );
          }
        };

        signal?.addEventListener("abort", handleAbort, { once: true });

        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";
        recognition.maxAlternatives = 5;

        recognition.onstart = () => {
          session.recognitionStartedAt = now();
          onStateChange?.("listening");
          onDiagnostic?.("recognition-start", {
            recognitionStartedAt: session.recognitionStartedAt
          });
        };

        recognition.onaudiostart = () => {
          session.audioStartedAt = now();
          onDiagnostic?.("audio-start", {
            audioStartedAt: session.audioStartedAt
          });
        };

        recognition.onsoundstart = () => {
          session.soundStartedAt = now();
          onDiagnostic?.("sound-start", {
            soundStartedAt: session.soundStartedAt
          });
        };

        recognition.onspeechstart = () => {
          session.speechStartedAt = now();
          onDiagnostic?.("speech-start", {
            speechStartedAt: session.speechStartedAt
          });
        };

        recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
          const result = event.results[event.resultIndex];
          const transcripts = result
            ? Array.from({ length: result.length }, (_, alternativeIndex) => result[alternativeIndex]?.transcript ?? "")
                .map((transcript) => transcript.trim())
                .filter(Boolean)
            : [];
          const heardText = transcripts[0] ?? null;

          session.resultHandled = true;
          session.transcripts = transcripts;
          onDiagnostic?.("result", {
            transcripts
          });

          finish(
            {
              kind: "heardSpeech",
              detail: heardText
                ? `Voice command heard "${heardText}".`
                : "Voice command heard speech.",
              transcripts,
              heardText,
              capabilityState: "availableToTry"
            },
            "abort"
          );
        };

        recognition.onnomatch = () => {
          onDiagnostic?.("no-match");

          finish(
            {
              kind: "heardSpeech",
              detail: "Voice command heard speech, but the browser service did not return a usable phrase.",
              transcripts: [],
              heardText: null,
              capabilityState: "availableToTry"
            },
            "abort"
          );
        };

        recognition.onerror = (event: BrowserSpeechRecognitionErrorEvent) => {
          const elapsedSinceStart =
            session.recognitionStartedAt === null ? 0 : now() - session.recognitionStartedAt;
          const endedBeforeCapture = didVoiceRecognitionEndBeforeCapture(
            session,
            elapsedSinceStart,
            earlyEndThresholdMs
          );

          onDiagnostic?.("error", {
            error: event.error,
            message: event.message ?? null,
            elapsedSinceStart
          });

          if (event.error === "aborted" && session.manualStop) {
            finish(
              {
                kind: "cancelled",
                detail: "Voice command listening stopped before a command was captured.",
                capabilityState: "availableToTry"
              },
              null
            );
            return;
          }

          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            finish(
              {
                kind: "permissionDenied",
                detail: "Microphone permission was denied, so Reader voice commands cannot listen.",
                capabilityState: "availableToTry"
              },
              null
            );
            return;
          }

          if (event.error === "no-speech") {
            finish(
              {
                kind: "heardNothing",
                detail: "Voice command listening heard nothing before it ended.",
                capabilityState: "availableToTry"
              },
              null
            );
            return;
          }

          if (event.error === "audio-capture" || event.error === "language-not-supported") {
            finish(
              {
                kind: "unsupported",
                detail: "This device cannot capture usable speech for Reader voice commands in the current runtime.",
                capabilityState: "unsupported"
              },
              null
            );
            return;
          }

          if (event.error === "network" || endedBeforeCapture) {
            finish(
              {
                kind: "runtimeEndedEarly",
                detail:
                  "The Electron/Chromium speech-recognition service ended before a Reader command could be captured.",
                capabilityState: "unreliable"
              },
              null
            );
            return;
          }

          finish(
            {
              kind: "runtimeEndedEarly",
              detail: "Voice command listening was interrupted before a Reader command could be captured.",
              capabilityState: "unreliable"
            },
            null
          );
        };

        recognition.onend = () => {
          if (finished) {
            return;
          }

          const elapsedSinceStart =
            session.recognitionStartedAt === null ? 0 : now() - session.recognitionStartedAt;
          const endedBeforeCapture = didVoiceRecognitionEndBeforeCapture(
            session,
            elapsedSinceStart,
            earlyEndThresholdMs
          );

          onDiagnostic?.("end", {
            elapsedSinceStart,
            captureActivity: hasVoiceRecognitionCaptureActivity(session),
            resultHandled: session.resultHandled,
            manualStop: session.manualStop
          });

          if (session.manualStop) {
            finish(
              {
                kind: "cancelled",
                detail: "Voice command listening stopped before a command was captured.",
                capabilityState: "availableToTry"
              },
              null
            );
            return;
          }

          if (endedBeforeCapture || session.recognitionStartedAt === null || elapsedSinceStart < earlyEndThresholdMs) {
            finish(
              {
                kind: "runtimeEndedEarly",
                detail:
                  "The Electron/Chromium speech-recognition service ended too early to capture a Reader command.",
                capabilityState: "unreliable"
              },
              null
            );
            return;
          }

          if (!session.resultHandled && session.speechStartedAt === null) {
            finish(
              {
                kind: "heardNothing",
                detail: "Voice command listening heard nothing before it ended.",
                capabilityState: "availableToTry"
              },
              null
            );
            return;
          }

          finish(
            {
              kind: "heardSpeech",
              detail: "Voice command heard speech, but no usable phrase was returned.",
              transcripts: session.transcripts,
              heardText: session.transcripts[0] ?? null,
              capabilityState: "availableToTry"
            },
            null
          );
        };

        try {
          recognition.start();
        } catch {
          finish(
            {
              kind: "runtimeEndedEarly",
              detail:
                "Speech recognition was detected, but the Electron/Chromium runtime could not keep it active.",
              capabilityState: "unreliable"
            },
            null
          );
        }
      });
    }
  };
}

export const experimentalBrowserVoiceCommandProvider = createBrowserVoiceCommandProvider();
