import { fileTypeFromBuffer } from "file-type";
import type { DetectedFormat, FormatCategory } from "./types";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "avif", "gif", "svg", "ico", "bmp", "tif", "tiff", "heic", "heif"]);
const TEXT_EXTS = new Set(["json", "yaml", "yml", "toml", "xml", "csv", "tsv", "ini", "env", "md", "markdown", "html", "htm", "txt", "log"]);
const ARCHIVE_EXTS = new Set(["zip", "gz", "tgz", "tar", "7z", "rar", "xz", "bz2"]);
const DOC_EXTS = new Set(["pdf", "docx", "xlsx", "pptx", "epub"]);
const MEDIA_EXTS = new Set(["mp4", "webm", "mkv", "mov", "avi", "mp3", "wav", "flac", "ogg", "aac", "m4a"]);

function normalizeExt(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === "jpeg") return "jpg";
  if (lower === "yml") return "yaml";
  if (lower === "htm") return "html";
  if (lower === "markdown") return "md";
  if (lower === "tif") return "tiff";
  if (lower === "heif") return "heic";
  return lower;
}

function categoryForExt(ext: string): FormatCategory {
  if (IMAGE_EXTS.has(ext)) return "image";
  if (TEXT_EXTS.has(ext)) return "text";
  if (ARCHIVE_EXTS.has(ext)) return "archive";
  if (DOC_EXTS.has(ext)) return "document";
  if (MEDIA_EXTS.has(ext)) return "media";
  return "unknown";
}

function isLikelyUtf8Text(bytes: Uint8Array): boolean {
  const sampleLen = Math.min(bytes.length, 4096);
  if (sampleLen === 0) return true;
  let controlCount = 0;
  for (let i = 0; i < sampleLen; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b < 32 && b !== 9 && b !== 10 && b !== 13) controlCount++;
  }
  return controlCount / sampleLen < 0.05;
}

export function detectTextFormat(text: string): { id: string; mime: string } {
  const trimmed = text.trim();
  if (!trimmed) return { id: "txt", mime: "text/plain" };

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return { id: "json", mime: "application/json" };
    } catch {
      // fall through
    }
  }

  if (trimmed.startsWith("<svg") || (trimmed.startsWith("<?xml") && trimmed.includes("<svg"))) {
    return { id: "svg", mime: "image/svg+xml" };
  }
  if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return { id: "html", mime: "text/html" };
  }
  if (trimmed.startsWith("<?xml") || /^<[a-zA-Z0-9_:-]+[\s>]/.test(trimmed)) {
    return { id: "xml", mime: "application/xml" };
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length > 0 && lines.every((l) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l))) {
    return { id: "env", mime: "text/plain" };
  }
  if (lines.some((l) => /^\[[^\]]+\]$/.test(l.trim())) && lines.some((l) => l.includes("="))) {
    return { id: "toml", mime: "application/toml" };
  }
  if (lines.length >= 2 && lines.every((l) => l.includes(",")) && lines[0].split(",").length > 1) {
    return { id: "csv", mime: "text/csv" };
  }
  if (lines.some((l) => /^---\s*$/.test(l) || /^[a-zA-Z0-9_-]+:\s+.+/.test(l))) {
    return { id: "yaml", mime: "application/yaml" };
  }
  if (/^#{1,6}\s+/m.test(trimmed) || /```[\s\S]*```/.test(trimmed)) {
    return { id: "md", mime: "text/markdown" };
  }

  return { id: "txt", mime: "text/plain" };
}

export async function detectFormat(fileName: string, bytes: Uint8Array): Promise<DetectedFormat> {
  const dotIdx = fileName.lastIndexOf(".");
  const rawExt = dotIdx >= 0 ? fileName.slice(dotIdx + 1) : "";
  const extFromName = normalizeExt(rawExt);

  const magic = await fileTypeFromBuffer(bytes.subarray(0, Math.min(bytes.length, 4100)));
  if (magic) {
    let ext = normalizeExt(magic.ext);
    let mime = magic.mime;
    if (ext === "gz" && fileName.toLowerCase().endsWith(".tar.gz")) {
      ext = "tgz";
      mime = "application/gzip";
    }
    return {
      id: ext,
      ext,
      mime,
      category: categoryForExt(ext),
      confidence: "magic",
    };
  }

  if (isLikelyUtf8Text(bytes)) {
    const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 8192));
    if (sample.trimStart().startsWith("<svg") || sample.includes("<svg ")) {
      return {
        id: "svg",
        ext: "svg",
        mime: "image/svg+xml",
        category: "image",
        confidence: "heuristic",
      };
    }

    if (extFromName && TEXT_EXTS.has(extFromName)) {
      const mimeMap: Record<string, string> = {
        json: "application/json",
        yaml: "application/yaml",
        toml: "application/toml",
        xml: "application/xml",
        csv: "text/csv",
        tsv: "text/tab-separated-values",
        ini: "text/plain",
        env: "text/plain",
        md: "text/markdown",
        html: "text/html",
        txt: "text/plain",
      };
      return {
        id: extFromName,
        ext: extFromName,
        mime: mimeMap[extFromName] ?? "text/plain",
        category: "text",
        confidence: "ext",
      };
    }

    const guessed = detectTextFormat(sample);
    return {
      id: guessed.id,
      ext: guessed.id,
      mime: guessed.mime,
      category: guessed.id === "svg" ? "image" : "text",
      confidence: "heuristic",
    };
  }

  if (extFromName) {
    return {
      id: extFromName,
      ext: extFromName,
      mime: "application/octet-stream",
      category: categoryForExt(extFromName),
      confidence: "ext",
    };
  }

  return {
    id: "bin",
    ext: "bin",
    mime: "application/octet-stream",
    category: "unknown",
    confidence: "heuristic",
  };
}
