import type { FormatAction, TextOperationId } from "./types";

const IMAGE_TARGETS: FormatAction[] = [
  { target: "webp", label: "WebP", category: "image", supportsQuality: true, supportsResize: true },
  { target: "png", label: "PNG", category: "image", supportsResize: true },
  { target: "jpg", label: "JPEG", category: "image", supportsQuality: true, supportsResize: true },
  { target: "avif", label: "AVIF", category: "image", supportsQuality: true, supportsResize: true },
  { target: "ico", label: "ICO (favicon)", category: "image" },
  { target: "pdf", label: "PDF (page)", category: "document" },
];

const PDF_TARGETS: FormatAction[] = [
  { target: "pdf-to-png-zip", label: "PNG pages (.zip)", category: "document" },
  { target: "pdf-to-jpg-zip", label: "JPEG pages (.zip)", category: "document" },
  { target: "pdf-split-zip", label: "Split pages (.zip)", category: "document" },
  { target: "pdf-rotate-90", label: "Rotate 90°", category: "document" },
  { target: "pdf-rotate-180", label: "Rotate 180°", category: "document" },
  { target: "pdf-strip-meta", label: "Strip metadata / resave", category: "document" },
  { target: "pdf-to-txt", label: "Extract text (.txt)", category: "document" },
];

const VIDEO_TARGETS: FormatAction[] = [
  { target: "mp4", label: "MP4 (H.264)", category: "media" },
  { target: "webm", label: "WebM (VP9/Opus)", category: "media" },
  { target: "gif", label: "Animated GIF", category: "media" },
  { target: "mp4-mute", label: "MP4 (no audio)", category: "media" },
  { target: "mp4-10mb", label: "Compress ≤ 10 MB (MP4)", category: "media" },
  { target: "mp4-25mb", label: "Compress ≤ 25 MB (MP4)", category: "media" },
  { target: "mp3", label: "Extract audio (MP3)", category: "media" },
  { target: "wav", label: "Extract audio (WAV)", category: "media" },
];

const AUDIO_TARGETS: FormatAction[] = [
  { target: "mp3", label: "MP3 (192k)", category: "media" },
  { target: "wav", label: "WAV (PCM)", category: "media" },
  { target: "ogg", label: "OGG (Vorbis)", category: "media" },
  { target: "aac", label: "AAC (.m4a)", category: "media" },
  { target: "flac", label: "FLAC (lossless)", category: "media" },
];

const TEXT_CONVERSION_TARGETS: Record<string, FormatAction[]> = {
  json: [
    { target: "yaml", label: "YAML", category: "text" },
    { target: "toml", label: "TOML", category: "text" },
    { target: "xml", label: "XML", category: "text" },
    { target: "csv", label: "CSV", category: "text" },
    { target: "xlsx", label: "XLSX (Excel)", category: "document" },
    { target: "ini", label: "INI", category: "text" },
    { target: "env", label: ".env", category: "text" },
    { target: "json-pretty", label: "JSON (pretty)", category: "text" },
    { target: "json-minify", label: "JSON (minify)", category: "text" },
  ],
  yaml: [
    { target: "json", label: "JSON", category: "text" },
    { target: "toml", label: "TOML", category: "text" },
    { target: "xml", label: "XML", category: "text" },
  ],
  toml: [
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "xml", label: "XML", category: "text" },
  ],
  xml: [
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
  ],
  csv: [
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "tsv", label: "TSV", category: "text" },
    { target: "xlsx", label: "XLSX (Excel)", category: "document" },
  ],
  xlsx: [
    { target: "csv", label: "CSV", category: "text" },
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
  ],
  tsv: [
    { target: "csv", label: "CSV", category: "text" },
    { target: "json", label: "JSON", category: "text" },
  ],
  ini: [
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "toml", label: "TOML", category: "text" },
  ],
  env: [
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
  ],
  md: [{ target: "html", label: "HTML", category: "text" }],
  html: [{ target: "md", label: "Markdown", category: "text" }],
};

