import yaml from "js-yaml";
import * as TOML from "smol-toml";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import Papa from "papaparse";
import { marked } from "marked";
import TurndownService from "turndown";
import type { ConvertJobResult, TextOperationId } from "../core/types";
import { replaceExt } from "../core/registry";
import { md5Hex, sha256Hex, sha512Hex } from "./hash";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: true,
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  indentBy: "  ",
});

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

function parseIni(raw: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let section: Record<string, unknown> | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;
    const secMatch = /^\[([^\]]+)\]$/.exec(trimmed);
    if (secMatch) {
      const name = secMatch[1].trim();
      section = {};
      root[name] = section;
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      const target = section ?? root;
      target[key] = val;
    }
  }
  return root;
}

function stringifyIni(data: unknown): string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("INI requires a key-value object");
  }
  const topLines: string[] = [];
  const sectionBlocks: string[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const lines = [`[${k}]`];
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        lines.push(`${sk}=${sv === null || sv === undefined ? "" : String(sv)}`);
      }
      sectionBlocks.push(lines.join("\n"));
    } else {
      topLines.push(`${k}=${v === null || v === undefined ? "" : String(v)}`);
    }
  }
  return [...topLines, ...sectionBlocks].join("\n\n").trim() + "\n";
}

function parseEnv(raw: string): Record<string, string> {
  const res: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const cleaned = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = cleaned.indexOf("=");
    if (eq <= 0) continue;
    const key = cleaned.slice(0, eq).trim();
    let val = cleaned.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    res[key] = val;
  }
  return res;
}

function stringifyEnv(data: unknown): string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(".env requires a flat key-value object");
  }
  const lines: string[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const str = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    const needsQuotes = /[\s#"']/.test(str);
    lines.push(`${k}=${needsQuotes ? JSON.stringify(str) : str}`);
  }
  return lines.join("\n") + "\n";
}

function parseDelimited(raw: string, delimiter?: string): unknown[] {
  const parsed = Papa.parse<Record<string, unknown>>(raw.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    delimiter,
  });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(parsed.errors[0].message);
  }
  return parsed.data;
}

function stringifyDelimited(data: unknown, delimiter: string): string {
  const rows = Array.isArray(data) ? data : [data];
  return Papa.unparse(rows as Record<string, unknown>[], { delimiter }) + "\n";
}

function parseJsonl(raw: string): unknown[] {
  const rows: unknown[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(JSON.parse(trimmed));
  }
  return rows;
}

function stringifyJsonl(data: unknown): string {
  const rows = Array.isArray(data) ? data : [data];
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

function parseProperties(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    const eq = trimmed.search(/[=:]/);
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    out[key] = val;
  }
  return out;
}

function stringifyProperties(data: unknown): string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(".properties requires a key-value object");
  }
  const lines: string[] = [];
  const flatten = (obj: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        flatten(v as Record<string, unknown>, fullKey);
      } else {
        lines.push(`${fullKey}=${v === null || v === undefined ? "" : String(v)}`);
      }
    }
  };
  flatten(data as Record<string, unknown>, "");
  return lines.join("\n") + "\n";
}

function sqlEscapeValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  return `'${str.replace(/'/g, "''")}'`;
}

function stringifySqlInsert(data: unknown, tableName = "records"): string {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return "-- Empty dataset\n";
  const objects: Record<string, unknown>[] = rows.map((r) =>
    typeof r === "object" && r !== null && !Array.isArray(r) ? (r as Record<string, unknown>) : { value: r },
  );
  const cols = Array.from(new Set(objects.flatMap((o) => Object.keys(o))));
  const quotedCols = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");
  return (
    objects
      .map((obj) => {
        const vals = cols.map((c) => sqlEscapeValue(obj[c])).join(", ");
        return `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${vals});`;
      })
      .join("\n") + "\n"
  );
}

