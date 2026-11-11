/// <reference types="vite/client" />

declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  const factory: (options?: unknown) => {
    HeifDecoder: new () => {
      decode(bytes: Uint8Array): Array<{
        get_width(): number;
        get_height(): number;
        display(imageData: ImageData, cb: (res: ImageData | null) => void): void;
      }>;
    };
  };
  export default factory;
}

declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
        getViewport(opts: { scale: number }): { width: number; height: number };
        render(opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): {
          promise: Promise<void>;
        };
      }>;
    }>;
  };
}
