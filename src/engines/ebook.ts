import { unzipSync } from "fflate";
import type { ConvertJobResult } from "../core/types";
import { replaceExt } from "../core/registry";
import { packFilesToZip } from "./archive";

export async function convertCbzToPdf(bytes: Uint8Array, fileName: string): Promise<ConvertJobResult> {
  const entries = unzipSync(bytes);
  const imageNames = Object.keys(entries)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name) && !name.startsWith("__MACOSX"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (imageNames.length === 0) {
    throw new Error("No supported PNG/JPEG/WebP pages found inside CBZ");
  }

  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();

  for (const name of imageNames) {
    const imgBytes = entries[name];
    const lower = name.toLowerCase();
    let embedded;
    if (lower.endsWith(".png")) {
      embedded = await doc.embedPng(imgBytes);
    } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
      embedded = await doc.embedJpg(imgBytes);
    } else {
      // Convert WebP page via OffscreenCanvas -> PNG
      const blob = new Blob([imgBytes.slice().buffer], { type: "image/webp" });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pngBlob = await canvas.convertToBlob({ type: "image/png" });
      embedded = await doc.embedPng(new Uint8Array(await pngBlob.arrayBuffer()));
    }

    const page = doc.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    });
  }

  const out = await doc.save({ useObjectStreams: true });
  return {
    outputName: replaceExt(fileName, "pdf"),
    mime: "application/pdf",
    bytes: out,
    meta: { pages: imageNames.length },
  };
}

export function extractEpubToText(bytes: Uint8Array, fileName: string): ConvertJobResult {
  const entries = unzipSync(bytes);
  const htmlFiles = Object.keys(entries)
    .filter((name) => /\.(x?html?|htm)$/i.test(name) && !name.startsWith("__MACOSX"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (htmlFiles.length === 0) {
    throw new Error("No XHTML/HTML chapters found inside EPUB");
  }

  const dec = new TextDecoder("utf-8", { fatal: false });
  const sections: string[] = [];

  for (const name of htmlFiles) {
    const raw = dec.decode(entries[name]);
    const clean = raw
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (clean) sections.push(clean);
  }

  const fullText = sections.join("\n\n---\n\n") + "\n";
  return {
    outputName: replaceExt(fileName, "txt"),
    mime: "text/plain",
    bytes: new TextEncoder().encode(fullText),
    meta: { chapters: sections.length },
  };
}

export function extractEpubImagesToZip(bytes: Uint8Array, fileName: string): ConvertJobResult {
  const entries = unzipSync(bytes);
  const collected: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const [name, data] of Object.entries(entries)) {
    if (!name.startsWith("__MACOSX") && data.byteLength > 0) {
      collected.push({ name, bytes: data });
    }
  }
  return {
    outputName: replaceExt(fileName, "zip"),
    mime: "application/zip",
    bytes: packFilesToZip(collected),
    meta: { entries: collected.length },
  };
}