function srtToVtt(raw: string): string {
  const body = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body.trim()}\n`;
}

function vttToSrt(raw: string): string {
  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/^WEBVTT[^\n]*\n+/i, "")
    .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, "$1,$2");
  const blocks = cleaned
    .trim()
    .split(/\n{2,}/)
    .filter((b) => b.includes("-->"));
  return blocks
    .map((block, idx) => {
      const lines = block.split("\n");
      if (/^\d+$/.test(lines[0].trim())) return block;
      return `${idx + 1}\n${block}`;
    })
    .join("\n\n") + "\n";
}

function subtitlesToPlainText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/^WEBVTT[^\n]*\n+/i, "")
    .split("\n")
    .filter((line) => {
      const s = line.trim();
      if (!s) return false;
      if (/^\d+$/.test(s)) return false;
      if (/-->/.test(s)) return false;
      return true;
    })
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join("\n") + "\n";
}

function stripHtmlTags(html: string): string {
  return (
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

export function parseStructured(raw: string, format: string): unknown {
  switch (format.toLowerCase()) {
    case "json":
      return JSON.parse(raw);
    case "jsonl":
    case "ndjson":
      return parseJsonl(raw);
    case "yaml":
    case "yml":
      return yaml.load(raw);
    case "toml":
      return TOML.parse(raw);
    case "xml":
      return xmlParser.parse(raw);
    case "csv":
      return parseDelimited(raw);
    case "tsv":
      return parseDelimited(raw, "\t");
    case "ini":
      return parseIni(raw);
    case "env":
      return parseEnv(raw);
    case "properties":
      return parseProperties(raw);
    default:
      throw new Error(`Unsupported input data format: ${format}`);
  }
}

export function stringifyStructured(data: unknown, target: string): { text: string; ext: string; mime: string } {
  switch (target.toLowerCase()) {
    case "json":
    case "json-pretty":
      return { text: JSON.stringify(data, null, 2) + "\n", ext: "json", mime: "application/json" };
    case "json-minify":
      return { text: JSON.stringify(data), ext: "json", mime: "application/json" };
    case "jsonl":
    case "ndjson":
      return { text: stringifyJsonl(data), ext: "jsonl", mime: "application/x-ndjson" };
    case "yaml":
      return { text: yaml.dump(data, { noRefs: true, lineWidth: 120 }), ext: "yaml", mime: "application/yaml" };
    case "toml": {
      const obj = typeof data === "object" && data !== null && !Array.isArray(data) ? data : { items: data };
      return { text: TOML.stringify(obj as Record<string, unknown>) + "\n", ext: "toml", mime: "application/toml" };
    }
    case "xml": {
      const wrapped =
        typeof data === "object" && data !== null && !Array.isArray(data) && Object.keys(data).length === 1
          ? data
          : { root: data };
      return { text: xmlBuilder.build(wrapped) + "\n", ext: "xml", mime: "application/xml" };
    }
    case "csv":
      return { text: stringifyDelimited(data, ","), ext: "csv", mime: "text/csv" };
    case "tsv":
      return { text: stringifyDelimited(data, "\t"), ext: "tsv", mime: "text/tab-separated-values" };
    case "ini":
      return { text: stringifyIni(data), ext: "ini", mime: "text/plain" };
    case "env":
      return { text: stringifyEnv(data), ext: "env", mime: "text/plain" };
    case "properties":
      return { text: stringifyProperties(data), ext: "properties", mime: "text/plain" };
    case "sql":
      return { text: stringifySqlInsert(data), ext: "sql", mime: "application/sql" };
    default:
      throw new Error(`Unsupported output data format: ${target}`);
  }
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function decodeBase64Utf8(b64: string): string {
  const clean = b64.trim().replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function decodeJwt(token: string): string {
  const parts = token.trim().split(".");
  if (parts.length < 2) throw new Error("Invalid JWT format (expected header.payload[.signature])");
  const header = JSON.parse(decodeBase64Utf8(parts[0]));
  const payload = JSON.parse(decodeBase64Utf8(parts[1]));
  return JSON.stringify({ header, payload, signature: parts[2] ?? "" }, null, 2);
}

export async function runTextOperation(op: TextOperationId, input: string): Promise<string> {
  switch (op) {
    case "json-to-yaml":
      return stringifyStructured(parseStructured(input, "json"), "yaml").text;
    case "yaml-to-json":
      return stringifyStructured(parseStructured(input, "yaml"), "json").text;
    case "json-to-toml":
      return stringifyStructured(parseStructured(input, "json"), "toml").text;
    case "toml-to-json":
      return stringifyStructured(parseStructured(input, "toml"), "json").text;
    case "json-to-xml":
      return stringifyStructured(parseStructured(input, "json"), "xml").text;
    case "xml-to-json":
      return stringifyStructured(parseStructured(input, "xml"), "json").text;
    case "json-to-csv":
      return stringifyStructured(parseStructured(input, "json"), "csv").text;
    case "csv-to-json":
      return stringifyStructured(parseStructured(input, "csv"), "json").text;
    case "json-to-tsv":
      return stringifyStructured(parseStructured(input, "json"), "tsv").text;
    case "tsv-to-json":
      return stringifyStructured(parseStructured(input, "tsv"), "json").text;
    case "json-to-jsonl":
      return stringifyStructured(parseStructured(input, "json"), "jsonl").text;
    case "jsonl-to-json":
      return stringifyStructured(parseStructured(input, "jsonl"), "json").text;
    case "ini-to-json":
      return stringifyStructured(parseStructured(input, "ini"), "json").text;
    case "json-to-ini":
      return stringifyStructured(parseStructured(input, "json"), "ini").text;
    case "env-to-json":
      return stringifyStructured(parseStructured(input, "env"), "json").text;
    case "json-to-env":
      return stringifyStructured(parseStructured(input, "json"), "env").text;
    case "properties-to-json":
      return stringifyStructured(parseStructured(input, "properties"), "json").text;
    case "json-to-properties":
      return stringifyStructured(parseStructured(input, "json"), "properties").text;
    case "json-to-sql":
      return stringifyStructured(parseStructured(input, "json"), "sql").text;
    case "json-pretty":
      return stringifyStructured(parseStructured(input, "json"), "json-pretty").text;
    case "json-minify":
      return stringifyStructured(parseStructured(input, "json"), "json-minify").text;
    case "md-to-html":
      return await marked.parse(input);
    case "html-to-md":
      return turndown.turndown(input);
    case "md-to-txt":
      return stripHtmlTags(await marked.parse(input));
    case "html-to-txt":
      return stripHtmlTags(input);
    case "srt-to-vtt":
      return srtToVtt(input);
    case "vtt-to-srt":
      return vttToSrt(input);
    case "base64-encode":
      return encodeBase64Utf8(input);
    case "base64-decode":
      return decodeBase64Utf8(input);
    case "hex-encode": {
      const bytes = new TextEncoder().encode(input);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    case "hex-decode": {
      const clean = input.replace(/\s+/g, "");
      if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
        throw new Error("Invalid hex string");
      }
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      return new TextDecoder().decode(bytes);
    }
    case "url-encode":
      return encodeURIComponent(input);
    case "url-decode":
      return decodeURIComponent(input);
    case "jwt-decode":
      return decodeJwt(input);
    case "hash-sha256":
      return await sha256Hex(new TextEncoder().encode(input));
    case "hash-sha512":
      return await sha512Hex(new TextEncoder().encode(input));
    case "hash-md5":
      return md5Hex(new TextEncoder().encode(input));
  }
}

export async function convertTextFile(
  bytes: Uint8Array,
  fileName: string,
  sourceFormat: string,
  targetFormat: string,
): Promise<ConvertJobResult> {
  const input = new TextDecoder("utf-8").decode(bytes);
  const src = sourceFormat.toLowerCase();
  const dst = targetFormat.toLowerCase();

  if (src === "md" && dst === "html") {
    const html = await marked.parse(input);
    return {
      outputName: replaceExt(fileName, "html"),
      mime: "text/html",
      bytes: new TextEncoder().encode(html),
    };
  }
  if (src === "html" && dst === "md") {
    const md = turndown.turndown(input) + "\n";
    return {
      outputName: replaceExt(fileName, "md"),
      mime: "text/markdown",
      bytes: new TextEncoder().encode(md),
    };
  }
  if (src === "md" && dst === "txt") {
    const txt = stripHtmlTags(await marked.parse(input));
    return {
      outputName: replaceExt(fileName, "txt"),
      mime: "text/plain",
      bytes: new TextEncoder().encode(txt),
    };
  }
  if (src === "html" && dst === "txt") {
    const txt = stripHtmlTags(input);
    return {
      outputName: replaceExt(fileName, "txt"),
      mime: "text/plain",
      bytes: new TextEncoder().encode(txt),
    };
  }
  if (src === "srt" && dst === "vtt") {
    return {
      outputName: replaceExt(fileName, "vtt"),
      mime: "text/vtt",
      bytes: new TextEncoder().encode(srtToVtt(input)),
    };
  }
  if (src === "vtt" && dst === "srt") {
    return {
      outputName: replaceExt(fileName, "srt"),
      mime: "application/x-subrip",
      bytes: new TextEncoder().encode(vttToSrt(input)),
    };
  }
  if ((src === "srt" || src === "vtt") && dst === "txt") {
    return {
      outputName: replaceExt(fileName, "txt"),
      mime: "text/plain",
      bytes: new TextEncoder().encode(subtitlesToPlainText(input)),
    };
  }

  const parsed = parseStructured(input, src);
  const out = stringifyStructured(parsed, dst);
  return {
    outputName: replaceExt(fileName, out.ext),
    mime: out.mime,
    bytes: new TextEncoder().encode(out.text),
  };
}
