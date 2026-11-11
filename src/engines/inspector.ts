import { detectFormat } from "../core/detect";
import type { InspectResult } from "../core/types";
import { listArchiveEntries } from "./archive";
import { md5Hex, sha1Hex, sha256Hex } from "./hash";
import { getPdfPageCount } from "./pdf";

function formatHexDump(bytes: Uint8Array, maxBytes = 256): string {
  const len = Math.min(bytes.length, maxBytes);
  const lines: string[] = [];

  for (let offset = 0; offset < len; offset += 16) {
    const slice = bytes.subarray(offset, Math.min(offset + 16, len));
    const addr = offset.toString(16).padStart(4, "0");
    const hexParts: string[] = [];
    let ascii = "";

    for (let i = 0; i < 16; i++) {
      if (i < slice.length) {
        const b = slice[i];
        hexParts.push(b.toString(16).padStart(2, "0"));
        ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
      } else {
        hexParts.push("  ");
        ascii += " ";
      }
    }

    lines.push(`${addr}  ${hexParts.slice(0, 8).join(" ")}  ${hexParts.slice(8).join(" ")}  |${ascii}|`);
  }

  return lines.join("\n");
}

export async function inspectFile(fileName: string, bytes: Uint8Array): Promise<InspectResult> {
  const detected = await detectFormat(fileName, bytes);
  const [sha256, sha1] = await Promise.all([sha256Hex(bytes), sha1Hex(bytes)]);
  const md5 = md5Hex(bytes);

  const result: InspectResult = {
    fileName,
    size: bytes.byteLength,
    detected,
    hexPreview: formatHexDump(bytes),
    sha256,
    sha1,
    md5,
  };

  if (detected.category === "archive" && ["zip", "tgz", "gz", "tar", "7z", "rar"].includes(detected.id)) {
    try {
      result.archiveEntries = await listArchiveEntries(bytes, detected.id, fileName);
    } catch {
      // ignore corrupted archive preview
    }
  }

  if (detected.id === "pdf") {
    try {
      result.pageCount = await getPdfPageCount(bytes);
    } catch {
      // ignore encrypted/corrupted pdf
    }
  }

  if (detected.category === "image" && typeof createImageBitmap === "function" && detected.id !== "svg") {
    try {
      const blob = new Blob([bytes.slice().buffer], { type: detected.mime });
      const bmp = await createImageBitmap(blob);
      result.dimensions = { width: bmp.width, height: bmp.height };
      bmp.close();
    } catch {
      // fallback if image decoder doesn't support this format directly
    }
  }

  if (detected.category === "text" || detected.id === "svg") {
    result.textPreview = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096));
  }

  return result;
}
