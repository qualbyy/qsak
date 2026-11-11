import { engineBridge } from "./bridge";
import type { ConvertJobResult, ConvertOptions } from "./types";

export interface PipelineStep {
  id: string;
  targetFormat: string;
  options?: ConvertOptions;
}

export async function runPipeline(
  fileName: string,
  initialBytes: Uint8Array,
  initialFormat: string,
  steps: PipelineStep[],
): Promise<ConvertJobResult> {
  if (steps.length === 0) {
    throw new Error("Pipeline has no steps");
  }

  let currentName = fileName;
  let currentBytes = initialBytes;
  let currentFormat = initialFormat;
  let lastResult: ConvertJobResult | null = null;

  for (const step of steps) {
    const res = await engineBridge.convert({
      fileName: currentName,
      bytes: currentBytes,
      sourceFormat: currentFormat,
      targetFormat: step.targetFormat,
      options: step.options,
    });
    lastResult = res;
    currentName = res.outputName;
    currentBytes = res.bytes;
    const dot = res.outputName.lastIndexOf(".");
    currentFormat = dot >= 0 ? res.outputName.slice(dot + 1).toLowerCase() : step.targetFormat;
  }

  if (!lastResult) throw new Error("Pipeline produced no output");
  return lastResult;
}
