import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { DICT, type Lang } from "../core/i18n";
import type { InspectResult } from "../core/types";
import { formatBytes } from "./utils";

interface InspectorViewProps {
  lang: Lang;
  result: InspectResult | null;
}

export function InspectorView({ lang, result }: InspectorViewProps) {
  const t = DICT[lang];
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!result) {
    return (
      <div className="panel-card">
        <p className="empty-note ui-lc">{t.inspectorEmpty}</p>
      </div>
    );
  }

  async function copyVal(key: string, val: string) {
    await navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1200);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div className="panel-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <strong className="preserve-case" style={{ fontSize: "13px" }}>
            {result.fileName}
          </strong>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <span className="badge preserve-case">{result.detected.id.toUpperCase()}</span>
            <span className="badge preserve-case">{result.detected.mime}</span>
            <span className="badge preserve-case">{formatBytes(result.size)}</span>
            <span className="badge ui-lc">{result.detected.confidence}</span>
            {result.dimensions && (
              <span className="badge preserve-case">
                {result.dimensions.width}x{result.dimensions.height}
              </span>
            )}
            {result.pageCount !== undefined && (
              <span className="badge preserve-case">{result.pageCount} pages</span>
            )}
          </div>
        </div>
      </div>

      <div className="panel-card">
        <span className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 600 }}>
          {t.hashesTitle}
        </span>
        {(
          [
            ["SHA-256", result.sha256],
            ["SHA-1", result.sha1],
            ["MD5", result.md5],
          ] as const
        ).map(([label, val]) => (
          <div key={label} className="setting-row" style={{ padding: "7px 10px" }}>
            <span className="preserve-case" style={{ fontSize: "11.5px", color: "var(--text-dim)", minWidth: "70px" }}>
              {label}
            </span>
            <code
              className="preserve-case"
              style={{ fontSize: "11.5px", wordBreak: "break-all", flex: 1, margin: "0 8px" }}
            >
              {val}
            </code>
            <button type="button" className="icon-btn" onClick={() => void copyVal(label, val)}>
              {copiedKey === label ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        ))}
      </div>

      {result.archiveEntries && (
        <div className="panel-card">
          <span className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 600 }}>
            {t.archiveEntriesTitle} ({result.archiveEntries.length})
          </span>
          <div style={{ maxHeight: "180px", overflow: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
            {result.archiveEntries.slice(0, 200).map((entry) => (
              <div key={entry.path} className="file-row" style={{ padding: "5px 10px" }}>
                <span className="preserve-case" style={{ fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {entry.path}
                </span>
                <span className="preserve-case" style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                  {formatBytes(entry.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel-card">
        <span className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 600 }}>
          {result.textPreview !== undefined ? t.previewTextTitle : t.previewHexTitle}
        </span>
        <pre
          className="preserve-case"
          style={{
            fontSize: "11.5px",
            lineHeight: 1.45,
            overflow: "auto",
            maxHeight: "220px",
            padding: "10px",
            borderRadius: "6px",
            background: "var(--surface-paper)",
            border: "1px solid var(--border)",
          }}
        >
          {result.textPreview !== undefined ? result.textPreview : result.hexPreview}
        </pre>
      </div>
    </div>
  );
}
