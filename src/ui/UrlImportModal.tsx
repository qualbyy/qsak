import { FileUp, Link2, Play } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DICT, type Lang } from "../core/i18n";
import { checkUrlCountLimit } from "../core/limits";
import type { AppLimits } from "../core/types";
import { parseUrlList } from "../core/urlImporter";
import { ModalFrame } from "./Modals";

interface UrlImportModalProps {
  lang: Lang;
  limits: AppLimits;
  initialText?: string;
  onImport: (urls: string[], preferredTarget: string) => Promise<void>;
  onClose: () => void;
}

const QUICK_TARGETS = [
  { value: "", label: "auto" },
  { value: "webp", label: "Image → WebP" },
  { value: "png", label: "Image → PNG" },
  { value: "jpg", label: "Image → JPEG" },
  { value: "avif", label: "Image → AVIF" },
  { value: "pdf", label: "Image → PDF" },
  { value: "mp4", label: "Video → MP4" },
  { value: "mp3", label: "Media → MP3" },
  { value: "json", label: "Data → JSON" },
  { value: "csv", label: "Data → CSV" },
  { value: "xlsx", label: "Data → XLSX" },
];

export function UrlImportModal({ lang, limits, initialText = "", onImport, onClose }: UrlImportModalProps) {
  const t = DICT[lang];
  const [rawText, setRawText] = useState(initialText);
  const [preferredTarget, setPreferredTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const listFileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseUrlList(rawText), [rawText]);
  const urlLimitCheck = useMemo(() => checkUrlCountLimit(parsed.urls.length, limits), [parsed.urls.length, limits]);

  async function handlePickListFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    setErrorText(null);
  }

  async function handleSubmit() {
    if (parsed.urls.length === 0) return;
    if (!urlLimitCheck.ok) {
      setErrorText(`${t.limitExceededTitle}: ${parsed.urls.length} > ${urlLimitCheck.limitValue}`);
      return;
    }

    setLoading(true);
    setErrorText(null);
    setProgressText(`${t.urlFetching} (${parsed.urls.length})`);
    try {
      await onImport(parsed.urls, preferredTarget);
      onClose();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setProgressText(null);
    }
  }

  return (
    <ModalFrame title={t.urlModalTitle} onClose={onClose}>
      <p className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)" }}>
        {t.urlModalDesc}
      </p>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="icon-btn ui-lc"
          onClick={() => listFileRef.current?.click()}
          disabled={loading}
        >
          <FileUp size={13} />
          {t.urlPickListFile}
        </button>

        <input
          ref={listFileRef}
          type="file"
          accept=".txt,.urls,.list,.url,.csv"
          hidden
          onChange={(e) => {
            void handlePickListFile(e.target.files);
            e.target.value = "";
          }}
        />

        <span className="badge preserve-case">
          <Link2 size={11} />
          {t.urlFoundCount}: {parsed.urls.length}
        </span>

        {parsed.invalidLines.length > 0 && (
          <span className="badge preserve-case">
            {t.urlInvalidCount}: {parsed.invalidLines.length}
          </span>
        )}
      </div>

      <textarea
        className="code-area preserve-case"
        style={{ minHeight: "170px", width: "100%" }}
        placeholder={t.urlInputPlaceholder}
        value={rawText}
        onChange={(e) => {
          setRawText(e.target.value);
          setErrorText(null);
        }}
        spellCheck={false}
      />

      <div className="setting-row">
        <span className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)" }}>
          {t.urlTargetLabel}
        </span>
        <select
          className="field-select preserve-case"
          value={preferredTarget}
          onChange={(e) => setPreferredTarget(e.target.value)}
        >
          {QUICK_TARGETS.map((qt) => (
            <option key={qt.value} value={qt.value}>
              {qt.value === "" ? t.urlTargetAuto : qt.label}
            </option>
          ))}
        </select>
      </div>

      {(errorText || !urlLimitCheck.ok) && (
        <div className="panel-card preserve-case" style={{ borderColor: "var(--accent)", color: "var(--sand-dark)", fontSize: "12px" }}>
          {errorText ?? `${t.limitExceededTitle}: ${parsed.urls.length} / ${urlLimitCheck.limitValue} max URLs`}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
        <span className="preserve-case" style={{ fontSize: "11px", color: "var(--text-dim)" }}>
          {progressText ??
            (limits.maxFileSizeMb > 0 ? `≤ ${limits.maxFileSizeMb} MB / file · ${limits.urlTimeoutSec}s timeout` : "")}
        </span>
        <button
          type="button"
          className="icon-btn is-primary ui-lc"
          disabled={loading || parsed.urls.length === 0 || !urlLimitCheck.ok}
          onClick={() => void handleSubmit()}
        >
          <Play size={13} />
          {loading ? t.urlFetching : `${t.urlFetchBtn} (${parsed.urls.length})`}
        </button>
      </div>
    </ModalFrame>
  );
}
