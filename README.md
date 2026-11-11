# qsak

Local-first desktop and web offline converter and data processor.

## Features

- Fully offline: zero telemetry, zero analytics, all conversions happen locally.
- Supported operations:
  - Video and audio: transcode, trim, extract audio, convert GIF (FFmpeg sidecar / WebAssembly).
  - Images: WebP, AVIF, PNG, JPEG, SVG, HEIC/HEIF conversion and optimization.
  - Documents: PDF merge, split, rotate, metadata strip; CSV to XLSX; Markdown to HTML/PDF.
  - Data: JSON, YAML, TOML, CSV, XML conversion and formatting.
  - Archives: ZIP, TAR, TAR.GZ, 7Z inspection and extraction.
  - Crypto and hashing: MD5, SHA-1, SHA-256, SHA-512, Base64, Hex, JWT decode.

## Installation

### Linux (AppImage)

Run the following one-liner to download the latest AppImage, make it executable, and move it to `~/.local/bin`:

```bash
mkdir -p ~/.local/bin && curl -s https://api.github.com/repos/qualbyy/qsak/releases/latest | grep "browser_download_url.*AppImage" | cut -d '"' -f 4 | head -n 1 | xargs -I {} curl -L {} -o ~/.local/bin/qsak && chmod +x ~/.local/bin/qsak
```

If `~/.local/bin` is in your `PATH`, launch directly:

```bash
qsak
```

### Windows

Download the latest `.msi` or `-setup.exe` installer from [Releases](https://github.com/qualbyy/qsak/releases).

### Web / PWA

Available directly in your browser with full offline caching:
[https://qualbyy.github.io/qsak/](https://qualbyy.github.io/qsak/)

## Development

```bash
npm install
npm run dev
```

Build desktop app locally:

```bash
npm run build
npm run tauri build
```
