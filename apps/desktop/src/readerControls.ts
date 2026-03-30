export type AppShortcutAction = "openDocument";

export type ReaderShortcutAction =
  | "togglePlayPause"
  | "stop"
  | "nextParagraph"
  | "previousParagraph"
  | "repeatCurrentParagraph"
  | "increaseSpeed"
  | "decreaseSpeed";

export type ParagraphSearchMatch = {
  paragraphIndex: number;
  startIndex: number;
  endIndex: number;
};

export type ReaderShortcutInput = {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

const plainReaderShortcutMap: Record<string, Exclude<ReaderShortcutAction, "togglePlayPause">> = {
  j: "nextParagraph",
  k: "previousParagraph",
  r: "repeatCurrentParagraph",
  s: "stop"
};

function normalizeLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function looksLikeStructuralLine(line: string) {
  return /^[-*\u2022]\s+/.test(line) || /^\d+[\.\)]\s+/.test(line) || /[:;]$/.test(line);
}

function looksLikeHeading(line: string) {
  const normalizedLine = normalizeLine(line);

  if (!normalizedLine || normalizedLine.length > 80) {
    return false;
  }

  return (
    /^[A-Z0-9\s"'&/()-]+$/.test(normalizedLine) ||
    /^chapter\s+\d+/i.test(normalizedLine) ||
    /^section\s+\d+/i.test(normalizedLine)
  );
}

function shouldMergeLines(currentLine: string, nextLine: string) {
  const current = normalizeLine(currentLine);
  const next = normalizeLine(nextLine);

  if (!current || !next) {
    return false;
  }

  if (looksLikeStructuralLine(current) || looksLikeStructuralLine(next) || looksLikeHeading(next)) {
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

function buildParagraphFromBlock(block: string) {
  const lines = block
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const paragraphs: string[] = [];
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

function splitParagraphBySentenceGroups(paragraph: string) {
  const normalizedParagraph = normalizeLine(paragraph);

  if (!normalizedParagraph) {
    return [];
  }

  if (looksLikeStructuralLine(normalizedParagraph) || looksLikeHeading(normalizedParagraph)) {
    return [normalizedParagraph];
  }

  const sentenceParts = normalizedParagraph
    .match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)
    ?.map((part) => part.trim())
    .filter(Boolean);

  if (sentenceParts && sentenceParts.length > 1) {
    const groupedParagraphs: string[] = [];
    let currentGroup = "";
    let currentSentenceCount = 0;

    for (const sentence of sentenceParts) {
      const nextGroup = currentGroup ? `${currentGroup} ${sentence}` : sentence;
      const shouldSplitBeforeSentence =
        currentGroup.length > 0 &&
        (nextGroup.length > 340 || currentSentenceCount >= 3);

      if (shouldSplitBeforeSentence) {
        groupedParagraphs.push(currentGroup);
        currentGroup = sentence;
        currentSentenceCount = 1;
        continue;
      }

      currentGroup = nextGroup;
      currentSentenceCount += 1;
    }

    if (currentGroup) {
      groupedParagraphs.push(currentGroup);
    }

    return groupedParagraphs;
  }

  const words = normalizedParagraph.split(/\s+/).filter(Boolean);

  if (words.length <= 70) {
    return [normalizedParagraph];
  }

  const groupedParagraphs: string[] = [];
  let currentWords: string[] = [];

  for (const word of words) {
    currentWords.push(word);

    if (currentWords.length >= 55) {
      groupedParagraphs.push(currentWords.join(" "));
      currentWords = [];
    }
  }

  if (currentWords.length > 0) {
    if (groupedParagraphs.length > 0 && currentWords.length < 18) {
      groupedParagraphs[groupedParagraphs.length - 1] = `${groupedParagraphs[groupedParagraphs.length - 1]} ${currentWords.join(" ")}`;
    } else {
      groupedParagraphs.push(currentWords.join(" "));
    }
  }

  return groupedParagraphs;
}

export function splitIntoParagraphs(text: string | null) {
  if (!text) {
    return [];
  }

  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .flatMap((block) => buildParagraphFromBlock(block))
    .flatMap((paragraph) => splitParagraphBySentenceGroups(paragraph))
    .filter(Boolean);
}

export function splitParagraphIntoSpeechChunks(paragraph: string) {
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

function normalizeSearchQuery(query: string) {
  return query.trim().toLocaleLowerCase();
}

export function findParagraphSearchMatches(paragraphs: string[], query: string): ParagraphSearchMatch[] {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const matches: ParagraphSearchMatch[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const normalizedParagraph = paragraph.toLocaleLowerCase();
    let searchStartIndex = 0;

    while (searchStartIndex < normalizedParagraph.length) {
      const matchStartIndex = normalizedParagraph.indexOf(normalizedQuery, searchStartIndex);

      if (matchStartIndex === -1) {
        break;
      }

      matches.push({
        paragraphIndex,
        startIndex: matchStartIndex,
        endIndex: matchStartIndex + normalizedQuery.length
      });
      searchStartIndex = matchStartIndex + normalizedQuery.length;
    }
  });

  return matches;
}

export function getAppShortcutAction(input: ReaderShortcutInput): AppShortcutAction | null {
  const normalizedKey = input.key.toLowerCase();

  if (input.ctrlKey && !input.metaKey && !input.altKey && !input.shiftKey && normalizedKey === "o") {
    return "openDocument";
  }

  return null;
}

export function getReaderShortcutAction(input: ReaderShortcutInput): ReaderShortcutAction | null {
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

export function isInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="slider"]'
    )
  );
}
