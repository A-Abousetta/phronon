export const emptyReaderDocumentState = {
    filePath: null,
    text: null,
    fileType: null,
    error: null,
    isLoading: false
};
export function getDocumentFileName(filePath) {
    const parts = filePath.split(/[\\/]/);
    return parts[parts.length - 1] || filePath;
}
export function createLoadedDocumentState(result) {
    return {
        filePath: result.filePath,
        text: result.text,
        fileType: result.fileType,
        error: null,
        isLoading: false
    };
}
export function upsertRecentDocument(recentDocuments, documentState, now = Date.now()) {
    const nextDocument = {
        fileName: getDocumentFileName(documentState.filePath),
        filePath: documentState.filePath,
        fileType: documentState.fileType,
        lastOpenedAt: now
    };
    const otherDocuments = recentDocuments.filter((entry) => entry.filePath !== documentState.filePath);
    return [nextDocument, ...otherDocuments].slice(0, 8);
}
