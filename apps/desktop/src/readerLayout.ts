export const readerRailSectionOrder = ["study", "playback", "help"] as const;

export type ReaderRailSectionId = (typeof readerRailSectionOrder)[number];
