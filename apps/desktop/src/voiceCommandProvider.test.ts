import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createBrowserVoiceCommandProvider,
  type BrowserSpeechRecognition,
  type BrowserSpeechRecognitionConstructor,
  type BrowserSpeechRecognitionErrorEvent,
  type BrowserSpeechRecognitionEvent
} from "./voiceCommandProvider.js";

class FakeRecognition extends EventTarget implements BrowserSpeechRecognition {
  static lastInstance: FakeRecognition | null = null;
  static throwOnStart = false;

  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;
  onaudioend: ((event: Event) => void) | null = null;
  onaudiostart: ((event: Event) => void) | null = null;
  onend: ((event: Event) => void) | null = null;
  onnomatch: ((event: Event) => void) | null = null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null = null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null = null;
  onsoundend: ((event: Event) => void) | null = null;
  onsoundstart: ((event: Event) => void) | null = null;
  onspeechend: ((event: Event) => void) | null = null;
  onspeechstart: ((event: Event) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;

  constructor() {
    super();
    FakeRecognition.lastInstance = this;
  }

  start() {
    if (FakeRecognition.throwOnStart) {
      throw new Error("start failed");
    }
  }

  stop() {}

  abort() {
    this.onerror?.({
      error: "aborted"
    } as BrowserSpeechRecognitionErrorEvent);
    this.onend?.(new Event("end"));
  }
}

function createHeardSpeechEvent(transcripts: string[]): BrowserSpeechRecognitionEvent {
  const result = {
    length: transcripts.length
  } as {
    length: number;
    [index: number]: {
      transcript: string;
      confidence: number;
    };
  };

  transcripts.forEach((transcript, index) => {
    result[index] = {
      transcript,
      confidence: 0.9
    };
  });

  return {
    resultIndex: 0,
    results: {
      0: result
    }
  } as unknown as BrowserSpeechRecognitionEvent;
}

function createProvider(options?: {
  probeResult?:
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
  now?: () => number;
}) {
  return createBrowserVoiceCommandProvider({
    getRecognitionConstructor: () => FakeRecognition as unknown as BrowserSpeechRecognitionConstructor,
    probeMicrophoneReadiness: async () => options?.probeResult ?? { ok: true },
    now: options?.now
  });
}

test("browser voice provider reports when speech recognition is available to try", () => {
  const provider = createProvider();

  assert.deepEqual(provider.getCapability({} as Window), {
    providerId: "browserSpeechRecognition",
    providerLabel: "Experimental browser speech recognition",
    state: "availableToTry",
    detail: "Voice commands are available to try with the experimental browser speech provider.",
    experimental: true,
    bundledLocalRecognizer: false
  });
});

test("browser voice provider surfaces permission denial before listening starts", async () => {
  const provider = createProvider({
    probeResult: {
      ok: false,
      reason: "permissionDenied",
      detail: "denied"
    }
  });

  const result = await provider.listenOnce({
    windowObject: {} as Window,
    navigatorObject: {} as Navigator
  });

  assert.deepEqual(result, {
    kind: "permissionDenied",
    detail: "Microphone permission was denied, so Reader voice commands cannot listen.",
    capabilityState: "availableToTry"
  });
});

test("browser voice provider returns heard speech transcripts for parser matching", async () => {
  const provider = createProvider();
  const listeningPromise = provider.listenOnce({
    windowObject: {} as Window,
    navigatorObject: {} as Navigator
  });

  await Promise.resolve();
  const recognition = FakeRecognition.lastInstance;
  assert.ok(recognition);
  recognition.onstart?.(new Event("start"));
  recognition.onresult?.(createHeardSpeechEvent(["noise", "jump to search"]));

  const result = await listeningPromise;

  assert.deepEqual(result, {
    kind: "heardSpeech",
    detail: 'Voice command heard "noise".',
    transcripts: ["noise", "jump to search"],
    heardText: "noise",
    capabilityState: "availableToTry"
  });
});

test("browser voice provider classifies no-speech as heard nothing", async () => {
  const provider = createProvider();
  const listeningPromise = provider.listenOnce({
    windowObject: {} as Window,
    navigatorObject: {} as Navigator
  });

  await Promise.resolve();
  const recognition = FakeRecognition.lastInstance;
  assert.ok(recognition);
  recognition.onstart?.(new Event("start"));
  recognition.onerror?.({
    error: "no-speech"
  } as BrowserSpeechRecognitionErrorEvent);

  const result = await listeningPromise;

  assert.deepEqual(result, {
    kind: "heardNothing",
    detail: "Voice command listening heard nothing before it ended.",
    capabilityState: "availableToTry"
  });
});

test("browser voice provider marks early end failures as unreliable", async () => {
  let currentTime = 1_000;
  const provider = createProvider({
    now: () => currentTime
  });
  const listeningPromise = provider.listenOnce({
    windowObject: {} as Window,
    navigatorObject: {} as Navigator
  });

  await Promise.resolve();
  const recognition = FakeRecognition.lastInstance;
  assert.ok(recognition);
  recognition.onstart?.(new Event("start"));
  currentTime = 1_150;
  recognition.onend?.(new Event("end"));

  const result = await listeningPromise;

  assert.deepEqual(result, {
    kind: "runtimeEndedEarly",
    detail: "The Electron/Chromium speech-recognition service ended too early to capture a Reader command.",
    capabilityState: "unreliable"
  });
});

test("browser voice provider resolves cancellation when listening is aborted by the user", async () => {
  const provider = createProvider();
  const abortController = new AbortController();
  const listeningPromise = provider.listenOnce({
    windowObject: {} as Window,
    navigatorObject: {} as Navigator,
    signal: abortController.signal
  });

  await Promise.resolve();
  const recognition = FakeRecognition.lastInstance;
  assert.ok(recognition);
  recognition.onstart?.(new Event("start"));
  abortController.abort();

  const result = await listeningPromise;

  assert.deepEqual(result, {
    kind: "cancelled",
    detail: "Voice command listening stopped before a command was captured.",
    capabilityState: "availableToTry"
  });
});
