import { Check, Download, ExternalLink, HardDriveDownload, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isTauriRuntime } from "../core/bridge";
import { DICT, type Lang } from "../core/i18n";
import { getDefaultLimits } from "../core/limits";
import type { ThemeMode } from "../core/theme";
import type { AppLimits } from "../core/types";
import { detectUserOs, formatBytes, type DesktopOs } from "./utils";

interface ModalFrameProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function ModalFrame({ title, onClose, children }: ModalFrameProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="window-header" style={{ cursor: "default" }}>
          <div className="window-title-group">
            <div className="window-dots">
              <span className="window-dot is-accent" />
              <span className="window-dot" />
            </div>
            <span className="window-title ui-lc">{title}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="close">
            <X size={14} />
          </button>
        </div>
        <div className="window-body">{children}</div>
      </div>
    </div>
  );
}

interface SettingsModalProps {
  lang: Lang;
  theme: ThemeMode;
  motion: boolean;
  limits: AppLimits;
  onChangeLang: (lang: Lang) => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeMotion: (motion: boolean) => void;
  onChangeLimits: (limits: AppLimits) => void;
  onClose: () => void;
}

export function SettingsModal({
  lang,
  theme,
  motion,
  limits,
  onChangeLang,
  onChangeTheme,
  onChangeMotion,
  onChangeLimits,
  onClose,
}: SettingsModalProps) {
  const t = DICT[lang];
  const isDesktop = isTauriRuntime();
  const [appVersion, setAppVersion] = useState<string>("0.1.0");

  useEffect(() => {
    if (!isDesktop) return;
    import("@tauri-apps/api/app")
      .then((mod) => mod.getVersion())
      .then((ver) => {
        if (ver) setAppVersion(ver);
      })
      .catch(() => undefined);
  }, [isDesktop]);

  return (
    <ModalFrame title={t.settingsTitle} onClose={onClose}>
      <div className="setting-row">
        <div>
          <div className="ui-lc" style={{ fontWeight: 600 }}>
            {t.themeLabel}
          </div>
          <div className="ui-lc" style={{ fontSize: "11.5px", color: "var(--text-dim)" }}>
            {t.themeHint}
          </div>
        </div>
        <select
          className="field-select ui-lc"
          value={theme}
          onChange={(e) => onChangeTheme(e.target.value as ThemeMode)}
        >
          <option value="light">{t.themeLight}</option>
          <option value="dark">{t.themeDark}</option>
          <option value="auto">{t.themeAuto}</option>
        </select>
      </div>

      <div className="setting-row">
        <div>
          <div className="ui-lc" style={{ fontWeight: 600 }}>
            {t.langLabel}
          </div>
          <div className="ui-lc" style={{ fontSize: "11.5px", color: "var(--text-dim)" }}>
            {t.langHint}
          </div>
        </div>
        <select className="field-select ui-lc" value={lang} onChange={(e) => onChangeLang(e.target.value as Lang)}>
          <option value="ru">русский</option>
          <option value="en">english</option>
        </select>
      </div>

      <div className="setting-row">
        <div>
          <div className="ui-lc" style={{ fontWeight: 600 }}>
            {t.motionLabel}
          </div>
          <div className="ui-lc" style={{ fontSize: "11.5px", color: "var(--text-dim)" }}>
            {t.motionHint}
          </div>
        </div>
        <input
          type="checkbox"
          checked={motion}
          onChange={(e) => onChangeMotion(e.target.checked)}
          style={{ width: "16px", height: "16px", accentColor: "var(--accent)" }}
        />
      </div>

      {isDesktop && (
        <div
          style={{
            marginTop: "6px",
            paddingTop: "10px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="ui-lc" style={{ fontWeight: 600, fontSize: "12.5px" }}>
              {t.limitsSectionTitle}
            </span>
            <button
              type="button"
              className="icon-btn ui-lc"
              onClick={() => onChangeLimits(getDefaultLimits(isDesktop))}
            >
              <RotateCcw size={12} />
              {t.limitResetBtn}
            </button>
          </div>

          <div className="setting-row">
            <span className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)" }}>
              {t.limitMaxFileLabel}
            </span>
            <input
              type="number"
              min={0}
              className="field-input preserve-case"
              style={{ width: "92px" }}
              value={limits.maxFileSizeMb}
              onChange={(e) =>
                onChangeLimits({ ...limits, maxFileSizeMb: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>

          <div className="setting-row">
            <span className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)" }}>
              {t.limitMaxBatchLabel}
            </span>
            <input
              type="number"
              min={0}
              className="field-input preserve-case"
              style={{ width: "92px" }}
              value={limits.maxBatchFiles}
              onChange={(e) =>
                onChangeLimits({ ...limits, maxBatchFiles: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>

          <div className="setting-row">
            <span className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)" }}>
              {t.limitMaxTotalLabel}
            </span>
            <input
              type="number"
              min={0}
              className="field-input preserve-case"
              style={{ width: "92px" }}
              value={limits.maxTotalQueueMb}
              onChange={(e) =>
                onChangeLimits({ ...limits, maxTotalQueueMb: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>

          <div className="setting-row">
            <span className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)" }}>
              {t.limitMaxUrlsLabel}
            </span>
            <input
              type="number"
              min={0}
              className="field-input preserve-case"
              style={{ width: "92px" }}
              value={limits.maxUrlCount}
              onChange={(e) =>
                onChangeLimits({ ...limits, maxUrlCount: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>

          <div className="setting-row">
            <span className="ui-lc" style={{ fontSize: "12px", color: "var(--text-dim)" }}>
              {t.limitTimeoutLabel}
            </span>
            <input
              type="number"
              min={5}
              className="field-input preserve-case"
              style={{ width: "92px" }}
              value={limits.urlTimeoutSec}
              onChange={(e) =>
                onChangeLimits({ ...limits, urlTimeoutSec: Math.max(5, Number(e.target.value) || 5) })
              }
            />
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: "6px",
          paddingTop: "10px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "11.5px",
          color: "var(--text-dim)",
        }}
      >
        <span>
          <span className="ui-lc">{t.developedBy} </span>
          <a
            href="https://qualbyy.github.io"
            target="_blank"
            rel="noreferrer"
            className="preserve-case"
            style={{ color: "var(--sand-dark)", fontWeight: 600, textDecoration: "none", borderBottom: "1px dotted var(--accent)" }}
          >
            qualbyy
          </a>
        </span>
        {isDesktop && (
          <span className="preserve-case">
            {t.versionLabel} {appVersion}
          </span>
        )}
      </div>
    </ModalFrame>
  );
}

interface OfflineModalProps {
  lang: Lang;
  onClose: () => void;
}

export function OfflineModal({ lang, onClose }: OfflineModalProps) {
  const t = DICT[lang];
  const [warming, setWarming] = useState(false);
  const [cachedDone, setCachedDone] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [cacheCount, setCacheCount] = useState<number | null>(null);

  useEffect(() => {
    if ("caches" in window) {
      void caches.keys().then((keys) => setCacheCount(keys.length));
    }
  }, [cachedDone]);

  async function warmOfflineEngines() {
    setWarming(true);
    try {
      const resp = await fetch("./offline-assets.json");
      const assetList: string[] = resp.ok ? await resp.json() : [];
      const cache = "caches" in window ? await caches.open("qsak-engines-v1") : null;

      setProgress({ done: 0, total: assetList.length });
      let done = 0;

      for (const relPath of assetList) {
        const url = `./${relPath}`;
        try {
          if (cache) {
            const hit = await cache.match(url);
            if (!hit) {
              const r = await fetch(url);
              if (r.ok) await cache.put(url, r);
            }
          } else {
            await fetch(url);
          }
        } catch {
          // ignore individual fetch failure
        }
        done++;
        setProgress({ done, total: assetList.length });
      }

      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.ready;
      }
      setCachedDone(true);
    } finally {
      setWarming(false);
    }
  }

  return (
    <ModalFrame title={t.offlineTitle} onClose={onClose}>
      <p className="ui-lc" style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>
        {t.offlineDesc}
      </p>

      <div className="panel-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="ui-lc" style={{ fontSize: "12px" }}>
            cache storage
          </span>
          <span className="badge preserve-case">
            {progress
              ? `${progress.done}/${progress.total}`
              : cacheCount !== null && cacheCount > 0
                ? `${cacheCount} cache(s)`
                : "ready"}
          </span>
        </div>

        <div className="file-row">
          <span className="preserve-case" style={{ fontSize: "12px" }}>
            {lang === "ru" ? "Текст, данные, конфиги, хеши, ZIP" : "Text, data, configs, hashes, ZIP"}
          </span>
          <span className="badge ui-lc">{lang === "ru" ? "в базовом кэше" : "core cache"}</span>
        </div>
        <div className="file-row">
          <span className="preserve-case" style={{ fontSize: "12px" }}>
            {lang === "ru" ? "Картинки (WebP / JPEG / PNG / AVIF / SVG / HEIC)" : "Images (WebP / JPEG / PNG / AVIF / SVG / HEIC)"}
          </span>
          <span className="badge ui-lc">{cachedDone ? (lang === "ru" ? "сохранено" : "cached") : lang === "ru" ? "по запросу" : "on demand"}</span>
        </div>
        <div className="file-row">
          <span className="preserve-case" style={{ fontSize: "12px" }}>
            {lang === "ru" ? "PDF, XLSX, 7z/RAR, аудио/видео (ffmpeg)" : "PDF, XLSX, 7z/RAR, audio/video (ffmpeg)"}
          </span>
          <span className="badge ui-lc">{cachedDone ? (lang === "ru" ? "сохранено" : "cached") : lang === "ru" ? "по запросу (~35 МБ)" : "on demand (~35 MB)"}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <button
          type="button"
          className="icon-btn is-primary ui-lc"
          onClick={() => void warmOfflineEngines()}
          disabled={warming}
        >
          {cachedDone ? <Check size={14} /> : <HardDriveDownload size={14} />}
          {cachedDone ? t.offlineCachedOk : t.offlineWarmBtn}
        </button>
      </div>
    </ModalFrame>
  );
}

interface DownloadModalProps {
  lang: Lang;
  onClose: () => void;
}

const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO ?? "qualbyy/qsak";

interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

const OS_BUILDS: Array<{ id: DesktopOs; label: string; ext: string; matchers: string[]; note: string }> = [
  {
    id: "windows",
    label: "Windows (x64)",
    ext: ".exe / .msi",
    matchers: [".exe", ".msi"],
    note: "Tauri v2 + Rust + ffmpeg sidecar",
  },
  {
    id: "linux",
    label: "Linux (x64)",
    ext: ".AppImage / .deb",
    matchers: [".appimage", ".deb"],
    note: "Tauri v2 + Rust + ffmpeg sidecar",
  },
  {
    id: "macos",
    label: "macOS (Apple Silicon / Intel)",
    ext: ".dmg",
    matchers: [".dmg"],
    note: "Tauri v2 + Rust + ffmpeg sidecar",
  },
];

export function DownloadModal({ lang, onClose }: DownloadModalProps) {
  const t = DICT[lang];
  const userOs = detectUserOs();
  const fallbackUrl = `https://github.com/${GITHUB_REPO}/releases/latest`;
  const [releaseTag, setReleaseTag] = useState<string | null>(null);
  const [assets, setAssets] = useState<ReleaseAsset[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tag_name?: string; assets?: ReleaseAsset[] } | null) => {
        if (data?.tag_name) setReleaseTag(data.tag_name);
        if (Array.isArray(data?.assets)) setAssets(data.assets);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <ModalFrame title={t.downloadTitle} onClose={onClose}>
      <p className="ui-lc" style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>
        {t.downloadDesc}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {OS_BUILDS.map((os) => {
          const isCurrent = os.id === userOs;
          const matchedAsset = assets.find((a) =>
            os.matchers.some((m) => a.name.toLowerCase().endsWith(m)),
          );
          const href = matchedAsset ? matchedAsset.browser_download_url : fallbackUrl;

          return (
            <div
              key={os.id}
              className="file-row"
              style={isCurrent ? { borderColor: "var(--accent)", background: "var(--sand-badge)" } : undefined}
            >
              <div>
                <div className="preserve-case" style={{ fontWeight: 600, fontSize: "12.5px" }}>
                  {os.label}
                  {isCurrent && (
                    <span className="badge ui-lc" style={{ marginLeft: "8px" }}>
                      {t.downloadRecommended}
                    </span>
                  )}
                </div>
                <div className="preserve-case" style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                  {matchedAsset ? `${matchedAsset.name} · ${formatBytes(matchedAsset.size)}` : `${os.ext} · ${os.note}`}
                </div>
              </div>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={`icon-btn ui-lc ${isCurrent ? "is-primary" : ""}`}
                style={{ textDecoration: "none" }}
              >
                <Download size={13} />
                {matchedAsset ? "download" : "github releases"}
              </a>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="preserve-case" style={{ fontSize: "11px", color: "var(--text-dim)" }}>
          {releaseTag ? `latest: ${releaseTag}` : "Tauri v2 batteries-included (~80–120 MB)"}
        </span>
        <a
          href={`https://github.com/${GITHUB_REPO}/releases`}
          target="_blank"
          rel="noreferrer"
          className="icon-btn ui-lc"
          style={{ textDecoration: "none" }}
        >
          <ExternalLink size={13} />
          {t.downloadOpenReleases}
        </a>
      </div>
    </ModalFrame>
  );
}
