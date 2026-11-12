import { ArrowLeftRight, Copy, Check, Download, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { engineBridge } from "../core/bridge";
import { DICT, type Lang } from "../core/i18n";
import { SWAP_MAP, TEXT_OPERATIONS } from "../core/registry";
import type { TextOperationId } from "../core/types";
import { downloadBytes } from "./utils";

interface TextPlaygroundProps {
  lang: Lang;
  initialInput?: string;
  selectedOp: TextOperationId;
  onChangeOp: (op: TextOperationId) => void;
}

export function TextPlayground({ lang, initialInput, selectedOp, onChangeOp }: TextPlaygroundProps) {
  const t = DICT[lang];
  const [input, setInput] = useState(
    initialInput ?? '{\n  "name": "qsak",\n  "offline": true,\n  "formats": ["json", "yaml", "webp", "zip"]\n}',
  );
  const [output, setOutput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialInput !== undefined) {
      setInput(initialInput);
    }
  }, [initialInput]);

  const opMeta = TEXT_OPERATIONS.find((o) => o.id === selectedOp) ?? TEXT_OPERATIONS[0];
  const swapTarget = SWAP_MAP[selectedOp];

  async function execute(textVal = input, opVal = selectedOp) {
    setErr(null);
    try {
      const res = await engineBridge.runText(opVal, textVal);
      setOutput(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void execute(input, selectedOp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOp]);

  function handleSwap() {
    if (!swapTarget) return;
    const nextIn = output || input;
    setInput(nextIn);
    onChangeOp(swapTarget);
  }

  async function handleCopy() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  function handleDownload() {
    if (!output) return;
    downloadBytes(new TextEncoder().encode(output), `qsak-output.${opMeta.outputExt}`, opMeta.outputMime);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
      <div className="panel-card text-toolbar">
        <div className="text-toolbar-group">
          <span className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)" }}>
            {t.operationLabel}:
          </span>
          <select
            className="field-select preserve-case"
            value={selectedOp}
            onChange={(e) => onChangeOp(e.target.value as TextOperationId)}
          >
            {TEXT_OPERATIONS.map((op) => (
              <option key={op.id} value={op.id}>
                {op.label}
              </option>
            ))}
          </select>
          {swapTarget && (
            <button type="button" className="icon-btn ui-lc" onClick={handleSwap}>
              <ArrowLeftRight size={13} />
              {t.swapIo}
            </button>
          )}
        </div>

        <div className="text-toolbar-actions">
          <button type="button" className="icon-btn is-primary ui-lc" onClick={() => void execute()}>
            <Play size={13} />
            {t.runBtn}
          </button>
          <button type="button" className="icon-btn ui-lc" onClick={() => void handleCopy()} disabled={!output}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? t.copied : t.copyResult}
          </button>
          <button type="button" className="icon-btn ui-lc" onClick={handleDownload} disabled={!output}>
            <Download size={13} />
            {t.downloadOutput}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span className="ui-lc" style={{ fontSize: "11.5px", color: "var(--text-dim)" }}>
            {t.inputLabel}
          </span>
          <textarea
            className="code-area preserve-case"
            style={{ flex: 1, minHeight: "280px" }}
            value={input}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              void execute(val, selectedOp);
            }}
            spellCheck={false}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span className="ui-lc" style={{ fontSize: "11.5px", color: "var(--text-dim)" }}>
            {t.outputLabel} ({opMeta.outputExt})
          </span>
          {err ? (
            <div
              className="panel-card preserve-case"
              style={{ flex: 1, borderColor: "var(--accent)", color: "var(--sand-dark)", fontSize: "12.5px" }}
            >
              {err}
            </div>
          ) : (
            <textarea
              className="code-area preserve-case"
              style={{ flex: 1, minHeight: "280px" }}
              value={output}
              readOnly
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
