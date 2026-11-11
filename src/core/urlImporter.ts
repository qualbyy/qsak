import type { AppLimits } from "./types";

export interface ParsedUrlList {
  urls: string[];
  invalidLines: string[];
}

const URL_LINE_RE = /^(https?:\/\/[^\s]+|data:[^\s]+)$/i;

export function parseUrlList(raw: string): ParsedUrlList {
  const urls: string[] = [];
  const invalidLines: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//") || line.startsWith(";")) {
      continue;
    }

    // Handle markdown link [label](https://...) or CSV/TSV cell containing a URL
    const mdMatch = /^\[[^\]]*\]\((https?:\/\/[^)]+)\)$/i.exec(line);
    const candidate = (mdMatch ? mdMatch[1] : line).replace(/^<|>$/g, "").trim();

    if (!URL_LINE_RE.test(candidate)) {
      invalidLines.push(line);
      continue;
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "data:") {
        invalidLines.push(line);
        continue;
      }
      if (!seen.has(candidate)) {
        seen.add(candidate);
        urls.push(candidate);
      }
    } catch {
      invalidLines.push(line);
    }
  }

  return { urls, invalidLines };
}

export function isUrlListContent(fileName: string, textSample: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".urls") || lower.endsWith(".list") || lower.endsWith(".url")) {
    return parseUrlList(textSample).urls.length > 0;
  }
  if (!lower.endsWith(".txt") && !lower.endsWith(".csv")) {
    return false;
  }

  const nonEmpty = textSample
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//") && !l.startsWith(";"));
  if (nonEmpty.length === 0) return false;

  const { urls } = parseUrlList(textSample);
  return urls.length > 0 && urls.length / nonEmpty.length >= 0.5;
}

const MIME_EXT_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/x-icon": "ico",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "application/json": "json",
  "application/x-ndjson": "jsonl",
  "application/yaml": "yaml",
  "text/yaml": "yaml",
  "application/toml": "toml",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "text/markdown": "md",
  "text/html": "html",
  "text/plain": "txt",
  "application/zip": "zip",
  "application/gzip": "gz",
  "application/x-7z-compressed": "7z",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/opus": "opus",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

function parseFilenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ""));
    } catch {
      return utf8Match[1].trim();
    }
  }
  const basicMatch = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return basicMatch ? basicMatch[1].trim() : null;
}

export function inferFileNameFromUrl(url: string, contentType?: string | null, disposition?: string | null): string {
  const fromDisposition = parseFilenameFromDisposition(disposition ?? null);
  if (fromDisposition) {
    return fromDisposition.replace(/[/\\]/g, "_");
  }

  const mimeClean = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const extFromMime = MIME_EXT_MAP[mimeClean];

  if (url.startsWith("data:")) {
    const ext = extFromMime ?? "bin";
    return `data-import.${ext}`;
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) {
      const decoded = decodeURIComponent(last).replace(/[/\\?%*:|"<>]/g, "_");
      if (decoded.includes(".")) return decoded;
      return extFromMime ? `${decoded}.${extFromMime}` : decoded;
    }
  } catch {
    // ignore URL parse error
  }

  return `download.${extFromMime ?? "bin"}`;
}

export interface FetchedUrlFile {
  url: string;
  fileName: string;
  bytes: Uint8Array;
  mime: string;
}

export async function fetchUrlAsBytes(
  url: string,
  limits: AppLimits,
  externalSignal?: AbortSignal,
): Promise<FetchedUrlFile> {
  if (url.startsWith("data:")) {
    const res = await fetch(url);
    const buf = new Uint8Array(await res.arrayBuffer());
    const maxBytes = limits.maxFileSizeMb > 0 ? limits.maxFileSizeMb * 1024 * 1024 : Infinity;
    if (buf.byteLength > maxBytes) {
      throw new Error(`File exceeds limit (${limits.maxFileSizeMb} MB)`);
    }
    const mime = res.headers.get("content-type") || "application/octet-stream";
    return {
      url,
      fileName: inferFileNameFromUrl(url, mime, null),
      bytes: buf,
      mime,
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(5, limits.urlTimeoutSec) * 1000;
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);

  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      mode: "cors",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const maxBytes = limits.maxFileSizeMb > 0 ? limits.maxFileSizeMb * 1024 * 1024 : Infinity;
    const lenHeader = response.headers.get("content-length");
    if (lenHeader) {
      const expectedLen = Number.parseInt(lenHeader, 10);
      if (Number.isFinite(expectedLen) && expectedLen > maxBytes) {
        throw new Error(`Remote file (${Math.ceil(expectedLen / (1024 * 1024))} MB) exceeds ${limits.maxFileSizeMb} MB limit`);
      }
    }

    let bytes: Uint8Array;
    if (response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.byteLength;
          if (received > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new Error(`Download aborted: exceeded ${limits.maxFileSizeMb} MB limit`);
          }
          chunks.push(value);
        }
      }

      bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } else {
      const buf = new Uint8Array(await response.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        throw new Error(`Download exceeds ${limits.maxFileSizeMb} MB limit`);
      }
      bytes = buf;
    }

    const contentType = response.headers.get("content-type");
    const disposition = response.headers.get("content-disposition");
    const fileName = inferFileNameFromUrl(url, contentType, disposition);

    return {
      url,
      fileName,
      bytes,
      mime: (contentType ?? "application/octet-stream").split(";")[0].trim(),
    };
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error("Blocked by CORS or network error (use desktop app or CORS-enabled URL)");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
