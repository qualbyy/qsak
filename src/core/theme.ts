// Логика темы и производных CSS-переменных (перенесена из qplate/shell.js)

export type ThemeMode = "light" | "dark" | "auto";

const DEFAULT_ACCENT = "#6ea8dc";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function tint(rgb: Rgb, amount: number): string {
  const mix = Math.max(0, Math.min(1, amount));
  const vals = [rgb.r, rgb.g, rgb.b].map((v) => Math.round(v + (255 - v) * mix));
  return `rgb(${vals.join(" ")})`;
}

function tintAlpha(rgb: Rgb, amount: number, alpha: number): string {
  const mix = Math.max(0, Math.min(1, amount));
  const vals = [rgb.r, rgb.g, rgb.b].map((v) => Math.round(v + (255 - v) * mix));
  return `rgba(${vals.join(", ")}, ${alpha})`;
}

function shade(rgb: Rgb, amount: number): string {
  const mix = Math.max(0, Math.min(1, amount));
  const vals = [rgb.r, rgb.g, rgb.b].map((v) => Math.round(v * (1 - mix)));
  return `rgb(${vals.join(" ")})`;
}

function shadeAlpha(rgb: Rgb, amount: number, alpha: number): string {
  const mix = Math.max(0, Math.min(1, amount));
  const vals = [rgb.r, rgb.g, rgb.b].map((v) => Math.round(v * (1 - mix)));
  return `rgba(${vals.join(", ")}, ${alpha})`;
}

function onAccent(rgb: Rgb): string {
  const light = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return light > 170 ? "#1a1714" : "#ffffff";
}

export function resolveDarkMode(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "auto") {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  }
  return false;
}

export function applyQplateTheme(mode: ThemeMode, motion = true): void {
  const rgb = hexToRgb(DEFAULT_ACCENT);
  const root = document.documentElement.style;
  const dark = resolveDarkMode(mode);

  root.setProperty("--accent", DEFAULT_ACCENT);
  root.setProperty("--accent-deep", tint(rgb, 0.2));
  root.setProperty("--sand-accent", DEFAULT_ACCENT);
  root.setProperty("--accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  root.setProperty("--accent-dark", shade(rgb, 0.32));
  root.setProperty("--on-accent", onAccent(rgb));
  root.setProperty("--photo-overlay", shadeAlpha(rgb, 0.55, 0.82));

  if (dark) {
    root.setProperty("--bg", shade(rgb, 0.84));
    root.setProperty("--term-bg", shade(rgb, 0.9));
    root.setProperty("--header-bg", shade(rgb, 0.74));
    root.setProperty("--border", shade(rgb, 0.62));
    root.setProperty("--border-dark", shade(rgb, 0.48));
    root.setProperty("--text", tint(rgb, 0.88));
    root.setProperty("--text-dim", tint(rgb, 0.62));
    root.setProperty("--ink", tint(rgb, 0.9));
    root.setProperty("--sand-dark", tint(rgb, 0.42));
    root.setProperty("--sand-badge", shade(rgb, 0.7));
    root.setProperty("--prompt-user", tint(rgb, 0.5));
    root.setProperty("--prompt-path", tint(rgb, 0.62));
    root.setProperty("--dock-bg", shadeAlpha(rgb, 0.68, 0.9));
    root.setProperty("--dock-hover-bg", shade(rgb, 0.86));
    root.setProperty("--surface-soft", shade(rgb, 0.78));
    root.setProperty("--surface-inset", shade(rgb, 0.82));
    root.setProperty("--surface-deep", shade(rgb, 0.72));
    root.setProperty("--surface-mute", shade(rgb, 0.68));
    root.setProperty("--surface-paper", shade(rgb, 0.76));
    root.setProperty("--hover-strong", shade(rgb, 0.6));
  } else {
    root.setProperty("--bg", tint(rgb, 0.93));
    root.setProperty("--term-bg", tint(rgb, 0.965));
    root.setProperty("--header-bg", tint(rgb, 0.87));
    root.setProperty("--border", tint(rgb, 0.78));
    root.setProperty("--border-dark", tint(rgb, 0.66));
    root.setProperty("--text", "#141210");
    root.setProperty("--text-dim", "#3b352d");
    root.setProperty("--ink", "#141210");
    root.setProperty("--sand-dark", shade(rgb, 0.2));
    root.setProperty("--sand-badge", tint(rgb, 0.88));
    root.setProperty("--prompt-user", tint(rgb, 0.38));
    root.setProperty("--prompt-path", tint(rgb, 0.55));
    root.setProperty("--dock-bg", tintAlpha(rgb, 0.87, 0.88));
    root.setProperty("--dock-hover-bg", tint(rgb, 0.985));
    root.setProperty("--surface-soft", tint(rgb, 0.96));
    root.setProperty("--surface-inset", tint(rgb, 0.975));
    root.setProperty("--surface-deep", tint(rgb, 0.94));
    root.setProperty("--surface-mute", tint(rgb, 0.9));
    root.setProperty("--surface-paper", tint(rgb, 0.985));
    root.setProperty("--hover-strong", tint(rgb, 0.865));
  }

  document.body.setAttribute("data-wallpaper", "dots");
  document.body.classList.toggle("theme-dark", dark);
  document.body.classList.toggle("no-motion", !motion);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
