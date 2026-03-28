export type ReaderDocumentState = {
  filePath: string | null;
  text: string | null;
  fileType: "txt" | "pdf" | null;
  error: string | null;
  isLoading: boolean;
};

export type RecentDocument = {
  fileName: string;
  filePath: string;
  fileType: "txt" | "pdf";
  lastOpenedAt: number;
};

export const emptyReaderDocumentState: ReaderDocumentState = {
  filePath: null,
  text: null,
  fileType: null,
  error: null,
  isLoading: false
};

export function getDocumentFileName(filePath: string) {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

export function createLoadedDocumentState(result: {
  filePath: string;
  text: string;
  fileType: "txt" | "pdf";
}): ReaderDocumentState {
  return {
    filePath: result.filePath,
    text: result.text,
    fileType: result.fileType,
    error: null,
    isLoading: false
  };
}

export function upsertRecentDocument(
  recentDocuments: RecentDocument[],
  documentState: {
    filePath: string;
    fileType: "txt" | "pdf";
  },
  now = Date.now()
) {
  const nextDocument: RecentDocument = {
    fileName: getDocumentFileName(documentState.filePath),
    filePath: documentState.filePath,
    fileType: documentState.fileType,
    lastOpenedAt: now
  };

  const otherDocuments = recentDocuments.filter((entry) => entry.filePath !== documentState.filePath);
  return [nextDocument, ...otherDocuments].slice(0, 8);
}
