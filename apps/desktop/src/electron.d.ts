type OpenReaderDocumentResult =
  | {
      canceled: true;
    }
  | {
      canceled: false;
      filePath: string;
      text: string;
      fileType: "txt" | "pdf";
      error?: undefined;
    }
  | {
      canceled: false;
      error: string;
      filePath?: string | undefined;
      text?: undefined;
    };

type PhrononApi = {
  appName: string;
  openReaderDocument: () => Promise<OpenReaderDocumentResult>;
  openDocumentAtPath: (filePath: string) => Promise<OpenReaderDocumentResult>;
  getRuntimeSupportStatus: () => Promise<{
    isPackaged: boolean;
    coreAppReady: boolean;
    pdfSupportAvailable: boolean;
    ocrSupportAvailable: boolean;
    arabicOcrSupportAvailable: boolean;
    message: string;
  }>;
};

declare global {
  interface Window {
    phronon: PhrononApi;
  }
}

export {};
