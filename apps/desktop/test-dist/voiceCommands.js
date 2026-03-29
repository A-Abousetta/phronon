const transcriptCommandMap = {
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
export function normalizeVoiceTranscript(transcript) {
    return transcript
        .toLowerCase()
        .replace(/[.,!?;:]+/g, " ")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
export function getVoiceReaderCommand(transcript) {
    const normalizedTranscript = normalizeVoiceTranscript(transcript);
    if (!normalizedTranscript) {
        return null;
    }
    return transcriptCommandMap[normalizedTranscript] ?? null;
}
export function getVoiceRecognitionConstructor(windowObject) {
    const voiceRecognitionWindow = windowObject;
    return voiceRecognitionWindow.SpeechRecognition ?? voiceRecognitionWindow.webkitSpeechRecognition ?? null;
}
export function getVoiceRecognitionAvailability(windowObject) {
    if (getVoiceRecognitionConstructor(windowObject)) {
        return {
            available: true,
            message: "Voice command mode is available on this device. It listens only after you press the listen button."
        };
    }
    return {
        available: false,
        message: "Voice command mode is unavailable on this device. Reader voice commands need browser speech recognition support."
    };
}
