import type { FormatAction, TextOperationId } from "./types";

const IMAGE_TARGETS: FormatAction[] = [
  { target: "webp", label: "WebP", category: "image", supportsQuality: true, supportsResize: true },
  { target: "png", label: "PNG", category: "image", supportsResize: true },
  { target: "jpg", label: "JPEG", category: "image", supportsQuality: true, supportsResize: true },
  { target: "avif", label: "AVIF", category: "image", supportsQuality: true, supportsResize: true },
  { target: "bmp", label: "BMP", category: "image", supportsResize: true },
  { target: "tga", label: "TGA", category: "image", supportsResize: true },
  { target: "ico", label: "ICO (favicon)", category: "image" },
  { target: "pdf", label: "PDF (page)", category: "document" },
];

const SVG_TARGETS: FormatAction[] = [
  ...IMAGE_TARGETS,
  { target: "svg-minify", label: "SVG (minify)", category: "image" },
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
  { target: "mkv", label: "MKV (Matroska)", category: "media" },
  { target: "mov", label: "MOV (QuickTime)", category: "media" },
  { target: "avi", label: "AVI (MPEG4)", category: "media" },
  { target: "gif", label: "Animated GIF", category: "media" },
  { target: "mp4-mute", label: "MP4 (no audio)", category: "media" },
  { target: "mp4-10mb", label: "Compress ≤ 10 MB (MP4)", category: "media" },
  { target: "mp4-25mb", label: "Compress ≤ 25 MB (MP4)", category: "media" },
  { target: "mp3", label: "Extract audio (MP3)", category: "media" },
  { target: "wav", label: "Extract audio (WAV)", category: "media" },
  { target: "opus", label: "Extract audio (Opus)", category: "media" },
  { target: "flac", label: "Extract audio (FLAC)", category: "media" },
];

const AUDIO_TARGETS: FormatAction[] = [
  { target: "mp3", label: "MP3 (192k)", category: "media" },
  { target: "wav", label: "WAV (PCM)", category: "media" },
  { target: "ogg", label: "OGG (Vorbis)", category: "media" },
  { target: "opus", label: "Opus (.opus)", category: "media" },
  { target: "aac", label: "AAC (.m4a)", category: "media" },
  { target: "flac", label: "FLAC (lossless)", category: "media" },
  { target: "aiff", label: "AIFF (Apple PCM)", category: "media" },
];

