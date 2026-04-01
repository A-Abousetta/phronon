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

type ReaderStudyOverviewOptions = {
  hasText: boolean;
  searchQuery: string;
  searchMatchCount: number;
  searchMatchParagraphCount: number;
  highlightCount: number;
  bookmarkCount: number;
  savedPointCount: number;
  savedParagraphCount: number;
  searchSavedPointCount: number;
};

type ReaderStudyContextOptions = {
  hasText: boolean;
  currentParagraphIndex: number;
  selectedParagraphIndex: number | null;
  activeSearchMatchIndex: number;
  activeSearchMatchCount: number;
  activeSearchParagraphIndex: number | null;
  currentParagraphHasBookmark: boolean;
  currentParagraphHighlightCount: number;
};

type ReaderSavedReviewStatusOptions = {
  savedPointCount: number;
  savedParagraphCount: number;
  activeSavedPointIndex: number;
  activeSavedPointKind: "bookmark" | "highlight" | null;
  activeSavedPointParagraphIndex: number | null;
  activeSavedPointHasNote: boolean;
};

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinReadableList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
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

export function buildReaderStudyOverviewMessage(options: ReaderStudyOverviewOptions) {
  if (!options.hasText) {
    return "Open a file to connect search, highlights, and markers.";
  }

  if (options.searchQuery) {
    if (options.searchMatchCount === 0) {
      return `No matches for "${options.searchQuery}". ${formatCount(options.savedPointCount, "saved study point")} remain ready to revisit.`;
    }

    if (options.searchSavedPointCount > 0) {
      return `${formatCount(options.searchMatchCount, "match", "matches")} across ${formatCount(options.searchMatchParagraphCount, "paragraph")}. ${formatCount(options.searchSavedPointCount, "saved study point")} already sit in those results.`;
    }
  }

  if (options.savedPointCount === 0) {
    return options.searchQuery
      ? `${formatCount(options.searchMatchCount, "match", "matches")} ready. Save markers or highlights to build a return path.`
      : "Search, highlights, and markers are ready for this document.";
  }

  return `${formatCount(options.savedPointCount, "saved study point")} across ${formatCount(options.savedParagraphCount, "paragraph")}. ${formatCount(options.highlightCount, "highlight")} and ${formatCount(options.bookmarkCount, "marker")} are ready to revisit.`;
}

export function buildReaderStudyContextMessage(options: ReaderStudyContextOptions) {
  if (!options.hasText) {
    return "Load a document to start building a study trail.";
  }

  if (options.selectedParagraphIndex !== null) {
    return `Selected text in paragraph ${options.selectedParagraphIndex + 1} is ready to save as a highlight.`;
  }

  const paragraphNumber = options.currentParagraphIndex + 1;
  const details: string[] = [];

  if (
    options.activeSearchParagraphIndex === options.currentParagraphIndex &&
    options.activeSearchMatchIndex >= 0 &&
    options.activeSearchMatchCount > 0
  ) {
    details.push(`match ${options.activeSearchMatchIndex + 1} of ${options.activeSearchMatchCount}`);
  }

  if (options.currentParagraphHasBookmark) {
    details.push("a saved marker");
  }

  if (options.currentParagraphHighlightCount > 0) {
    details.push(
      options.currentParagraphHighlightCount === 1
        ? "1 saved highlight"
        : `${options.currentParagraphHighlightCount} saved highlights`
    );
  }

  if (details.length > 0) {
    return `Current paragraph ${paragraphNumber} contains ${joinReadableList(details)}.`;
  }

  return `Current paragraph ${paragraphNumber} is clear. Search, mark, or keep reading.`;
}

export function buildReaderSavedReviewStatusMessage(options: ReaderSavedReviewStatusOptions) {
  if (options.savedPointCount === 0) {
    return "No saved study points yet. Save a marker or highlight to review it later.";
  }

  if (
    options.activeSavedPointIndex >= 0 &&
    options.activeSavedPointKind &&
    options.activeSavedPointParagraphIndex !== null
  ) {
    return `${options.activeSavedPointKind === "bookmark" ? "Marker" : "Highlight"} ${options.activeSavedPointIndex + 1} of ${options.savedPointCount} is active at paragraph ${options.activeSavedPointParagraphIndex + 1}.${options.activeSavedPointHasNote ? " Note ready." : ""}`;
  }

  return `Review ${formatCount(options.savedPointCount, "saved study point")} across ${formatCount(options.savedParagraphCount, "paragraph")}.`;
}
