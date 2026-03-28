type OpenTextDocumentResult =
  | {
      canceled: true;
    }
  | {
      canceled: false;
      filePath: string;
      text: string;
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
  openTextDocument: () => Promise<OpenTextDocumentResult>;
};

declare global {
  interface Window {
    phronon: PhrononApi;
  }
}

export {};
