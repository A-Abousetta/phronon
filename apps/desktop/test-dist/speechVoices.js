const ARABIC_SCRIPT_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_LANGUAGE_PATTERN = /\bar(?:[-_][a-z0-9]+)?\b/i;
const ARABIC_NAME_PATTERN = /\b(arabic)\b|\u0627\u0644\u0639\u0631\u0628\u064a\u0629|\u0639\u0631\u0628\u064a/i;
function normalizeVoiceTextPart(value) {
    return typeof value === "string" ? value.trim() : "";
}
function buildVoiceSearchText(voice) {
    return [voice.name, voice.lang, voice.voiceURI].map(normalizeVoiceTextPart).filter(Boolean).join(" ");
}
export function textContainsArabicScript(text) {
    if (!text) {
        return false;
    }
    return ARABIC_SCRIPT_PATTERN.test(text);
}
export function isArabicCapableVoice(voice) {
    const normalizedLanguage = normalizeVoiceTextPart(voice.lang);
    if (ARABIC_LANGUAGE_PATTERN.test(normalizedLanguage)) {
        return true;
    }
    return ARABIC_NAME_PATTERN.test(buildVoiceSearchText(voice));
}
export function findDefaultVoice(voices) {
    return voices.find((voice) => Boolean(voice.default)) ?? voices[0] ?? null;
}
export function findArabicVoice(voices) {
    const arabicVoices = voices.filter((voice) => isArabicCapableVoice(voice));
    return arabicVoices.find((voice) => Boolean(voice.default)) ?? arabicVoices[0] ?? null;
}
export function chooseSpeechVoice(options) {
    const wantsArabicVoice = options.preference !== "default" && textContainsArabicScript(options.text);
    const defaultVoice = findDefaultVoice(options.voices);
    const arabicVoice = findArabicVoice(options.voices);
    if (wantsArabicVoice && arabicVoice) {
        return {
            voice: arabicVoice,
            detectedLanguage: "arabic",
            warning: null
        };
    }
    if (wantsArabicVoice) {
        return {
            voice: defaultVoice,
            detectedLanguage: "arabic",
            warning: "Arabic text was detected, but this device does not report an Arabic speech voice. Playback will keep using the default voice and may sound incorrect."
        };
    }
    return {
        voice: defaultVoice,
        detectedLanguage: "default",
        warning: null
    };
}
