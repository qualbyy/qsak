import type { ConvertJobResult, ConvertOptions } from "../core/types";
import { replaceExt } from "../core/registry";
import { imageBytesToPdf } from "./pdf";

let resvgInitPromise: Promise<void> | null = null;

async function ensureResvg(): Promise<typeof import("@resvg/resvg-wasm")> {
  const mod = await import("@resvg/resvg-wasm");
  if (!resvgInitPromise) {
    resvgInitPromise = (async () => {
      const wasmUrl = new URL("@resvg/resvg-wasm/index_bg.wasm", import.meta.url);
      await mod.initWasm(fetch(wasmUrl));
    })();
  }
  await resvgInitPromise;
  return mod;
}

async function decodeToImageData(
  bytes: Uint8Array,
  sourceFormat: string,
  maxWidth?: number,
): Promise<ImageData> {
  const fmt = sourceFormat.toLowerCase();

  if (fmt === "svg") {
    const { Resvg } = await ensureResvg();
    const svgText = new TextDecoder().decode(bytes);
    const opts = maxWidth && maxWidth > 0 ? { fitTo: { mode: "width" as const, value: maxWidth } } : undefined;
    const resvg = new Resvg(svgText, opts);
    const rendered = resvg.render();
    const pngBytes = rendered.asPng();
    return decodeRasterBytes(pngBytes, "image/png");
  }

  if (fmt === "avif") {
    try {
      return await decodeRasterBytes(bytes, "image/avif");
    } catch {
      const { decode } = await import("@jsquash/avif");
      const decoded = await decode(bytes.slice().buffer);
      if (!decoded) throw new Error("Failed to decode AVIF");
      return decoded;
    }
  }

  if (fmt === "webp") {
    try {
      return await decodeRasterBytes(bytes, "image/webp");
    } catch {
      const { decode } = await import("@jsquash/webp");
      return await decode(bytes.slice().buffer);
    }
  }

  if (fmt === "heic" || fmt === "heif") {
    const libheifFactory = (await import("libheif-js/libheif-wasm/libheif-bundle.mjs")).default;
    const libheif = libheifFactory();
    const decoder = new libheif.HeifDecoder();
    const decodedImages = decoder.decode(bytes);
    if (!decodedImages || decodedImages.length === 0) {
      throw new Error("No images found in HEIC container");
    }
    const img = decodedImages[0];
    const width = img.get_width();
    const height = img.get_height();
    const imageData = new ImageData(width, height);
    await new Promise<void>((resolve, reject) => {
      img.display(imageData, (displayData: ImageData | null) => {
        if (!displayData) return reject(new Error("HEIC decoding failed"));
        resolve();
      });
    });
    return imageData;
  }

  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
  };
  return decodeRasterBytes(bytes, mimeMap[fmt] ?? "image/png");
}

async function decodeRasterBytes(bytes: Uint8Array, mime: string): Promise<ImageData> {
  const blob = new Blob([bytes.slice().buffer], { type: mime });
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function resizeImageData(imageData: ImageData, maxWidth?: number, maxHeight?: number): Promise<ImageData> {
  const { width, height } = imageData;
  if (!maxWidth && !maxHeight) return imageData;

  let targetW = width;
  let targetH = height;

  if (maxWidth && targetW > maxWidth) {
    targetH = Math.max(1, Math.round((targetH * maxWidth) / targetW));
    targetW = maxWidth;
  }
  if (maxHeight && targetH > maxHeight) {
    targetW = Math.max(1, Math.round((targetW * maxHeight) / targetH));
    targetH = maxHeight;
  }

  if (targetW === width && targetH === height) return imageData;

  const srcCanvas = new OffscreenCanvas(width, height);
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) throw new Error("OffscreenCanvas 2D context unavailable");
  srcCtx.putImageData(imageData, 0, 0);

  const dstCanvas = new OffscreenCanvas(targetW, targetH);
  const dstCtx = dstCanvas.getContext("2d");
  if (!dstCtx) throw new Error("OffscreenCanvas 2D context unavailable");
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = "high";
  dstCtx.drawImage(srcCanvas, 0, 0, targetW, targetH);
  return dstCtx.getImageData(0, 0, targetW, targetH);
}

