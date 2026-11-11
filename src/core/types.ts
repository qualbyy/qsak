export type FormatCategory = "image" | "text" | "archive" | "document" | "media" | "unknown";

export interface DetectedFormat {
  id: string;
  ext: string;
  mime: string;
  category: FormatCategory;
  confidence: "magic" | "ext" | "heuristic";
}

export interface ConvertOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  stripExif?: boolean;
  pretty?: boolean;
  minify?: boolean;
  iconSizes?: number[];
  targetSizeMb?: number;
  pageRange?: string;
}

export interface ConvertJobInput {
  fileName: string;
  bytes: Uint8Array;
  sourceFormat: string;
  targetFormat: string;
  options?: ConvertOptions;
}

export interface ConvertJobResult {
  outputName: string;
  mime: string;
  bytes: Uint8Array;
  meta?: Record<string, string | number>;
}

export interface ArchiveEntry {
  path: string;
  size: number;
  isDir: boolean;
}

export interface InspectResult {
  fileName: string;
  size: number;
  detected: DetectedFormat;
  hexPreview: string;
  sha256: string;
  sha1: string;
  md5: string;
  dimensions?: { width: number; height: number };
  pageCount?: number;
  archiveEntries?: ArchiveEntry[];
  textPreview?: string;
}

export type TextOperationId =
  | "json-to-yaml"
  | "yaml-to-json"
  | "json-to-toml"
  | "toml-to-json"
  | "json-to-xml"
  | "xml-to-json"
  | "json-to-csv"
  | "csv-to-json"
  | "json-to-tsv"
  | "tsv-to-json"
  | "json-to-jsonl"
  | "jsonl-to-json"
  | "ini-to-json"
  | "json-to-ini"
  | "env-to-json"
  | "json-to-env"
  | "properties-to-json"
  | "json-to-properties"
  | "json-to-sql"
  | "json-pretty"
  | "json-minify"
  | "md-to-html"
  | "html-to-md"
  | "md-to-txt"
  | "html-to-txt"
  | "srt-to-vtt"
  | "vtt-to-srt"
  | "base64-encode"
  | "base64-decode"
  | "hex-encode"
  | "hex-decode"
  | "url-encode"
  | "url-decode"
  | "jwt-decode"
  | "hash-sha256"
  | "hash-sha512"
  | "hash-md5";

export interface AppLimits {
  maxFileSizeMb: number;
  maxBatchFiles: number;
  maxTotalQueueMb: number;
  maxUrlCount: number;
  urlTimeoutSec: number;
  browserWarnMb: number;
}

export interface FormatAction {
  target: string;
  label: string;
  category: FormatCategory;
  supportsQuality?: boolean;
  supportsResize?: boolean;
}
