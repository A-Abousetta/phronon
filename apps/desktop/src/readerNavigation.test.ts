import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReaderBookmarkHintMessage,
  buildReaderDocumentReturnAnnouncement,
  buildReaderHighlightHintMessage,
  buildReaderRegionStatusMessage,
  buildReaderSavedItemAnnouncement,
  buildReaderSavedReviewStatusMessage,
  buildReaderSearchResultAnnouncement,
  buildReaderSearchStatusMessage,
  buildReaderStudyContextMessage,
  buildReaderStudyOverviewMessage
} from "./readerNavigation.js";

test("buildReaderRegionStatusMessage keeps region feedback short and contextual", () => {
  assert.equal(
    buildReaderRegionStatusMessage({
      activeRegion: "document",
      activeRegionLabel: "Document",
      hasText: true,
      paragraphIndex: 2,
      paragraphCount: 9,
      searchQuery: "",
      searchMatchCount: 0,
      highlightCount: 0,
      bookmarkCount: 0
    }),
    "In document. Paragraph 3 of 9."
  );

  assert.equal(
    buildReaderRegionStatusMessage({
      activeRegion: "search",
      activeRegionLabel: "Search",
      hasText: true,
      paragraphIndex: 2,
      paragraphCount: 9,
      searchQuery: "photosynthesis",
      searchMatchCount: 4,
      highlightCount: 0,
      bookmarkCount: 0
    }),
    'In search. 4 matches for "photosynthesis".'
  );

  assert.equal(
    buildReaderRegionStatusMessage({
      activeRegion: "help",
      activeRegionLabel: "Shortcuts",
      hasText: true,
      paragraphIndex: 2,
      paragraphCount: 9,
      searchQuery: "",
      searchMatchCount: 0,
      highlightCount: 2,
      bookmarkCount: 1
    }),
    "In shortcuts. Landmark jumps and Reader keys are here."
  );
});

test("buildReaderSearchStatusMessage favors clear match location over narration", () => {
  assert.equal(
    buildReaderSearchStatusMessage({
      isLoading: false,
      hasText: true,
      searchQuery: "",
      searchMatchCount: 0,
      activeSearchMatchIndex: -1,
      activeSearchParagraphIndex: null
    }),
    "Type a word or phrase, then press Search."
  );

  assert.equal(
    buildReaderSearchStatusMessage({
      isLoading: false,
      hasText: true,
      searchQuery: "atom",
      searchMatchCount: 2,
      activeSearchMatchIndex: 1,
      activeSearchParagraphIndex: 5
    }),
    "Match 2 of 2 at paragraph 6."
  );
});

test("reader announcement helpers stay concise but reassuring", () => {
  assert.equal(
    buildReaderSearchResultAnnouncement({
      matchIndex: 1,
      matchCount: 3,
      paragraphIndex: 6
    }),
    "Match 2 of 3 at paragraph 7."
  );

  assert.equal(
    buildReaderSavedItemAnnouncement({
      kind: "Highlight",
      itemIndex: 0,
      itemCount: 2,
      paragraphIndex: 3,
      hasNote: true
    }),
    "Highlight 1 of 2 at paragraph 4. Note ready."
  );

  assert.equal(
    buildReaderDocumentReturnAnnouncement({
      hasText: true,
      paragraphIndex: 4,
      sourceRegionLabel: "Search",
      activeSearchMatchIndex: 1,
      activeSearchMatchCount: 3,
      activeSearchParagraphIndex: 4,
      activeHighlightParagraphIndex: null,
      activeHighlightHasNote: false,
      activeBookmarkParagraphIndex: null,
      activeBookmarkHasNote: false
    }),
    "Back in document from search at paragraph 5. Match 2 of 3 is still here."
  );
});

test("bookmark and highlight hints keep context without over-explaining", () => {
  assert.equal(
    buildReaderBookmarkHintMessage({
      hasBookmark: true,
      hasNote: false
    }),
    "This paragraph is already marked. Add a note if you want one."
  );

  assert.equal(
    buildReaderHighlightHintMessage({
      hasText: true,
      selectedParagraphIndex: 2,
      selectedTextPreview: "Light energy becomes chemical energy…",
      activeHighlightParagraphIndex: null,
      activeHighlightPreview: null
    }),
    "Selection ready in paragraph 3: Light energy becomes chemical energy…"
  );
});

test("study overview and context connect search with saved material", () => {
  assert.equal(
    buildReaderStudyOverviewMessage({
      hasText: true,
      searchQuery: "atom",
      searchMatchCount: 4,
      searchMatchParagraphCount: 3,
      highlightCount: 2,
      bookmarkCount: 1,
      savedPointCount: 3,
      savedParagraphCount: 2,
      searchSavedPointCount: 2
    }),
    '4 matches across 3 paragraphs. 2 saved study points already sit in those results.'
  );

  assert.equal(
    buildReaderStudyContextMessage({
      hasText: true,
      currentParagraphIndex: 5,
      selectedParagraphIndex: null,
      activeSearchMatchIndex: 1,
      activeSearchMatchCount: 4,
      activeSearchParagraphIndex: 5,
      currentParagraphHasBookmark: true,
      currentParagraphHighlightCount: 2
    }),
    "Current paragraph 6 contains match 2 of 4, a saved marker, and 2 saved highlights."
  );
});

test("saved review status keeps revisit flow concise", () => {
  assert.equal(
    buildReaderSavedReviewStatusMessage({
      savedPointCount: 0,
      savedParagraphCount: 0,
      activeSavedPointIndex: -1,
      activeSavedPointKind: null,
      activeSavedPointParagraphIndex: null,
      activeSavedPointHasNote: false
    }),
    "No saved study points yet. Save a marker or highlight to review it later."
  );

  assert.equal(
    buildReaderSavedReviewStatusMessage({
      savedPointCount: 5,
      savedParagraphCount: 3,
      activeSavedPointIndex: 2,
      activeSavedPointKind: "highlight",
      activeSavedPointParagraphIndex: 7,
      activeSavedPointHasNote: true
    }),
    "Highlight 3 of 5 is active at paragraph 8. Note ready."
  );
});