const TEXT_CONVERSION_TARGETS: Record<string, FormatAction[]> = {
  json: [
    { target: "yaml", label: "YAML", category: "text" },
    { target: "toml", label: "TOML", category: "text" },
    { target: "xml", label: "XML", category: "text" },
    { target: "csv", label: "CSV", category: "text" },
    { target: "tsv", label: "TSV", category: "text" },
    { target: "jsonl", label: "JSONL (NDJSON)", category: "text" },
    { target: "xlsx", label: "XLSX (Excel)", category: "document" },
    { target: "sql", label: "SQL (INSERT)", category: "text" },
    { target: "ini", label: "INI", category: "text" },
    { target: "env", label: ".env", category: "text" },
    { target: "properties", label: ".properties", category: "text" },
    { target: "json-pretty", label: "JSON (pretty)", category: "text" },
    { target: "json-minify", label: "JSON (minify)", category: "text" },
  ],
  jsonl: [
    { target: "json", label: "JSON (array)", category: "text" },
    { target: "csv", label: "CSV", category: "text" },
    { target: "tsv", label: "TSV", category: "text" },
    { target: "xlsx", label: "XLSX (Excel)", category: "document" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "sql", label: "SQL (INSERT)", category: "text" },
  ],
  yaml: [
    { target: "json", label: "JSON", category: "text" },
    { target: "toml", label: "TOML", category: "text" },
    { target: "xml", label: "XML", category: "text" },
    { target: "ini", label: "INI", category: "text" },
    { target: "env", label: ".env", category: "text" },
  ],
  toml: [
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "xml", label: "XML", category: "text" },
    { target: "ini", label: "INI", category: "text" },
  ],
  xml: [
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "toml", label: "TOML", category: "text" },
  ],
  csv: [
    { target: "json", label: "JSON", category: "text" },
    { target: "jsonl", label: "JSONL (NDJSON)", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "tsv", label: "TSV", category: "text" },
    { target: "xlsx", label: "XLSX (Excel)", category: "document" },
    { target: "xml", label: "XML", category: "text" },
    { target: "sql", label: "SQL (INSERT)", category: "text" },
  ],
  xlsx: [
    { target: "csv", label: "CSV", category: "text" },
    { target: "tsv", label: "TSV", category: "text" },
    { target: "json", label: "JSON", category: "text" },
    { target: "jsonl", label: "JSONL (NDJSON)", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "sql", label: "SQL (INSERT)", category: "text" },
  ],
  tsv: [
    { target: "csv", label: "CSV", category: "text" },
    { target: "json", label: "JSON", category: "text" },
    { target: "jsonl", label: "JSONL (NDJSON)", category: "text" },
    { target: "xlsx", label: "XLSX (Excel)", category: "document" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "sql", label: "SQL (INSERT)", category: "text" },
  ],
  ini: [
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "toml", label: "TOML", category: "text" },
    { target: "properties", label: ".properties", category: "text" },
    { target: "env", label: ".env", category: "text" },
  ],
  env: [
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "properties", label: ".properties", category: "text" },
    { target: "ini", label: "INI", category: "text" },
  ],
  properties: [
    { target: "json", label: "JSON", category: "text" },
    { target: "yaml", label: "YAML", category: "text" },
    { target: "env", label: ".env", category: "text" },
    { target: "ini", label: "INI", category: "text" },
    { target: "toml", label: "TOML", category: "text" },
  ],
  md: [
    { target: "html", label: "HTML", category: "text" },
    { target: "txt", label: "Plain text (.txt)", category: "text" },
  ],
  html: [
    { target: "md", label: "Markdown", category: "text" },
    { target: "txt", label: "Plain text (.txt)", category: "text" },
  ],
  srt: [
    { target: "vtt", label: "WebVTT (.vtt)", category: "text" },
    { target: "txt", label: "Plain transcript (.txt)", category: "text" },
  ],
  vtt: [
    { target: "srt", label: "SubRip (.srt)", category: "text" },
    { target: "txt", label: "Plain transcript (.txt)", category: "text" },
  ],
};

export const IMAGE_FORMAT_SET = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "gif",
  "bmp",
  "tiff",
  "ico",
  "svg",
  "heic",
  "tga",
  "ppm",
  "pgm",
  "pbm",
]);

export const VIDEO_FORMAT_SET = new Set([
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
]);

export const AUDIO_FORMAT_SET = new Set([
  "mp3",
  "wav",
  "flac",
  "ogg",
  "aac",
  "m4a",
  "opus",
  "aiff",
  "wma",
  "ac3",
  "amr",
  "alac",
  "weba",
]);

export const ARCHIVE_FORMAT_SET = new Set(["zip", "tgz", "gz", "tar", "7z", "rar", "xz", "bz2", "apk", "jar"]);

