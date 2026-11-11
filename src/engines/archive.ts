import { gunzipSync, unzipSync, zipSync } from "fflate";
import type { ArchiveEntry, ConvertJobResult } from "../core/types";
import { replaceExt } from "../core/registry";

function parseTar(tarBytes: Uint8Array): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const dec = new TextDecoder();
  let offset = 0;

  while (offset + 512 <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;

    const rawName = dec.decode(header.subarray(0, 100)).replace(/\0.*$/, "");
    const prefix = dec.decode(header.subarray(345, 500)).replace(/\0.*$/, "");
    const name = prefix ? `${prefix}/${rawName}` : rawName;

    const sizeStr = dec.decode(header.subarray(124, 136)).replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeStr || "0", 8) || 0;
    const typeFlag = header[156];

    offset += 512;
    if (name && typeFlag !== 53 /* '5' directory */ && size >= 0) {
      files[name] = tarBytes.slice(offset, offset + size);
    }
    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}

async function extractVia7zWasm(bytes: Uint8Array, fileName: string): Promise<Record<string, Uint8Array>> {
  const SevenZip = (await import("7z-wasm")).default;
  const wasmUrl = (await import("7z-wasm/7zz.wasm?url")).default;
  const sz = await SevenZip({
    locateFile: () => wasmUrl,
  });

  const jobDir = `/job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const outDir = `${jobDir}/out`;
  const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "archive.7z";
  const inPath = `${jobDir}/${cleanName}`;

  sz.FS.mkdir(jobDir);
  sz.FS.mkdir(outDir);
  sz.FS.writeFile(inPath, bytes);
  sz.callMain(["x", inPath, `-o${outDir}`, "-y"]);

  const collected: Record<string, Uint8Array> = {};
  const walk = (dir: string, relBase: string) => {
    const entries = sz.FS.readdir(dir);
    for (const entry of entries) {
      if (entry === "." || entry === "..") continue;
      const full = `${dir}/${entry}`;
      const rel = relBase ? `${relBase}/${entry}` : entry;
      const stat = sz.FS.stat(full);
      if (sz.FS.isDir(stat.mode)) {
        walk(full, rel);
      } else {
        collected[rel] = sz.FS.readFile(full);
      }
    }
  };
  walk(outDir, "");
  return collected;
}

export async function extractArchiveFiles(
  bytes: Uint8Array,
  sourceFormat: string,
  fileName: string,
): Promise<Record<string, Uint8Array>> {
  const fmt = sourceFormat.toLowerCase();
  if (["zip", "cbz", "epub", "apk", "jar"].includes(fmt)) {
    return unzipSync(bytes);
  }
  if (fmt === "tgz" || fileName.toLowerCase().endsWith(".tar.gz")) {
    const tar = gunzipSync(bytes);
    return parseTar(tar);
  }
  if (fmt === "tar") {
    return parseTar(bytes);
  }
  if (fmt === "gz") {
    const out = gunzipSync(bytes);
    const innerName = fileName.replace(/\.gz$/i, "") || "extracted.bin";
    return { [innerName]: out };
  }
  if (["7z", "rar", "xz", "bz2"].includes(fmt)) {
    return extractVia7zWasm(bytes, fileName);
  }
  throw new Error(`Archive extraction not supported for: ${sourceFormat}`);
}

export async function listArchiveEntries(
  bytes: Uint8Array,
  sourceFormat: string,
  fileName: string,
): Promise<ArchiveEntry[]> {
  const files = await extractArchiveFiles(bytes, sourceFormat, fileName);
  return Object.entries(files).map(([path, data]) => ({
    path,
    size: data.byteLength,
    isDir: path.endsWith("/") && data.byteLength === 0,
  }));
}

export function packFilesToZip(files: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const record: Record<string, Uint8Array> = {};
  const seen = new Map<string, number>();

  for (const file of files) {
    const clean = file.name.replace(/^\/+/, "");
    const count = seen.get(clean) ?? 0;
    seen.set(clean, count + 1);
    const finalName = count === 0 ? clean : `${count}_${clean}`;
    record[finalName] = file.bytes;
  }

  return zipSync(record, { level: 6 });
}

export async function rearchiveToZip(
  bytes: Uint8Array,
  fileName: string,
  sourceFormat: string,
): Promise<ConvertJobResult> {
  const extracted = await extractArchiveFiles(bytes, sourceFormat, fileName);
  const zipped = zipSync(extracted, { level: 6 });
  return {
    outputName: replaceExt(fileName.replace(/\.tar\.gz$/i, ".tar"), "zip"),
    mime: "application/zip",
    bytes: zipped,
    meta: { entries: Object.keys(extracted).length },
  };
}
