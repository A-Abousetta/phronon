export type ReaderRegionStatusId = "document" | "playback" | "search" | "highlights" | "bookmarks" | "help";

type ReaderRegionStatusOptions = {
  activeRegion: ReaderRegionStatusId;
  activeRegionLabel: string;
  hasText: boolean;
  paragraphIndex: number;
  paragraphCount: number;
  searchQuery: string;
  searchMatchCount: number;
  highlightCount: number;
  bookmarkCount: number;
};

type ReaderSearchStatusOptions = {
  isLoading: boolean;
  hasText: boolean;
  searchQuery: string;
  searchMatchCount: number;
  activeSearchMatchIndex: number;
  activeSearchParagraphIndex: number | null;
};

type ReaderSearchResultAnnouncementOptions = {
  matchIndex: number;
  matchCount: number;
  paragraphIndex: number;
};

type ReaderSavedItemAnnouncementOptions = {
  kind: "Bookmark" | "Highlight";
  itemIndex: number;
  itemCount: number;
  paragraphIndex: number;
  hasNote: boolean;
};

type ReaderDocumentReturnAnnouncementOptions = {
  hasText: boolean;
  paragraphIndex: number;
  sourceRegionLabel: string | null;
  activeSearchMatchIndex: number;
  activeSearchMatchCount: number;
  activeSearchParagraphIndex: number | null;
  activeHighlightParagraphIndex: number | null;
  activeHighlightHasNote: boolean;
  activeBookmarkParagraphIndex: number | null;
  activeBookmarkHasNote: boolean;
};

type ReaderBookmarkHintOptions = {
  hasBookmark: boolean;
  hasNote: boolean;
};

type ReaderHighlightHintOptions = {
  hasText: boolean;
  selectedParagraphIndex: number | null;
  selectedTextPreview: string | null;
  activeHighlightParagraphIndex: number | null;
  activeHighlightPreview: string | null;
};

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildReaderRegionStatusMessage(options: ReaderRegionStatusOptions) {
  const label = options.activeRegionLabel.toLowerCase();
  const paragraphNumber = options.paragraphIndex + 1;

  switch (options.activeRegion) {
    case "document":
      return options.hasText
        ? `In ${label}. Paragraph ${paragraphNumber} of ${options.paragraphCount}.`
        : `In ${label}. Open a file to start reading.`;
    case "playback":
      return options.hasText
        ? `In ${label}. Ready at paragraph ${paragraphNumber} of ${options.paragraphCount}.`
        : `In ${label}. Open a file to start reading.`;
    case "search":
      if (!options.hasText) {
        return `In ${label}. Open a file to search it.`;
      }

      if (!options.searchQuery) {
        return `In ${label}. Query field ready.`;
      }

      return options.searchMatchCount > 0
        ? `In ${label}. ${formatCount(options.searchMatchCount, "match", "matches")} for "${options.searchQuery}".`
        : `In ${label}. No matches for "${options.searchQuery}".`;
    case "highlights":
      return options.highlightCount > 0
        ? `In ${label}. ${formatCount(options.highlightCount, "saved highlight")}.`
        : `In ${label}. No saved highlights yet.`;
    case "bookmarks":
      return options.bookmarkCount > 0
        ? `In ${label}. ${formatCount(options.bookmarkCount, "saved marker")}.`
        : `In ${label}. No saved markers yet.`;
    case "help":
      return `In ${label}. Landmark jumps and Reader keys are here.`;
  }
}

export function buildReaderSearchStatusMessage(options: ReaderSearchStatusOptions) {
  if (options.isLoading) {
    return "Search will be ready when loading finishes.";
  }

  if (!options.hasText) {
    return "Open a file to search it.";
  }

  if (!options.searchQuery) {
    return "Type a word or phrase, then press Search.";
  }

  if (options.searchMatchCount === 0) {
    return `No matches for "${options.searchQuery}".`;
  }

  if (options.activeSearchParagraphIndex !== null && options.activeSearchMatchIndex >= 0) {
    return buildReaderSearchResultAnnouncement({
      matchIndex: options.activeSearchMatchIndex,
      matchCount: options.searchMatchCount,
      paragraphIndex: options.activeSearchParagraphIndex
    });
  }

  return `${formatCount(options.searchMatchCount, "match", "matches")} for "${options.searchQuery}".`;
}

export function buildReaderSearchResultAnnouncement(options: ReaderSearchResultAnnouncementOptions) {
  if (options.matchCount === 0) {
    return "No search results yet.";
  }

  return `Match ${options.matchIndex + 1} of ${options.matchCount} at paragraph ${options.paragraphIndex + 1}.`;
}

export function buildReaderSavedItemAnnouncement(options: ReaderSavedItemAnnouncementOptions) {
  return `${options.kind} ${options.itemIndex + 1} of ${options.itemCount} at paragraph ${options.paragraphIndex + 1}.${options.hasNote ? " Note ready." : ""}`;
}

export function buildReaderDocumentReturnAnnouncement(options: ReaderDocumentReturnAnnouncementOptions) {
  if (!options.hasText) {
    return "Reader text will be ready after a document is loaded.";
  }

  const paragraphNumber = options.paragraphIndex + 1;
  const messageParts = [
    options.sourceRegionLabel
      ? `Back in document from ${options.sourceRegionLabel.toLowerCase()} at paragraph ${paragraphNumber}.`
      : `In document at paragraph ${paragraphNumber}.`
  ];

  if (
    options.activeSearchParagraphIndex === options.paragraphIndex &&
    options.activeSearchMatchIndex >= 0 &&
    options.activeSearchMatchCount > 0
  ) {
    messageParts.push(
      `Match ${options.activeSearchMatchIndex + 1} of ${options.activeSearchMatchCount} is still here.`
    );
  } else if (options.activeHighlightParagraphIndex === options.paragraphIndex) {
    messageParts.push(options.activeHighlightHasNote ? "Highlight note is still ready." : "Saved highlight is here.");
  } else if (options.activeBookmarkParagraphIndex === options.paragraphIndex) {
    messageParts.push(options.activeBookmarkHasNote ? "Marker note is saved here." : "Saved marker is here.");
  }

  return messageParts.join(" ");
}

export function buildReaderBookmarkHintMessage(options: ReaderBookmarkHintOptions) {
  if (options.hasNote) {
    return "A note is already saved for this marker.";
  }

  if (options.hasBookmark) {
    return "This paragraph is already marked. Add a note if you want one.";
  }

  return "Add a short note if it helps.";
}

export function buildReaderHighlightHintMessage(options: ReaderHighlightHintOptions) {
  if (!options.hasText) {
    return "Open a file to add a highlight.";
  }

  if (options.selectedParagraphIndex !== null) {
    return options.selectedTextPreview
      ? `Selection ready in paragraph ${options.selectedParagraphIndex + 1}: ${options.selectedTextPreview}`
      : `Selection ready in paragraph ${options.selectedParagraphIndex + 1}.`;
  }

  if (options.activeHighlightParagraphIndex !== null) {
    return options.activeHighlightPreview
      ? `Editing highlight in paragraph ${options.activeHighlightParagraphIndex + 1}: ${options.activeHighlightPreview}`
      : `Editing highlight in paragraph ${options.activeHighlightParagraphIndex + 1}.`;
  }

  return "Select a short passage in the document, then save it here.";
}