export function getActionsForFormat(formatId: string): FormatAction[] {
  const id = formatId.toLowerCase();

  if (["png", "jpg", "webp", "avif", "gif", "bmp", "svg", "heic"].includes(id)) {
    return IMAGE_TARGETS;
  }

  if (id === "pdf") {
    return PDF_TARGETS;
  }

  if (["mp4", "webm", "mkv", "mov", "avi"].includes(id)) {
    return VIDEO_TARGETS;
  }

  if (["mp3", "wav", "flac", "ogg", "aac", "m4a"].includes(id)) {
    return AUDIO_TARGETS;
  }

  if (id in TEXT_CONVERSION_TARGETS) {
    return TEXT_CONVERSION_TARGETS[id];
  }

  if (["zip", "tgz", "gz", "tar", "7z", "rar", "xz", "bz2"].includes(id)) {
    return [{ target: "extract-zip", label: "Extract (.zip bundle)", category: "archive" }];
  }

  return [];
}

export interface TextOperationMeta {
  id: TextOperationId;
  label: string;
  group: "data" | "markup" | "encoding" | "crypto";
  outputExt: string;
  outputMime: string;
}

export const TEXT_OPERATIONS: TextOperationMeta[] = [
  { id: "json-to-yaml", label: "JSON → YAML", group: "data", outputExt: "yaml", outputMime: "application/yaml" },
  { id: "yaml-to-json", label: "YAML → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-to-toml", label: "JSON → TOML", group: "data", outputExt: "toml", outputMime: "application/toml" },
  { id: "toml-to-json", label: "TOML → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-to-xml", label: "JSON → XML", group: "data", outputExt: "xml", outputMime: "application/xml" },
  { id: "xml-to-json", label: "XML → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-to-csv", label: "JSON → CSV", group: "data", outputExt: "csv", outputMime: "text/csv" },
  { id: "csv-to-json", label: "CSV → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "ini-to-json", label: "INI → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-to-ini", label: "JSON → INI", group: "data", outputExt: "ini", outputMime: "text/plain" },
  { id: "env-to-json", label: ".env → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-to-env", label: "JSON → .env", group: "data", outputExt: "env", outputMime: "text/plain" },
  { id: "json-pretty", label: "JSON format (pretty)", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-minify", label: "JSON minify", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "md-to-html", label: "Markdown → HTML", group: "markup", outputExt: "html", outputMime: "text/html" },
  { id: "html-to-md", label: "HTML → Markdown", group: "markup", outputExt: "md", outputMime: "text/markdown" },
  { id: "base64-encode", label: "Text → Base64", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "base64-decode", label: "Base64 → Text", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "hex-encode", label: "Text → Hex", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "hex-decode", label: "Hex → Text", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "url-encode", label: "URL encode", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "url-decode", label: "URL decode", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "jwt-decode", label: "JWT decode", group: "crypto", outputExt: "json", outputMime: "application/json" },
  { id: "hash-sha256", label: "SHA-256 hash", group: "crypto", outputExt: "txt", outputMime: "text/plain" },
  { id: "hash-md5", label: "MD5 hash", group: "crypto", outputExt: "txt", outputMime: "text/plain" },
];

export const SWAP_MAP: Partial<Record<TextOperationId, TextOperationId>> = {
  "json-to-yaml": "yaml-to-json",
  "yaml-to-json": "json-to-yaml",
  "json-to-toml": "toml-to-json",
  "toml-to-json": "json-to-toml",
  "json-to-xml": "xml-to-json",
  "xml-to-json": "json-to-xml",
  "json-to-csv": "csv-to-json",
  "csv-to-json": "json-to-csv",
  "ini-to-json": "json-to-ini",
  "json-to-ini": "ini-to-json",
  "env-to-json": "json-to-env",
  "json-to-env": "env-to-json",
  "md-to-html": "html-to-md",
  "html-to-md": "md-to-html",
  "base64-encode": "base64-decode",
  "base64-decode": "base64-encode",
  "hex-encode": "hex-decode",
  "hex-decode": "hex-encode",
  "url-encode": "url-decode",
  "url-decode": "url-encode",
};

export function replaceExt(fileName: string, newExt: string): string {
  const cleanExt = newExt.startsWith(".") ? newExt.slice(1) : newExt;
  const idx = fileName.lastIndexOf(".");
  const base = idx > 0 ? fileName.slice(0, idx) : fileName;
  return `${base}.${cleanExt}`;
}
