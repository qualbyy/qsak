import type { ConvertJobResult } from "../core/types";
import { replaceExt } from "../core/registry";
import { packFilesToZip } from "./archive";

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

class OffscreenCanvasFactory {
  create(width: number, height: number) {
    const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
    const context = canvas.getContext("2d");
    return { canvas, context };
  }
  reset(pair: { canvas: OffscreenCanvas }, width: number, height: number) {
    pair.canvas.width = Math.max(1, width);
    pair.canvas.height = Math.max(1, height);
  }
  destroy(pair: { canvas: OffscreenCanvas | null; context: OffscreenCanvasRenderingContext2D | null }) {
    if (pair.canvas) {
      pair.canvas.width = 0;
      pair.canvas.height = 0;
    }
    pair.canvas = null;
    pair.context = null;
  }
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

export async function imageBytesToPdf(
  imageBytes: Uint8Array,
  kind: "png" | "jpg",
  fileName: string,
): Promise<ConvertJobResult> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const embedded = kind === "png" ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
  const page = doc.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: embedded.width,
    height: embedded.height,
  });
  const out = await doc.save();
  return {
    outputName: replaceExt(fileName, "pdf"),
    mime: "application/pdf",
    bytes: out,
    meta: { pages: 1 },
  };
}

export async function mergePdfFiles(files: Array<{ name: string; bytes: Uint8Array }>): Promise<ConvertJobResult> {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();

  for (const file of files) {
    const src = await PDFDocument.load(file.bytes);
    const copied = await merged.copyPages(src, src.getPageIndices());
    for (const page of copied) {
      merged.addPage(page);
    }
  }

  const out = await merged.save({ useObjectStreams: true });
  return {
    outputName: "qsak-merged.pdf",
    mime: "application/pdf",
    bytes: out,
    meta: { pages: merged.getPageCount() },
  };
}

export async function convertPdfFile(
  bytes: Uint8Array,
  fileName: string,
  targetFormat: string,
): Promise<ConvertJobResult> {
  const target = targetFormat.toLowerCase();

  if (target === "pdf-rotate-90" || target === "pdf-rotate-180") {
    const { PDFDocument, degrees } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    const delta = target === "pdf-rotate-90" ? 90 : 180;
    for (const page of doc.getPages()) {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + delta) % 360));
    }
    const out = await doc.save({ useObjectStreams: true });
    return {
      outputName: replaceExt(fileName, "rotated.pdf"),
      mime: "application/pdf",
      bytes: out,
      meta: { pages: doc.getPageCount() },
    };
  }

  if (target === "pdf-strip-meta") {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
    doc.setProducer("qsak");
    doc.setCreator("qsak");
    const out = await doc.save({ useObjectStreams: true });
    return {
      outputName: replaceExt(fileName, "clean.pdf"),
      mime: "application/pdf",
      bytes: out,
      meta: { pages: doc.getPageCount() },
    };
  }

  if (target === "pdf-split-zip") {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(bytes);
    const count = src.getPageCount();
    const parts: Array<{ name: string; bytes: Uint8Array }> = [];
    const base = fileName.replace(/\.pdf$/i, "");

    for (let i = 0; i < count; i++) {
      const partDoc = await PDFDocument.create();
      const [page] = await partDoc.copyPages(src, [i]);
      partDoc.addPage(page);
      const partBytes = await partDoc.save({ useObjectStreams: true });
      parts.push({ name: `${base}_page_${String(i + 1).padStart(3, "0")}.pdf`, bytes: partBytes });
    }

    return {
      outputName: `${base}_pages.zip`,
      mime: "application/zip",
      bytes: packFilesToZip(parts),
      meta: { pages: count },
    };
  }

  if (target === "pdf-to-txt") {
    const pdfjs = await loadPdfJs();
    const loadingTask = pdfjs.getDocument({ data: bytes.slice(), disableWorker: true } as Record<string, unknown>);
    const pdf = await loadingTask.promise;
    const chunks: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();
      chunks.push(`--- Page ${i} ---\n${line}`);
    }

    const text = chunks.join("\n\n") + "\n";
    return {
      outputName: replaceExt(fileName, "txt"),
      mime: "text/plain",
      bytes: new TextEncoder().encode(text),
      meta: { pages: pdf.numPages },
    };
  }

  if (target === "pdf-to-png-zip" || target === "pdf-to-jpg-zip") {
    const isJpg = target === "pdf-to-jpg-zip";
    const pdfjs = await loadPdfJs();
    const factory = new OffscreenCanvasFactory();
    const loadingTask = pdfjs.getDocument({
      data: bytes.slice(),
      disableWorker: true,
      canvasFactory: factory,
    } as Record<string, unknown>);
    const pdf = await loadingTask.promise;

    const images: Array<{ name: string; bytes: Uint8Array }> = [];
    const base = fileName.replace(/\.pdf$/i, "");

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const { canvas, context } = factory.create(viewport.width, viewport.height);
      if (!context) throw new Error("OffscreenCanvas 2D context unavailable");

      if (isJpg) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport } as never).promise;
      const blob = await canvas.convertToBlob({
        type: isJpg ? "image/jpeg" : "image/png",
        quality: isJpg ? 0.9 : undefined,
      });
      const imgBytes = new Uint8Array(await blob.arrayBuffer());
      const ext = isJpg ? "jpg" : "png";
      images.push({ name: `${base}_page_${String(i).padStart(3, "0")}.${ext}`, bytes: imgBytes });
      factory.destroy({ canvas, context });
    }

    return {
      outputName: `${base}_${isJpg ? "jpg" : "png"}.zip`,
      mime: "application/zip",
      bytes: packFilesToZip(images),
      meta: { pages: pdf.numPages },
    };
  }

  throw new Error(`Unsupported PDF target: ${targetFormat}`);
}
