import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chooseSpeechVoice,
  findArabicVoice,
  findDefaultVoice,
  isArabicCapableVoice,
  textContainsArabicScript,
  type SpeechVoicePreference
} from "./speechVoices.js";

type MockVoice = SpeechSynthesisVoice;

function createVoice(overrides: Partial<MockVoice>): MockVoice {
  return {
    default: false,
    lang: "",
    localService: true,
    name: "",
    voiceURI: "",
    ...overrides
  } as MockVoice;
}

test("textContainsArabicScript detects Arabic text without full language detection", () => {
  assert.equal(textContainsArabicScript("Hello world"), false);
  assert.equal(textContainsArabicScript("مرحبا بالعالم"), true);
  assert.equal(textContainsArabicScript("Exam 1 - الفصل الأول"), true);
});

test("isArabicCapableVoice accepts Arabic language codes and fallback names", () => {
  assert.equal(isArabicCapableVoice(createVoice({ lang: "ar-SA", name: "Arabic voice" })), true);
  assert.equal(isArabicCapableVoice(createVoice({ lang: "", name: "Microsoft Hoda - العربية" })), true);
  assert.equal(isArabicCapableVoice(createVoice({ lang: "en-US", name: "English Voice" })), false);
});

test("voice helpers prefer explicit default and Arabic matches when available", () => {
  const englishDefault = createVoice({ name: "English Default", lang: "en-US", default: true });
  const arabic = createVoice({ name: "Arabic Reader", lang: "ar-EG" });
  const voices = [englishDefault, arabic];

  assert.equal(findDefaultVoice(voices), englishDefault);
  assert.equal(findArabicVoice(voices), arabic);
});

test("chooseSpeechVoice prefers Arabic for Arabic text and falls back safely", () => {
  const englishDefault = createVoice({ name: "English Default", lang: "en-US", default: true });
  const arabic = createVoice({ name: "Arabic Reader", lang: "ar-SA" });

  assert.deepEqual(
    chooseSpeechVoice({
      voices: [englishDefault, arabic],
      text: "مرحبا بكم",
      preference: "automatic"
    }),
    {
      voice: arabic,
      detectedLanguage: "arabic",
      warning: null
    }
  );

  const fallbackChoice = chooseSpeechVoice({
    voices: [englishDefault],
    text: "مرحبا بكم",
    preference: "automatic"
  });

  assert.equal(fallbackChoice.voice, englishDefault);
  assert.equal(fallbackChoice.detectedLanguage, "arabic");
  assert.match(fallbackChoice.warning ?? "", /Arabic text was detected/i);
});

test("chooseSpeechVoice keeps the default voice for non-Arabic text or default mode", () => {
  const englishDefault = createVoice({ name: "English Default", lang: "en-US", default: true });
  const arabic = createVoice({ name: "Arabic Reader", lang: "ar-SA" });

  for (const preference of ["automatic", "default"] as SpeechVoicePreference[]) {
    const choice = chooseSpeechVoice({
      voices: [englishDefault, arabic],
      text: preference === "default" ? "مرحبا بكم" : "Hello world",
      preference
    });

    assert.equal(choice.voice, englishDefault);
    assert.equal(choice.warning, null);
    assert.equal(choice.detectedLanguage, "default");
  }
});
