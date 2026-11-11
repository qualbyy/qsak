import {
  AlertTriangle,
  Archive,
  Download,
  FileSearch,
  FileText,
  HardDriveDownload,
  Laptop,
  Link2,
  Play,
  Settings,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { engineBridge, isTauriRuntime } from "../core/bridge";
import { detectTextFormat } from "../core/detect";
import { detectLang, DICT, type Lang } from "../core/i18n";
import { checkFileLimits, checkUrlCountLimit, loadLimits, saveLimits } from "../core/limits";
import { getActionsForFormat } from "../core/registry";
import { applyQplateTheme, type ThemeMode } from "../core/theme";
import type { AppLimits, ConvertJobResult, DetectedFormat, InspectResult, TextOperationId } from "../core/types";
import { fetchUrlAsBytes, isUrlListContent, parseUrlList } from "../core/urlImporter";
import { InspectorView } from "./InspectorView";
import { DownloadModal, OfflineModal, SettingsModal } from "./Modals";
import { TextPlayground } from "./TextPlayground";
import { UrlImportModal } from "./UrlImportModal";
import { downloadBytes, formatBytes } from "./utils";

interface QueueItem {
  id: string;
  fileName: string;
  bytes: Uint8Array;
  detected: DetectedFormat;
  targetFormat: string;
  status: "queued" | "processing" | "done" | "error";
  result?: ConvertJobResult;
  error?: string;
}

type ActiveTab = "files" | "text" | "inspector";
type ActiveModal = "settings" | "offline" | "download" | "url" | null;

const BROWSER_HEAVY_THRESHOLD = 450 * 1024 * 1024;

export function App() {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("qsak-lang");
    return saved === "ru" || saved === "en" ? saved : detectLang();
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("qsak-theme");
    return saved === "light" || saved === "dark" || saved === "auto" ? saved : "auto";
  });
  const [motion, setMotion] = useState<boolean>(() => localStorage.getItem("qsak-motion") !== "false");
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

  const [tab, setTab] = useState<ActiveTab>("files");
  const [modal, setModal] = useState<ActiveModal>(null);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [quality, setQuality] = useState(85);
  const [maxWidth, setMaxWidth] = useState<string>("");

  const [textOp, setTextOp] = useState<TextOperationId>("json-to-yaml");
  const [textInitialInput, setTextInitialInput] = useState<string | undefined>(undefined);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [diskResult, setDiskResult] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNative = isTauriRuntime();
  const t = DICT[lang];

  const [limits, setLimits] = useState<AppLimits>(() => loadLimits(isNative));
  const [notice, setNotice] = useState<string | null>(null);
  const [detectedUrlList, setDetectedUrlList] = useState<{ fileName: string; rawText: string; count: number } | null>(null);
  const [urlPrefill, setUrlPrefill] = useState<string>("");

  useEffect(() => {
    saveLimits(limits);
  }, [limits]);

  useEffect(() => {
    applyQplateTheme(theme, motion);
    localStorage.setItem("qsak-theme", theme);
    localStorage.setItem("qsak-motion", String(motion));
  }, [theme, motion]);

  useEffect(() => {
    localStorage.setItem("qsak-lang", lang);
  }, [lang]);

  useEffect(() => {
    const onStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", onStatus);
    window.addEventListener("offline", onStatus);

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSysTheme = () => {
      if (theme === "auto") applyQplateTheme("auto", motion);
    };
    mq?.addEventListener("change", onSysTheme);

    return () => {
      window.removeEventListener("online", onStatus);
      window.removeEventListener("offline", onStatus);
      mq?.removeEventListener("change", onSysTheme);
    };
  }, [theme, motion]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const appendValidatedEntries = useCallback(
    async (
      entries: Array<{ fileName: string; bytes: Uint8Array }>,
      preferredTarget = "",
    ): Promise<string[]> => {
      const violations: string[] = [];
      const created: QueueItem[] = [];
      let runningCount = queue.length;
      let runningBytes = queue.reduce((acc, item) => acc + item.bytes.byteLength, 0);

      for (const entry of entries) {
        const check = checkFileLimits(entry.bytes.byteLength, runningCount, runningBytes, limits);
        if (!check.ok) {
          if (check.reason === "batch-count") {
            violations.push(`${entry.fileName}: max ${check.limitValue} files`);
          } else if (check.reason === "file-size") {
            violations.push(`${entry.fileName}: ${check.actualValue} MB > ${check.limitValue} MB`);
          } else if (check.reason === "total-size") {
            violations.push(`${entry.fileName}: queue > ${check.limitValue} MB`);
          }
          continue;
        }

        const detected = await engineBridge.detect(entry.fileName, entry.bytes);
        const actions = getActionsForFormat(detected.id);
        const target =
          preferredTarget && actions.some((a) => a.target === preferredTarget)
            ? preferredTarget
            : (actions[0]?.target ?? "");

        created.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fileName: entry.fileName,
          bytes: entry.bytes,
          detected,
          targetFormat: target,
          status: "queued",
        });
        runningCount += 1;
        runningBytes += entry.bytes.byteLength;
      }

      if (created.length > 0) {
        setQueue((prev) => [...prev, ...created]);
        setTab("files");
        if (created.length === 1) {
          void engineBridge.inspect(created[0].fileName, created[0].bytes).then(setInspectResult);
        }
      }

      return violations;
    },
    [limits, queue],
  );

  const importFromUrls = useCallback(
    async (urls: string[], preferredTarget = "") => {
      const countCheck = checkUrlCountLimit(urls.length, limits);
      const allowedUrls = countCheck.ok ? urls : urls.slice(0, limits.maxUrlCount);
      const errors: string[] = [];

      if (!countCheck.ok) {
        errors.push(`URL limit (${limits.maxUrlCount}) — truncated ${urls.length - allowedUrls.length}`);
      }

      const fetchedEntries: Array<{ fileName: string; bytes: Uint8Array }> = [];
      for (const url of allowedUrls) {
        try {
          const res = await fetchUrlAsBytes(url, limits);
          fetchedEntries.push({ fileName: res.fileName, bytes: res.bytes });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${url}: ${msg}`);
        }
      }

      const limitErrors = await appendValidatedEntries(fetchedEntries, preferredTarget);
      const allWarnings = [...errors, ...limitErrors];
      if (allWarnings.length > 0) {
        setNotice(`${t.limitExceededTitle}: ${allWarnings.slice(0, 3).join(" · ")}${allWarnings.length > 3 ? ` (+${allWarnings.length - 3})` : ""}`);
      } else {
        setNotice(null);
      }
    },
    [appendValidatedEntries, limits, t.limitExceededTitle],
  );

  const ingestFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      const entries: Array<{ fileName: string; bytes: Uint8Array }> = [];
      const preErrors: string[] = [];
      const autoUrlFiles: Array<{ fileName: string; text: string }> = [];

      for (const file of list) {
        const lower = file.name.toLowerCase();
        // Pre-check file size before reading full ArrayBuffer into RAM
        const maxBytes = limits.maxFileSizeMb > 0 ? limits.maxFileSizeMb * 1024 * 1024 : Infinity;
        if (file.size > maxBytes) {
          preErrors.push(`${file.name}: ${Math.ceil(file.size / (1024 * 1024))} MB > ${limits.maxFileSizeMb} MB`);
          continue;
        }

        const buf = new Uint8Array(await file.arrayBuffer());
        if (lower.endsWith(".urls") || lower.endsWith(".list") || lower.endsWith(".url") || lower.endsWith(".txt")) {
          const sample = new TextDecoder("utf-8", { fatal: false }).decode(buf);
          if (isUrlListContent(file.name, sample)) {
            if (lower.endsWith(".urls") || lower.endsWith(".list") || lower.endsWith(".url")) {
              autoUrlFiles.push({ fileName: file.name, text: sample });
              continue;
            }
            const parsed = parseUrlList(sample);
            setDetectedUrlList({ fileName: file.name, rawText: sample, count: parsed.urls.length });
          }
        }

        entries.push({ fileName: file.name, bytes: buf });
      }

      const limitErrors = await appendValidatedEntries(entries);
      const allErrors = [...preErrors, ...limitErrors];
      if (allErrors.length > 0) {
        setNotice(`${t.limitExceededTitle}: ${allErrors.slice(0, 3).join(" · ")}${allErrors.length > 3 ? ` (+${allErrors.length - 3})` : ""}`);
      } else {
        setNotice(null);
      }

      for (const urlFile of autoUrlFiles) {
        const parsed = parseUrlList(urlFile.text);
        if (parsed.urls.length > 0) {
          await importFromUrls(parsed.urls);
        }
      }
    },
    [appendValidatedEntries, importFromUrls, limits.maxFileSizeMb, t.limitExceededTitle],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;

      const pastedFiles = e.clipboardData?.files;
      if (pastedFiles && pastedFiles.length > 0) {
        e.preventDefault();
        void ingestFiles(pastedFiles);
        return;
      }

      const pastedText = e.clipboardData?.getData("text/plain");
      if (pastedText && pastedText.trim()) {
        e.preventDefault();
        const urlParsed = parseUrlList(pastedText);
        if (urlParsed.urls.length > 0 && urlParsed.invalidLines.length === 0) {
          setUrlPrefill(pastedText.trim());
          setModal("url");
          return;
        }
        const guessed = detectTextFormat(pastedText);
        if (guessed.id === "json") setTextOp("json-to-yaml");
        else if (guessed.id === "jsonl") setTextOp("jsonl-to-json");
        else if (guessed.id === "yaml") setTextOp("yaml-to-json");
        else if (guessed.id === "toml") setTextOp("toml-to-json");
        else if (guessed.id === "xml") setTextOp("xml-to-json");
        else if (guessed.id === "csv") setTextOp("csv-to-json");
        else if (guessed.id === "tsv") setTextOp("tsv-to-json");
        else if (guessed.id === "properties") setTextOp("properties-to-json");
        else if (guessed.id === "srt") setTextOp("srt-to-vtt");
        else if (guessed.id === "vtt") setTextOp("vtt-to-srt");
        else if (guessed.id === "md") setTextOp("md-to-html");
        else if (guessed.id === "html") setTextOp("html-to-md");
        setTextInitialInput(pastedText);
        setTab("text");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [ingestFiles]);

  async function processItem(item: QueueItem) {
    if (!item.targetFormat) return;
    setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "processing", error: undefined } : q)));
    try {
      const parsedWidth = Number.parseInt(maxWidth, 10);
      const res = await engineBridge.convert({
        fileName: item.fileName,
        bytes: item.bytes,
        sourceFormat: item.detected.id,
        targetFormat: item.targetFormat,
        options: {
          quality,
          maxWidth: Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : undefined,
          stripExif: true,
        },
      });
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "done", result: res } : q)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "error", error: msg } : q)));
    }
  }

  async function processAll() {
    const actionable = queue.filter((q) => q.targetFormat && q.status !== "done");
    for (const item of actionable) {
      await processItem(item);
    }
  }

  async function downloadAllAsZip() {
    const completed = queue.filter((q) => q.status === "done" && q.result);
    if (completed.length === 0) return;
    const files = completed.map((q) => ({
      name: q.result!.outputName,
      bytes: q.result!.bytes,
    }));
    const zipped = await engineBridge.packZip(files);
    downloadBytes(zipped, "qsak-batch.zip", "application/zip");
  }

  async function handleInspect(item: QueueItem) {
    const res = await engineBridge.inspect(item.fileName, item.bytes);
    setInspectResult(res);
    setTab("inspector");
  }

  const doneCount = useMemo(() => queue.filter((q) => q.status === "done").length, [queue]);
  const pdfCount = useMemo(() => queue.filter((q) => q.detected.id === "pdf").length, [queue]);
  const hasImageInQueue = useMemo(() => queue.some((q) => q.detected.category === "image"), [queue]);
  const totalQueueBytes = useMemo(() => queue.reduce((acc, q) => acc + q.bytes.byteLength, 0), [queue]);

  async function mergeAllPdfs() {
    const pdfs = queue.filter((q) => q.detected.id === "pdf").map((q) => ({ name: q.fileName, bytes: q.bytes }));
    if (pdfs.length < 2) return;
    const res = await engineBridge.mergePdfs(pdfs);
    downloadBytes(res.bytes, res.outputName, res.mime);
  }

  async function handleDiskVideoConvert() {
    setDiskResult(null);
    const outPath = await engineBridge.convertLargeMediaFromDisk("mp4");
    if (outPath) setDiskResult(outPath);
  }

  return (
    <>
      <main className="desktop-shell">
        <section className="window" aria-label="qsak workspace">
          <header className="window-header">
            <div className="window-title-group">
              <div className="window-dots" aria-hidden="true">
                <span className="window-dot is-accent" />
                <span className="window-dot" />
                <span className="window-dot" />
              </div>
              <span className="window-title preserve-case">{t.appTitle}</span>
              <span className="window-subtitle ui-lc">— {t.appSubtitle}</span>
            </div>

            <div className="window-actions">
              {(limits.maxBatchFiles > 0 || limits.maxTotalQueueMb > 0) && (
                <span className="badge preserve-case" title={t.limitsSectionTitle}>
                  {queue.length}
                  {limits.maxBatchFiles > 0 ? `/${limits.maxBatchFiles}` : ""} · {formatBytes(totalQueueBytes)}
                  {limits.maxTotalQueueMb > 0 ? ` / ${limits.maxTotalQueueMb} MB` : ""}
                </span>
              )}
              <span className={`badge ui-lc ${online || isNative ? "is-online" : ""}`}>
                <span className={`badge-dot ${online || isNative ? "" : "is-offline"}`} />
                {isNative ? t.statusDesktop : online ? t.statusOnline : t.statusOffline}
              </span>
            </div>
          </header>

          <div className="window-body">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className={`icon-btn ui-lc ${tab === "files" ? "is-active" : ""}`}
                  onClick={() => setTab("files")}
                >
                  <Archive size={13} />
                  {t.tabFiles} {queue.length > 0 ? `(${queue.length})` : ""}
                </button>
                <button
                  type="button"
                  className={`icon-btn ui-lc ${tab === "text" ? "is-active" : ""}`}
                  onClick={() => setTab("text")}
                >
                  <FileText size={13} />
                  {t.tabText}
                </button>
                <button
                  type="button"
                  className={`icon-btn ui-lc ${tab === "inspector" ? "is-active" : ""}`}
                  onClick={() => setTab("inspector")}
                >
                  <FileSearch size={13} />
                  {t.tabInspector}
                </button>
              </div>

              {tab === "files" && queue.length > 0 && (
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button type="button" className="icon-btn is-primary ui-lc" onClick={() => void processAll()}>
                    <Play size={13} />
                    {t.runAll}
                  </button>
                  {pdfCount > 1 && (
                    <button type="button" className="icon-btn ui-lc" onClick={() => void mergeAllPdfs()}>
                      <FileText size={13} />
                      {t.mergePdfBtn} ({pdfCount})
                    </button>
                  )}
                  {doneCount > 1 && (
                    <button type="button" className="icon-btn ui-lc" onClick={() => void downloadAllAsZip()}>
                      <Download size={13} />
                      {t.downloadAllZip}
                    </button>
                  )}
                  <button type="button" className="icon-btn ui-lc" onClick={() => setQueue([])}>
                    <Trash2 size={13} />
                    {t.clearQueue}
                  </button>
                </div>
              )}
            </div>

            {tab === "files" && (
              <>
                <div
                  className={`drop-zone ${dragging ? "is-dragging" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files.length > 0) {
                      void ingestFiles(e.dataTransfer.files);
                    }
                  }}
                >
                  <Upload size={20} style={{ color: "var(--accent)" }} />
                  <div className="ui-lc" style={{ fontWeight: 600, fontSize: "13px" }}>
                    {t.dropTitle}
                  </div>
                  <div className="ui-lc" style={{ fontSize: "11.5px", color: "var(--text-dim)", maxWidth: "560px" }}>
                    {t.dropHint}
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px", flexWrap: "wrap", justifyContent: "center" }}>
                    <span className="icon-btn is-primary ui-lc">{t.pickFiles}</span>
                    <button
                      type="button"
                      className="icon-btn ui-lc"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUrlPrefill("");
                        setModal("url");
                      }}
                    >
                      <Link2 size={13} />
                      {t.importUrlBtn}
                    </button>
                    {isNative && (
                      <button
                        type="button"
                        className="icon-btn ui-lc"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDiskVideoConvert();
                        }}
                      >
                        {t.diskVideoBtn}
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn ui-lc"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTab("text");
                      }}
                    >
                      {t.pasteTextMode}
                    </button>
                  </div>
                  {diskResult && (
                    <div className="badge preserve-case" style={{ marginTop: "4px" }}>
                      {t.diskVideoSaved}: {diskResult}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => {
                      if (e.target.files) void ingestFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>

                {hasImageInQueue && (
                  <div className="panel-card" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "16px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                      <span className="ui-lc" style={{ color: "var(--text-dim)" }}>
                        {t.quality}:
                      </span>
                      <input
                        type="range"
                        min={15}
                        max={100}
                        value={quality}
                        onChange={(e) => setQuality(Number(e.target.value))}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      <span className="preserve-case" style={{ minWidth: "34px", fontWeight: 600 }}>
                        {quality}%
                      </span>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                      <span className="ui-lc" style={{ color: "var(--text-dim)" }}>
                        {t.maxWidth}:
                      </span>
                      <input
                        type="number"
                        className="field-input preserve-case"
                        placeholder="auto"
                        value={maxWidth}
                        onChange={(e) => setMaxWidth(e.target.value)}
                        style={{ width: "84px" }}
                      />
                    </label>

                    <span className="badge ui-lc">{t.stripExif}</span>
                  </div>
                )}

                {notice && (
                  <div
                    className="panel-card"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderColor: "var(--accent)",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--sand-dark)" }}>
                      <AlertTriangle size={14} />
                      <span className="preserve-case">{notice}</span>
                    </div>
                    <button type="button" className="icon-btn ui-lc" onClick={() => setNotice(null)}>
                      <X size={12} />
                      {t.dismissBtn}
                    </button>
                  </div>
                )}

                {detectedUrlList && (
                  <div
                    className="panel-card"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      borderColor: "var(--accent)",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                      <Link2 size={14} style={{ color: "var(--accent)" }} />
                      <span className="preserve-case">
                        {t.urlDetectedBanner}: <b>{detectedUrlList.fileName}</b> ({detectedUrlList.count})
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className="icon-btn is-primary ui-lc"
                        onClick={() => {
                          setUrlPrefill(detectedUrlList.rawText);
                          setDetectedUrlList(null);
                          setModal("url");
                        }}
                      >
                        <Link2 size={13} />
                        {t.urlDetectedAction}
                      </button>
                      <button type="button" className="icon-btn" onClick={() => setDetectedUrlList(null)}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {queue.length === 0 ? (
                  <p className="empty-note ui-lc">{t.noFilesYet}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {queue.map((item) => {
                      const actions = getActionsForFormat(item.detected.id);
                      const warnBytes = (limits.browserWarnMb > 0 ? limits.browserWarnMb : 0) * 1024 * 1024;
                      const isHeavy =
                        !isNative &&
                        (warnBytes > 0 ? item.bytes.byteLength > warnBytes : item.bytes.byteLength > BROWSER_HEAVY_THRESHOLD);

                      return (
                        <div key={item.id} className="file-row" style={{ flexWrap: "wrap" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "200px", flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span className="preserve-case" style={{ fontWeight: 600, fontSize: "12.5px" }}>
                                {item.fileName}
                              </span>
                              <span className="badge preserve-case">{item.detected.id.toUpperCase()}</span>
                              <span className="preserve-case" style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                                {formatBytes(item.bytes.byteLength)}
                              </span>
                            </div>

                            {isHeavy && (
                              <span className="ui-lc" style={{ fontSize: "11px", color: "var(--sand-dark)" }}>
                                {t.heavyWarning}
                              </span>
                            )}
                            {item.status === "error" && item.error && (
                              <span className="preserve-case" style={{ fontSize: "11px", color: "var(--sand-dark)" }}>
                                {item.error}
                              </span>
                            )}
                            {item.status === "done" && item.result && (
                              <span className="preserve-case" style={{ fontSize: "11px", color: "var(--sand-dark)" }}>
                                → {item.result.outputName} ({formatBytes(item.result.bytes.byteLength)})
                              </span>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            {actions.length > 0 ? (
                              <>
                                <select
                                  className="field-select preserve-case"
                                  value={item.targetFormat}
                                  onChange={(e) => {
                                    const nextTarget = e.target.value;
                                    setQueue((prev) =>
                                      prev.map((q) =>
                                        q.id === item.id ? { ...q, targetFormat: nextTarget, status: "queued" } : q,
                                      ),
                                    );
                                  }}
                                >
                                  {actions.map((act) => (
                                    <option key={act.target} value={act.target}>
                                      → {act.label}
                                    </option>
                                  ))}
                                </select>

                                {item.status === "done" && item.result ? (
                                  <button
                                    type="button"
                                    className="icon-btn is-primary ui-lc"
                                    onClick={() =>
                                      downloadBytes(item.result!.bytes, item.result!.outputName, item.result!.mime)
                                    }
                                  >
                                    <Download size={13} />
                                    {t.downloadFile}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="icon-btn is-primary ui-lc"
                                    disabled={item.status === "processing"}
                                    onClick={() => void processItem(item)}
                                  >
                                    <Play size={13} />
                                    {item.status === "processing" ? t.processing : t.convertBtn}
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="badge ui-lc">{t.readOnlyFormat}</span>
                            )}

                            <button type="button" className="icon-btn ui-lc" onClick={() => void handleInspect(item)}>
                              <FileSearch size={13} />
                              {t.inspectBtn}
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={t.removeBtn}
                              onClick={() => setQueue((prev) => prev.filter((q) => q.id !== item.id))}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {tab === "text" && (
              <TextPlayground
                lang={lang}
                initialInput={textInitialInput}
                selectedOp={textOp}
                onChangeOp={setTextOp}
              />
            )}

            {tab === "inspector" && <InspectorView lang={lang} result={inspectResult} />}
          </div>
        </section>
      </main>

      <nav className="side-dock" aria-label="qsak dock">
        <button
          type="button"
          className={`dock-item ${modal === null ? "is-active" : ""}`}
          onClick={() => setModal(null)}
          aria-label={t.dockConverter}
        >
          <Wrench size={18} />
          <span className="dock-tooltip ui-lc">{t.dockConverter}</span>
        </button>

        {!isNative && (
          <button
            type="button"
            className={`dock-item ${modal === "offline" ? "is-active" : ""}`}
            onClick={() => setModal("offline")}
            aria-label={t.dockOffline}
          >
            <HardDriveDownload size={18} />
            <span className="dock-tooltip ui-lc">{t.dockOffline}</span>
          </button>
        )}

        {!isNative && (
          <button
            type="button"
            className={`dock-item ${modal === "download" ? "is-active" : ""}`}
            onClick={() => setModal("download")}
            aria-label={t.dockDownload}
          >
            <Laptop size={18} />
            <span className="dock-tooltip ui-lc">{t.dockDownload}</span>
          </button>
        )}

        <button
          type="button"
          className={`dock-item ${modal === "settings" ? "is-active" : ""}`}
          onClick={() => setModal("settings")}
          aria-label={t.dockSettings}
        >
          <Settings size={18} />
          <span className="dock-tooltip ui-lc">{t.dockSettings}</span>
        </button>
      </nav>

      {modal === "settings" && (
        <SettingsModal
          lang={lang}
          theme={theme}
          motion={motion}
          limits={limits}
          onChangeLang={setLang}
          onChangeTheme={setTheme}
          onChangeMotion={setMotion}
          onChangeLimits={setLimits}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "url" && (
        <UrlImportModal
          lang={lang}
          limits={limits}
          initialText={urlPrefill}
          onImport={importFromUrls}
          onClose={() => setModal(null)}
        />
      )}

      {!isNative && modal === "offline" && <OfflineModal lang={lang} onClose={() => setModal(null)} />}
      {!isNative && modal === "download" && <DownloadModal lang={lang} onClose={() => setModal(null)} />}
    </>
  );
}