async function encodePngBytes(imageData: ImageData): Promise<Uint8Array> {
  const { encode } = await import("@jsquash/png");
  const raw = new Uint8Array(await encode(imageData));
  try {
    const { optimise } = await import("@jsquash/oxipng");
    return new Uint8Array(await optimise(raw.buffer, { level: 2 }));
  } catch {
    return raw;
  }
}

async function buildIco(imageData: ImageData, sizes: number[] = [16, 32, 48, 64]): Promise<Uint8Array> {
  const pngChunks: Array<{ size: number; bytes: Uint8Array }> = [];
  for (const s of sizes) {
    const scaled = await resizeExact(imageData, s, s);
    const png = await encodePngBytes(scaled);
    pngChunks.push({ size: s, bytes: png });
  }

  const headerSize = 6 + pngChunks.length * 16;
  const totalBytes = headerSize + pngChunks.reduce((acc, c) => acc + c.bytes.length, 0);
  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type = 1 (ICO)
  view.setUint16(4, pngChunks.length, true);

  let dataOffset = headerSize;
  for (let i = 0; i < pngChunks.length; i++) {
    const { size, bytes } = pngChunks[i];
    const dirOffset = 6 + i * 16;
    out[dirOffset] = size >= 256 ? 0 : size;
    out[dirOffset + 1] = size >= 256 ? 0 : size;
    out[dirOffset + 2] = 0;
    out[dirOffset + 3] = 0;
    view.setUint16(dirOffset + 4, 1, true);
    view.setUint16(dirOffset + 6, 32, true);
    view.setUint32(dirOffset + 8, bytes.length, true);
    view.setUint32(dirOffset + 12, dataOffset, true);
    out.set(bytes, dataOffset);
    dataOffset += bytes.length;
  }

  return out;
}

async function resizeExact(imageData: ImageData, w: number, h: number): Promise<ImageData> {
  const srcCanvas = new OffscreenCanvas(imageData.width, imageData.height);
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) throw new Error("OffscreenCanvas 2D context unavailable");
  srcCtx.putImageData(imageData, 0, 0);

  const dstCanvas = new OffscreenCanvas(w, h);
  const dstCtx = dstCanvas.getContext("2d");
  if (!dstCtx) throw new Error("OffscreenCanvas 2D context unavailable");
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = "high";
  dstCtx.drawImage(srcCanvas, 0, 0, w, h);
  return dstCtx.getImageData(0, 0, w, h);
}

export async function convertImageFile(
  bytes: Uint8Array,
  fileName: string,
  sourceFormat: string,
  targetFormat: string,
  options: ConvertOptions = {},
): Promise<ConvertJobResult> {
  const quality = Math.max(10, Math.min(100, options.quality ?? 85));
  const decoded = await decodeToImageData(bytes, sourceFormat, options.maxWidth);
  const resized = await resizeImageData(decoded, options.maxWidth, options.maxHeight);
  const target = targetFormat.toLowerCase();

  let outBytes: Uint8Array;
  let mime = "application/octet-stream";

  switch (target) {
    case "webp": {
      const { encode } = await import("@jsquash/webp");
      outBytes = new Uint8Array(await encode(resized, { quality }));
      mime = "image/webp";
      break;
    }
    case "jpg":
    case "jpeg": {
      const { encode } = await import("@jsquash/jpeg");
      outBytes = new Uint8Array(await encode(resized, { quality }));
      mime = "image/jpeg";
      break;
    }
    case "avif": {
      const { encode } = await import("@jsquash/avif");
      outBytes = new Uint8Array(await encode(resized, { quality }));
      mime = "image/avif";
      break;
    }
    case "png": {
      outBytes = await encodePngBytes(resized);
      mime = "image/png";
      break;
    }
    case "ico": {
      outBytes = await buildIco(resized, options.iconSizes);
      mime = "image/x-icon";
      break;
    }
    case "pdf": {
      const pngBytes = await encodePngBytes(resized);
      return imageBytesToPdf(pngBytes, "png", fileName);
    }
    default:
      throw new Error(`Unsupported target image format: ${targetFormat}`);
  }

  return {
    outputName: replaceExt(fileName, target === "jpeg" ? "jpg" : target),
    mime,
    bytes: outBytes,
    meta: {
      width: resized.width,
      height: resized.height,
    },
  };
}
