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
      filePath?: undefined;
      text?: undefined;
    };

type PhrononApi = {
  appName: string;
  openReaderDocument: () => Promise<OpenReaderDocumentResult>;
};

declare global {
  interface Window {
    phronon: PhrononApi;
  }
}

export {};
