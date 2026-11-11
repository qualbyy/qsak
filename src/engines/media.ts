import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { ConvertJobResult } from "../core/types";
import { replaceExt } from "../core/registry";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const { FFmpeg: FFmpegClass } = await import("@ffmpeg/ffmpeg");
      const coreJsUrl = (await import("@ffmpeg/core?url")).default;
      const coreWasmUrl = (await import("@ffmpeg/core/wasm?url")).default;

      const ffmpeg = new FFmpegClass();
      await ffmpeg.load({
        coreURL: coreJsUrl,
        wasmURL: coreWasmUrl,
      });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })();
  }
  return ffmpegLoadPromise;
}

function buildFfmpegArgs(
  inputName: string,
  target: string,
  durationSec: number | null,
): { args: string[]; outputName: string; mime: string } {
  switch (target) {
    case "mp4":
      return {
        args: ["-i", inputName, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "out.mp4"],
        outputName: "out.mp4",
        mime: "video/mp4",
      };
    case "webm":
      return {
        args: ["-i", inputName, "-c:v", "libvpx", "-crf", "28", "-b:v", "1M", "-c:a", "libvorbis", "out.webm"],
        outputName: "out.webm",
        mime: "video/webm",
      };
    case "gif":
      return {
        args: ["-i", inputName, "-vf", "fps=12,scale=480:-1:flags=lanczos", "-loop", "0", "out.gif"],
        outputName: "out.gif",
        mime: "image/gif",
      };
    case "mp4-mute":
      return {
        args: ["-i", inputName, "-c:v", "copy", "-an", "out.mp4"],
        outputName: "out.mp4",
        mime: "video/mp4",
      };
    case "mp4-10mb":
    case "mp4-25mb": {
      const targetMb = target === "mp4-10mb" ? 9.2 : 23.5;
      const dur = Math.max(1, durationSec ?? 30);
      const totalKbps = Math.floor((targetMb * 8192) / dur);
      const audioKbps = 96;
      const videoKbps = Math.max(150, totalKbps - audioKbps);
      return {
        args: [
          "-i",
          inputName,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-b:v",
          `${videoKbps}k`,
          "-maxrate",
          `${Math.round(videoKbps * 1.2)}k`,
          "-bufsize",
          `${videoKbps * 2}k`,
          "-c:a",
          "aac",
          "-b:a",
          `${audioKbps}k`,
          "out.mp4",
        ],
        outputName: "out.mp4",
        mime: "video/mp4",
      };
    }
    case "mp3":
      return {
        args: ["-i", inputName, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "out.mp3"],
        outputName: "out.mp3",
        mime: "audio/mpeg",
      };
    case "wav":
      return {
        args: ["-i", inputName, "-vn", "-c:a", "pcm_s16le", "out.wav"],
        outputName: "out.wav",
        mime: "audio/wav",
      };
    case "ogg":
      return {
        args: ["-i", inputName, "-vn", "-c:a", "libvorbis", "-q:a", "5", "out.ogg"],
        outputName: "out.ogg",
        mime: "audio/ogg",
      };
    case "aac":
      return {
        args: ["-i", inputName, "-vn", "-c:a", "aac", "-b:a", "192k", "out.m4a"],
        outputName: "out.m4a",
        mime: "audio/mp4",
      };
    case "flac":
      return {
        args: ["-i", inputName, "-vn", "-c:a", "flac", "out.flac"],
        outputName: "out.flac",
        mime: "audio/flac",
      };
    default:
      throw new Error(`Unsupported media target format: ${target}`);
  }
}

export async function convertMediaFile(
  bytes: Uint8Array,
  fileName: string,
  sourceFormat: string,
  targetFormat: string,
): Promise<ConvertJobResult> {
  const ffmpeg = await getFFmpeg();
  const safeInput = `input.${sourceFormat.toLowerCase() || "bin"}`;

  let detectedDuration: number | null = null;
  const logListener = ({ message }: { message: string }) => {
    const match = /Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
    if (match) {
      detectedDuration =
        Number.parseInt(match[1], 10) * 3600 +
        Number.parseInt(match[2], 10) * 60 +
        Number.parseFloat(match[3]);
    }
  };
  ffmpeg.on("log", logListener);

  try {
    await ffmpeg.writeFile(safeInput, bytes.slice());

    // Probe duration quickly when compressing to a target MB cap
    if (targetFormat === "mp4-10mb" || targetFormat === "mp4-25mb") {
      await ffmpeg.exec(["-i", safeInput, "-f", "null", "-"]).catch(() => undefined);
    }

    const { args, outputName, mime } = buildFfmpegArgs(safeInput, targetFormat.toLowerCase(), detectedDuration);
    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode}`);
    }

    const outData = await ffmpeg.readFile(outputName);
    const outBytes = outData instanceof Uint8Array ? outData : new TextEncoder().encode(outData);
    const finalExt = outputName.split(".").pop() ?? "bin";

    return {
      outputName: replaceExt(fileName, finalExt),
      mime,
      bytes: outBytes,
    };
  } finally {
    ffmpeg.off("log", logListener);
    await ffmpeg.deleteFile(safeInput).catch(() => undefined);
  }
}
