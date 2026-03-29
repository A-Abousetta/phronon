import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVoiceDiagnosticsSummary, chooseSpeechVoice, findArabicVoice, findDefaultVoice, findVoiceById, getVoiceIdentifier, getVoiceDisplayName, isArabicCapableVoice, textContainsArabicScript } from "./speechVoices.js";
function createVoice(overrides) {
    return {
        default: false,
        lang: "",
        localService: true,
        name: "",
        voiceURI: "",
        ...overrides
    };
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
    const englishDefault = createVoice({ name: "English Default", lang: "en-US", default: true, voiceURI: "default-uri" });
    const arabic = createVoice({ name: "Arabic Reader", lang: "ar-EG", voiceURI: "arabic-uri" });
    const voices = [englishDefault, arabic];
    assert.equal(findDefaultVoice(voices), englishDefault);
    assert.equal(findArabicVoice(voices), arabic);
    assert.equal(getVoiceIdentifier(arabic), "uri:arabic-uri");
    assert.equal(findVoiceById(voices, "uri:arabic-uri"), arabic);
    assert.equal(getVoiceDisplayName(arabic), "Arabic Reader (ar-EG)");
});
test("chooseSpeechVoice prefers Arabic for Arabic text and falls back safely", () => {
    const englishDefault = createVoice({ name: "English Default", lang: "en-US", default: true });
    const arabic = createVoice({ name: "Arabic Reader", lang: "ar-SA" });
    assert.deepEqual(chooseSpeechVoice({
        voices: [englishDefault, arabic],
        text: "مرحبا بكم",
        preference: "automatic"
    }), {
        voice: arabic,
        detectedLanguage: "arabic",
        warning: null
    });
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
    for (const preference of ["automatic", "default"]) {
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
test("chooseSpeechVoice allows a manual preferred voice and falls back clearly", () => {
    const englishDefault = createVoice({ name: "English Default", lang: "en-US", default: true, voiceURI: "default-uri" });
    const manualVoice = createVoice({ name: "Manual Voice", lang: "en-GB", voiceURI: "manual-uri" });
    const manualChoice = chooseSpeechVoice({
        voices: [englishDefault, manualVoice],
        text: "مرحبا",
        preference: "manual",
        preferredVoiceId: "uri:manual-uri"
    });
    assert.equal(manualChoice.voice, manualVoice);
    assert.equal(manualChoice.detectedLanguage, "manual");
    assert.equal(manualChoice.warning, null);
    const fallbackChoice = chooseSpeechVoice({
        voices: [englishDefault],
        text: "Hello",
        preference: "manual",
        preferredVoiceId: "uri:missing-uri"
    });
    assert.equal(fallbackChoice.voice, englishDefault);
    assert.equal(fallbackChoice.detectedLanguage, "manual");
    assert.match(fallbackChoice.warning ?? "", /preferred playback voice is no longer available/i);
    const systemDefaultChoice = chooseSpeechVoice({
        voices: [englishDefault],
        text: "Hello",
        preference: "manual",
        preferredVoiceId: null
    });
    assert.equal(systemDefaultChoice.voice, englishDefault);
    assert.equal(systemDefaultChoice.warning, null);
});
test("buildVoiceDiagnosticsSummary describes voice availability clearly", () => {
    const englishDefault = createVoice({ name: "English Default", lang: "en-US", default: true });
    const arabic = createVoice({ name: "Arabic Reader", lang: "ar-SA" });
    assert.equal(buildVoiceDiagnosticsSummary([], false), "Checking available speech voices on this device.");
    assert.equal(buildVoiceDiagnosticsSummary([], true), "No speech voices were reported by the system yet.");
    assert.equal(buildVoiceDiagnosticsSummary([englishDefault, arabic], true), "2 speech voices detected, including Arabic support.");
});
