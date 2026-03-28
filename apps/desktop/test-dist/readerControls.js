const plainReaderShortcutMap = {
    j: "nextParagraph",
    k: "previousParagraph",
    r: "repeatCurrentParagraph",
    s: "stop"
};
export function splitIntoParagraphs(text) {
    if (!text) {
        return [];
    }
    return text
        .replace(/\r\n/g, "\n")
        .split(/\n\s*\n+/)
        .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
        .filter(Boolean);
}
export function splitParagraphIntoSpeechChunks(paragraph) {
    const normalizedParagraph = paragraph.trim();
    if (!normalizedParagraph) {
        return [];
    }
    const sentenceChunks = normalizedParagraph.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g);
    if (!sentenceChunks) {
        return [normalizedParagraph];
    }
    return sentenceChunks.map((chunk) => chunk.trim()).filter(Boolean);
}
export function getReaderShortcutAction(input) {
    const normalizedKey = input.key.toLowerCase();
    if (input.ctrlKey && !input.metaKey && !input.altKey && !input.shiftKey && normalizedKey === "o") {
        return "open";
    }
    if (!input.ctrlKey && !input.metaKey && input.altKey && !input.shiftKey) {
        if (input.key === "ArrowUp" || input.code === "ArrowUp") {
            return "increaseSpeed";
        }
        if (input.key === "ArrowDown" || input.code === "ArrowDown") {
            return "decreaseSpeed";
        }
    }
    if (!input.ctrlKey && !input.metaKey && !input.altKey && !input.shiftKey) {
        if (input.key === " " || input.code === "Space") {
            return "togglePlayPause";
        }
        return plainReaderShortcutMap[normalizedKey] ?? null;
    }
    return null;
}
export function isInteractiveElement(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="slider"]'));
}
