import * as Comlink from "comlink";
import { detectFormat } from "../core/detect";
import { AUDIO_FORMAT_SET, IMAGE_FORMAT_SET, VIDEO_FORMAT_SET } from "../core/registry";
import type { ConvertJobInput, ConvertJobResult, DetectedFormat, InspectResult, TextOperationId } from "../core/types";
import { packFilesToZip, rearchiveToZip } from "../engines/archive";
import { convertCbzToPdf, extractEpubToText } from "../engines/ebook";
import { convertImageFile } from "../engines/image";
import { inspectFile } from "../engines/inspector";
import { convertMediaFile } from "../engines/media";
import { convertPdfFile, mergePdfFiles } from "../engines/pdf";
import { convertTextToXlsx, convertXlsxToText } from "../engines/spreadsheet";
import { convertTextFile, runTextOperation } from "../engines/text";

const workerApi = {
  async detect(fileName: string, bytes: Uint8Array): Promise<DetectedFormat> {
    return detectFormat(fileName, bytes);
  },

  async convert(job: ConvertJobInput): Promise<ConvertJobResult> {
    const src = job.sourceFormat.toLowerCase();
    const dst = job.targetFormat.toLowerCase();

    if (dst === "extract-zip") {
      return rearchiveToZip(job.bytes, job.fileName, src);
    }

    if (dst === "cbz-to-pdf") {
      return convertCbzToPdf(job.bytes, job.fileName);
    }

    if (dst === "epub-to-txt") {
      return extractEpubToText(job.bytes, job.fileName);
    }

    if (src === "pdf") {
      return convertPdfFile(job.bytes, job.fileName, dst);
    }

    if (src === "xlsx") {
      return convertXlsxToText(job.bytes, job.fileName, dst);
    }

    if (dst === "xlsx") {
      return convertTextToXlsx(job.bytes, job.fileName, src);
    }

    if (VIDEO_FORMAT_SET.has(src) || AUDIO_FORMAT_SET.has(src)) {
      return convertMediaFile(job.bytes, job.fileName, src, dst);
    }

    if (IMAGE_FORMAT_SET.has(src)) {
      return convertImageFile(job.bytes, job.fileName, src, dst, job.options);
    }

    return convertTextFile(job.bytes, job.fileName, src, dst);
  },

  async mergePdfs(files: Array<{ name: string; bytes: Uint8Array }>): Promise<ConvertJobResult> {
    return mergePdfFiles(files);
  },

  async runText(op: TextOperationId, input: string): Promise<string> {
    return runTextOperation(op, input);
  },

  async inspect(fileName: string, bytes: Uint8Array): Promise<InspectResult> {
    return inspectFile(fileName, bytes);
  },

  async packZip(files: Array<{ name: string; bytes: Uint8Array }>): Promise<Uint8Array> {
    return packFilesToZip(files);
  },
};

export type TaskWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
