const plainReaderShortcutMap = {
    j: "nextParagraph",
    k: "previousParagraph",
    r: "repeatCurrentParagraph",
    s: "stop"
};
function normalizeLine(line) {
    return line.replace(/\s+/g, " ").trim();
}
function looksLikeStructuralLine(line) {
    return /^[-*•]\s+/.test(line) || /^\d+[\.\)]\s+/.test(line) || /[:;]$/.test(line);
}
function shouldMergeLines(currentLine, nextLine) {
    const current = normalizeLine(currentLine);
    const next = normalizeLine(nextLine);
    if (!current || !next) {
        return false;
    }
    if (looksLikeStructuralLine(current) || looksLikeStructuralLine(next)) {
        return false;
    }
    const currentEndsWithSentencePunctuation = /[.!?]["')\]]?$/.test(current);
    const currentEndsWithSoftWrapHint = /[,:\-\u2013\u2014]$/.test(current);
    const nextStartsLowercase = /^[a-z(]/.test(next);
    const currentLooksShort = current.length <= 90;
    const nextLooksShort = next.length <= 90;
    if (currentEndsWithSoftWrapHint) {
        return true;
    }
    if (!currentEndsWithSentencePunctuation && (nextStartsLowercase || currentLooksShort || nextLooksShort)) {
        return true;
    }
    return false;
}
function buildParagraphFromBlock(block) {
    const lines = block
        .split("\n")
        .map(normalizeLine)
        .filter(Boolean);
    if (lines.length === 0) {
        return [];
    }
    const paragraphs = [];
    let currentParagraph = lines[0];
    for (const nextLine of lines.slice(1)) {
        if (shouldMergeLines(currentParagraph, nextLine)) {
            currentParagraph = `${currentParagraph} ${nextLine}`.trim();
            continue;
        }
        paragraphs.push(currentParagraph);
        currentParagraph = nextLine;
    }
    paragraphs.push(currentParagraph);
    return paragraphs;
}
export function splitIntoParagraphs(text) {
    if (!text) {
        return [];
    }
    return text
        .replace(/\r\n/g, "\n")
        .split(/\n\s*\n+/)
        .flatMap((block) => buildParagraphFromBlock(block))
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
export function getAppShortcutAction(input) {
    const normalizedKey = input.key.toLowerCase();
    if (input.ctrlKey && !input.metaKey && !input.altKey && !input.shiftKey && normalizedKey === "o") {
        return "openDocument";
    }
    return null;
}
export function getReaderShortcutAction(input) {
    const normalizedKey = input.key.toLowerCase();
    if (getAppShortcutAction(input)) {
        return null;
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
