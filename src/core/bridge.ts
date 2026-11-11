import * as Comlink from "comlink";
import type { TaskWorkerApi } from "../workers/task.worker";
import type { ConvertJobInput, ConvertJobResult, DetectedFormat, InspectResult, TextOperationId } from "./types";

let workerProxy: Comlink.Remote<TaskWorkerApi> | null = null;

const MEDIA_FORMATS = new Set(["mp4", "webm", "mkv", "mov", "avi", "mp3", "wav", "flac", "ogg", "aac", "m4a"]);
const NATIVE_IMAGE_SRC = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico"]);
const NATIVE_IMAGE_DST = new Set(["png", "jpg", "jpeg", "webp", "ico", "gif", "bmp"]);
const NATIVE_ARCHIVE_SRC = new Set(["zip", "tgz", "tar", "gz", "7z"]);

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getWorker(): Comlink.Remote<TaskWorkerApi> {
  if (!workerProxy) {
    const worker = new Worker(new URL("../workers/task.worker.ts", import.meta.url), {
      type: "module",
    });
    workerProxy = Comlink.wrap<TaskWorkerApi>(worker);
  }
  return workerProxy;
}

interface NativeJobResponse {
  outputName: string;
  mime: string;
  bytes: number[];
}

export const engineBridge = {
  async detect(fileName: string, bytes: Uint8Array): Promise<DetectedFormat> {
    return getWorker().detect(fileName, bytes);
  },

  async convert(job: ConvertJobInput): Promise<ConvertJobResult> {
    if (isTauriRuntime()) {
      const src = job.sourceFormat.toLowerCase();
      const dst = job.targetFormat.toLowerCase();
      const { invoke } = await import("@tauri-apps/api/core");

      if (MEDIA_FORMATS.has(src)) {
        const res = await invoke<NativeJobResponse>("native_convert_media", {
          fileName: job.fileName,
          bytes: Array.from(job.bytes),
          sourceFormat: src,
          targetFormat: dst,
        });
        return { outputName: res.outputName, mime: res.mime, bytes: new Uint8Array(res.bytes) };
      }

      if (NATIVE_IMAGE_SRC.has(src) && NATIVE_IMAGE_DST.has(dst)) {
        const res = await invoke<NativeJobResponse>("native_convert_image", {
          fileName: job.fileName,
          bytes: Array.from(job.bytes),
          targetFormat: dst,
          quality: job.options?.quality ?? 85,
          maxWidth: job.options?.maxWidth ?? null,
        });
        return { outputName: res.outputName, mime: res.mime, bytes: new Uint8Array(res.bytes) };
      }

      if (dst === "extract-zip" && NATIVE_ARCHIVE_SRC.has(src)) {
        const res = await invoke<NativeJobResponse>("native_extract_to_zip", {
          fileName: job.fileName,
          bytes: Array.from(job.bytes),
          sourceFormat: src,
        });
        return { outputName: res.outputName, mime: res.mime, bytes: new Uint8Array(res.bytes) };
      }
    }

    return getWorker().convert(job);
  },

  async convertLargeMediaFromDisk(targetFormat: string): Promise<string | null> {
    if (!isTauriRuntime()) return null;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const selected = await open({
      multiple: false,
      filters: [{ name: "Media", extensions: ["mp4", "mkv", "mov", "webm", "avi", "mp3", "wav", "flac"] }],
    });
    if (!selected || typeof selected !== "string") return null;
    return invoke<string>("native_convert_media_path", {
      inputPath: selected,
      targetFormat,
    });
  },

  async runText(op: TextOperationId, input: string): Promise<string> {
    return getWorker().runText(op, input);
  },

  async inspect(fileName: string, bytes: Uint8Array): Promise<InspectResult> {
    return getWorker().inspect(fileName, bytes);
  },

  async packZip(files: Array<{ name: string; bytes: Uint8Array }>): Promise<Uint8Array> {
    return getWorker().packZip(files);
  },

  async mergePdfs(files: Array<{ name: string; bytes: Uint8Array }>): Promise<ConvertJobResult> {
    return getWorker().mergePdfs(files);
  },
};
