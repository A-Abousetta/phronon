export type VoiceReaderCommand =
  | "openFile"
  | "play"
  | "pause"
  | "stop"
  | "nextParagraph"
  | "previousParagraph"
  | "repeatParagraph"
  | "faster"
  | "slower"
  | "jumpToDocument"
  | "jumpToPlayback"
  | "jumpToSearch"
  | "jumpToHighlights"
  | "jumpToBookmarks"
  | "jumpToHelp";

export type VoiceReaderCommandDefinition = {
  command: VoiceReaderCommand;
  label: string;
  phrases: readonly string[];
};

export type VoiceReaderCommandMatch = {
  command: VoiceReaderCommand;
  definition: VoiceReaderCommandDefinition;
  heardTranscript: string;
  normalizedTranscript: string;
  matchedPhrase: string;
};

export const readerVoiceCommandDefinitions: readonly VoiceReaderCommandDefinition[] = [
  {
    command: "openFile",
    label: "Open file",
    phrases: ["open file", "open document"]
  },
  {
    command: "play",
    label: "Play",
    phrases: ["play"]
  },
  {
    command: "pause",
    label: "Pause",
    phrases: ["pause"]
  },
  {
    command: "stop",
    label: "Stop",
    phrases: ["stop"]
  },
  {
    command: "nextParagraph",
    label: "Next paragraph",
    phrases: ["next paragraph"]
  },
  {
    command: "previousParagraph",
    label: "Previous paragraph",
    phrases: ["previous paragraph"]
  },
  {
    command: "repeatParagraph",
    label: "Repeat paragraph",
    phrases: ["repeat paragraph"]
  },
  {
    command: "faster",
    label: "Faster",
    phrases: ["faster", "speed up"]
  },
  {
    command: "slower",
    label: "Slower",
    phrases: ["slower", "slow down"]
  },
  {
    command: "jumpToDocument",
    label: "Jump to document",
    phrases: ["jump to document"]
  },
  {
    command: "jumpToPlayback",
    label: "Jump to playback",
    phrases: ["jump to playback"]
  },
  {
    command: "jumpToSearch",
    label: "Jump to search",
    phrases: ["jump to search"]
  },
  {
    command: "jumpToHighlights",
    label: "Jump to highlights",
    phrases: ["jump to highlights"]
  },
  {
    command: "jumpToBookmarks",
    label: "Jump to bookmarks",
    phrases: ["jump to bookmarks"]
  },
  {
    command: "jumpToHelp",
    label: "Jump to shortcuts",
    phrases: ["jump to shortcuts", "jump to help"]
  }
] as const;

export const readerVoiceCommandLabels = readerVoiceCommandDefinitions.map((definition) => definition.label);

const normalizedPhraseMap = new Map<string, VoiceReaderCommandDefinition>();

readerVoiceCommandDefinitions.forEach((definition) => {
  definition.phrases.forEach((phrase) => {
    normalizedPhraseMap.set(normalizeVoiceTranscript(phrase), definition);
  });
});

export function normalizeVoiceTranscript(transcript: string) {
  return transcript
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getVoiceReaderCommandMatch(transcript: string): VoiceReaderCommandMatch | null {
  const normalizedTranscript = normalizeVoiceTranscript(transcript);

  if (!normalizedTranscript) {
    return null;
  }

  const definition = normalizedPhraseMap.get(normalizedTranscript);

  if (!definition) {
    return null;
  }

  return {
    command: definition.command,
    definition,
    heardTranscript: transcript.trim(),
    normalizedTranscript,
    matchedPhrase: normalizedTranscript
  };
}

export function getVoiceReaderCommandMatchFromAlternatives(transcripts: readonly string[]) {
  for (const transcript of transcripts) {
    const match = getVoiceReaderCommandMatch(transcript);

    if (match) {
      return match;
    }
  }

  return null;
}