export function getActionsForFormat(formatId: string): FormatAction[] {
  const id = formatId.toLowerCase();

  if (id === "svg") return SVG_TARGETS;
  if (IMAGE_FORMAT_SET.has(id)) return IMAGE_TARGETS;
  if (id === "pdf") return PDF_TARGETS;
  if (VIDEO_FORMAT_SET.has(id)) return VIDEO_TARGETS;
  if (AUDIO_FORMAT_SET.has(id)) return AUDIO_TARGETS;
  if (id === "cbz") {
    return [
      { target: "cbz-to-pdf", label: "PDF document (.pdf)", category: "document" },
      { target: "extract-zip", label: "Extract images (.zip)", category: "archive" },
    ];
  }
  if (id === "epub") {
    return [
      { target: "epub-to-txt", label: "Extract text (.txt)", category: "document" },
      { target: "extract-zip", label: "Extract chapters (.zip)", category: "archive" },
    ];
  }
  if (id in TEXT_CONVERSION_TARGETS) return TEXT_CONVERSION_TARGETS[id];
  if (ARCHIVE_FORMAT_SET.has(id)) {
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
  { id: "json-to-tsv", label: "JSON → TSV", group: "data", outputExt: "tsv", outputMime: "text/tab-separated-values" },
  { id: "tsv-to-json", label: "TSV → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-to-jsonl", label: "JSON → JSONL", group: "data", outputExt: "jsonl", outputMime: "application/x-ndjson" },
  { id: "jsonl-to-json", label: "JSONL → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "ini-to-json", label: "INI → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-to-ini", label: "JSON → INI", group: "data", outputExt: "ini", outputMime: "text/plain" },
  { id: "env-to-json", label: ".env → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-to-env", label: "JSON → .env", group: "data", outputExt: "env", outputMime: "text/plain" },
  { id: "properties-to-json", label: ".properties → JSON", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-to-properties", label: "JSON → .properties", group: "data", outputExt: "properties", outputMime: "text/plain" },
  { id: "json-to-sql", label: "JSON → SQL INSERT", group: "data", outputExt: "sql", outputMime: "application/sql" },
  { id: "json-pretty", label: "JSON format (pretty)", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "json-minify", label: "JSON minify", group: "data", outputExt: "json", outputMime: "application/json" },
  { id: "md-to-html", label: "Markdown → HTML", group: "markup", outputExt: "html", outputMime: "text/html" },
  { id: "html-to-md", label: "HTML → Markdown", group: "markup", outputExt: "md", outputMime: "text/markdown" },
  { id: "md-to-txt", label: "Markdown → Text", group: "markup", outputExt: "txt", outputMime: "text/plain" },
  { id: "html-to-txt", label: "HTML → Text", group: "markup", outputExt: "txt", outputMime: "text/plain" },
  { id: "srt-to-vtt", label: "SRT → WebVTT", group: "markup", outputExt: "vtt", outputMime: "text/vtt" },
  { id: "vtt-to-srt", label: "WebVTT → SRT", group: "markup", outputExt: "srt", outputMime: "application/x-subrip" },
  { id: "base64-encode", label: "Text → Base64", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "base64-decode", label: "Base64 → Text", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "hex-encode", label: "Text → Hex", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "hex-decode", label: "Hex → Text", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "url-encode", label: "URL encode", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "url-decode", label: "URL decode", group: "encoding", outputExt: "txt", outputMime: "text/plain" },
  { id: "jwt-decode", label: "JWT decode", group: "crypto", outputExt: "json", outputMime: "application/json" },
  { id: "hash-sha256", label: "SHA-256 hash", group: "crypto", outputExt: "txt", outputMime: "text/plain" },
  { id: "hash-sha512", label: "SHA-512 hash", group: "crypto", outputExt: "txt", outputMime: "text/plain" },
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
  "json-to-tsv": "tsv-to-json",
  "tsv-to-json": "json-to-tsv",
  "json-to-jsonl": "jsonl-to-json",
  "jsonl-to-json": "json-to-jsonl",
  "ini-to-json": "json-to-ini",
  "json-to-ini": "ini-to-json",
  "env-to-json": "json-to-env",
  "json-to-env": "env-to-json",
  "properties-to-json": "json-to-properties",
  "json-to-properties": "properties-to-json",
  "md-to-html": "html-to-md",
  "html-to-md": "md-to-html",
  "srt-to-vtt": "vtt-to-srt",
  "vtt-to-srt": "srt-to-vtt",
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
