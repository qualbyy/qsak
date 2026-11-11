import type { AppLimits } from "./types";

const STORAGE_KEY = "qsak-limits";

export function getDefaultLimits(isNative = false): AppLimits {
  if (isNative) {
    return {
      maxFileSizeMb: 2048,
      maxBatchFiles: 100,
      maxTotalQueueMb: 8192,
      maxUrlCount: 50,
      urlTimeoutSec: 60,
      browserWarnMb: 0,
    };
  }
  return {
    maxFileSizeMb: 250,
    maxBatchFiles: 50,
    maxTotalQueueMb: 1024,
    maxUrlCount: 25,
    urlTimeoutSec: 30,
    browserWarnMb: 150,
  };
}

export function loadLimits(isNative = false): AppLimits {
  const defaults = getDefaultLimits(isNative);
  if (typeof localStorage === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AppLimits>;
    return {
      maxFileSizeMb: sanitizeNonNegative(parsed.maxFileSizeMb, defaults.maxFileSizeMb),
      maxBatchFiles: sanitizeNonNegative(parsed.maxBatchFiles, defaults.maxBatchFiles),
      maxTotalQueueMb: sanitizeNonNegative(parsed.maxTotalQueueMb, defaults.maxTotalQueueMb),
      maxUrlCount: sanitizeNonNegative(parsed.maxUrlCount, defaults.maxUrlCount),
      urlTimeoutSec: Math.max(5, sanitizeNonNegative(parsed.urlTimeoutSec, defaults.urlTimeoutSec)),
      browserWarnMb: sanitizeNonNegative(parsed.browserWarnMb, defaults.browserWarnMb),
    };
  } catch {
    return defaults;
  }
}

export function saveLimits(limits: AppLimits): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(limits));
}

function sanitizeNonNegative(val: unknown, fallback: number): number {
  if (typeof val !== "number" || !Number.isFinite(val) || val < 0) return fallback;
  return Math.round(val);
}

export type LimitViolationReason = "file-size" | "batch-count" | "total-size" | "url-count";

export interface LimitCheckResult {
  ok: boolean;
  reason?: LimitViolationReason;
  limitValue?: number;
  actualValue?: number;
}

export function checkFileLimits(
  fileSizeBytes: number,
  currentQueueCount: number,
  currentQueueBytes: number,
  limits: AppLimits,
): LimitCheckResult {
  if (limits.maxBatchFiles > 0 && currentQueueCount >= limits.maxBatchFiles) {
    return {
      ok: false,
      reason: "batch-count",
      limitValue: limits.maxBatchFiles,
      actualValue: currentQueueCount + 1,
    };
  }

  const maxFileBytes = limits.maxFileSizeMb * 1024 * 1024;
  if (limits.maxFileSizeMb > 0 && fileSizeBytes > maxFileBytes) {
    return {
      ok: false,
      reason: "file-size",
      limitValue: limits.maxFileSizeMb,
      actualValue: Math.ceil(fileSizeBytes / (1024 * 1024)),
    };
  }

  const maxTotalBytes = limits.maxTotalQueueMb * 1024 * 1024;
  if (limits.maxTotalQueueMb > 0 && currentQueueBytes + fileSizeBytes > maxTotalBytes) {
    return {
      ok: false,
      reason: "total-size",
      limitValue: limits.maxTotalQueueMb,
      actualValue: Math.ceil((currentQueueBytes + fileSizeBytes) / (1024 * 1024)),
    };
  }

  return { ok: true };
}

export function checkUrlCountLimit(urlCount: number, limits: AppLimits): LimitCheckResult {
  if (limits.maxUrlCount > 0 && urlCount > limits.maxUrlCount) {
    return {
      ok: false,
      reason: "url-count",
      limitValue: limits.maxUrlCount,
      actualValue: urlCount,
    };
  }
  return { ok: true };
}
