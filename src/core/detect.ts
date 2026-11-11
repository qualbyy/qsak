import { fileTypeFromBuffer } from "file-type";
import type { DetectedFormat, FormatCategory } from "./types";

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "gif",
  "svg",
  "ico",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "heif",
  "tga",
  "ppm",
  "pgm",
  "pbm",
]);

const TEXT_EXTS = new Set([
  "json",
  "jsonl",
  "ndjson",
  "yaml",
  "yml",
  "toml",
  "xml",
  "csv",
  "tsv",
  "ini",
  "env",
  "properties",
  "md",
  "markdown",
  "html",
  "htm",
  "srt",
  "vtt",
  "txt",
  "log",
  "sql",
]);

const ARCHIVE_EXTS = new Set(["zip", "gz", "tgz", "tar", "7z", "rar", "xz", "bz2", "cbz", "apk", "jar"]);
const DOC_EXTS = new Set(["pdf", "docx", "xlsx", "pptx", "epub"]);
const MEDIA_EXTS = new Set([
  "mp4",
  "webm",
  "mkv",
  "mov",
  "avi",
  "flv",
  "wmv",
  "m4v",
  "3gp",
  "ts",
  "mts",
  "m2ts",
  "ogv",
  "vob",
  "mp3",
  "wav",
  "flac",
  "ogg",
  "aac",
  "m4a",
  "opus",
  "aiff",
  "aif",
  "wma",
  "ac3",
  "amr",
  "alac",
  "weba",
]);

function normalizeExt(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === "jpeg") return "jpg";
  if (lower === "yml") return "yaml";
  if (lower === "htm") return "html";
  if (lower === "markdown") return "md";
  if (lower === "tif") return "tiff";
  if (lower === "heif") return "heic";
  if (lower === "ndjson") return "jsonl";
  if (lower === "aif") return "aiff";
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
      // fall through (could be JSONL)
    }
  }

  // JSONL / NDJSON check
  const rawLines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (
    rawLines.length >= 2 &&
    rawLines.slice(0, 10).every((l) => {
      const s = l.trim();
      if (!((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]")))) return false;
      try {
        JSON.parse(s);
        return true;
      } catch {
        return false;
      }
    })
  ) {
    return { id: "jsonl", mime: "application/x-ndjson" };
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
  if (/^WEBVTT\b/i.test(trimmed)) {
    return { id: "vtt", mime: "text/vtt" };
  }
  if (/^\d+\r?\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/m.test(trimmed)) {
    return { id: "srt", mime: "application/x-subrip" };
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length > 0 && lines.every((l) => /^[A-Z_][A-Z0-9_]*\s*=/.test(l))) {
    return { id: "env", mime: "text/plain" };
  }
  if (lines.some((l) => /^\[[^\]]+\]$/.test(l.trim())) && lines.some((l) => l.includes("="))) {
    return { id: "toml", mime: "application/toml" };
  }
  if (lines.length >= 2 && lines.every((l) => l.includes("\t")) && lines[0].split("\t").length > 1) {
    return { id: "tsv", mime: "text/tab-separated-values" };
  }
  if (lines.length >= 2 && lines.every((l) => l.includes(",")) && lines[0].split(",").length > 1) {
    return { id: "csv", mime: "text/csv" };
  }
  if (lines.some((l) => /^---\s*$/.test(l) || /^[a-zA-Z0-9_-]+:\s+.+/.test(l))) {
    return { id: "yaml", mime: "application/yaml" };
  }
  if (lines.length > 0 && lines.every((l) => /^[a-zA-Z0-9_.-]+\s*=/.test(l))) {
    return { id: "properties", mime: "text/plain" };
  }
  if (/^#{1,6}\s+/m.test(trimmed) || /```[\s\S]*```/.test(trimmed)) {
    return { id: "md", mime: "text/markdown" };
  }

  return { id: "txt", mime: "text/plain" };
}

function detectExtraBinaryMagic(bytes: Uint8Array, extFromName: string): DetectedFormat | null {
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { id: "bmp", ext: "bmp", mime: "image/bmp", category: "image", confidence: "magic" };
  }
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) {
    return { id: "tiff", ext: "tiff", mime: "image/tiff", category: "image", confidence: "magic" };
  }
  if (bytes.length >= 3 && bytes[0] === 0x50 && (bytes[1] === 0x34 || bytes[1] === 0x35 || bytes[1] === 0x36)) {
    const map: Record<number, string> = { 0x34: "pbm", 0x35: "pgm", 0x36: "ppm" };
    const id = map[bytes[1]];
    return { id, ext: id, mime: `image/x-portable-${id === "ppm" ? "pixmap" : "anymap"}`, category: "image", confidence: "magic" };
  }
  if (bytes.length >= 12 && bytes[0] === 0x46 && bytes[1] === 0x4f && bytes[2] === 0x52 && bytes[3] === 0x4d) {
    const tag = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (tag === "AIFF" || tag === "AIFC") {
      return { id: "aiff", ext: "aiff", mime: "audio/aiff", category: "media", confidence: "magic" };
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0x46 && bytes[1] === 0x4c && bytes[2] === 0x56) {
    return { id: "flv", ext: "flv", mime: "video/x-flv", category: "media", confidence: "magic" };
  }
  if (extFromName === "tga" && bytes.length >= 18) {
    return { id: "tga", ext: "tga", mime: "image/x-tga", category: "image", confidence: "ext" };
  }
  return null;
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
    if (ext === "zip" && ["cbz", "epub", "apk", "jar"].includes(extFromName)) {
      ext = extFromName;
      if (ext === "epub") mime = "application/epub+zip";
      else if (ext === "cbz") mime = "application/vnd.comicbook+zip";
    }
    if (ext === "xml" && extFromName === "svg") {
      ext = "svg";
      mime = "image/svg+xml";
    }
    if (ext === "mkv" && extFromName === "webm") {
      ext = "webm";
      mime = "video/webm";
    }
    if (ext === "ogg" && extFromName === "opus") {
      ext = "opus";
      mime = "audio/opus";
    }
    return {
      id: ext,
      ext,
      mime,
      category: categoryForExt(ext),
      confidence: "magic",
    };
  }

  const extraMagic = detectExtraBinaryMagic(bytes, extFromName);
  if (extraMagic) return extraMagic;

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
        jsonl: "application/x-ndjson",
        yaml: "application/yaml",
        toml: "application/toml",
        xml: "application/xml",
        csv: "text/csv",
        tsv: "text/tab-separated-values",
        ini: "text/plain",
        env: "text/plain",
        properties: "text/plain",
        md: "text/markdown",
        html: "text/html",
        srt: "application/x-subrip",
        vtt: "text/vtt",
        txt: "text/plain",
        log: "text/plain",
        sql: "application/sql",
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
