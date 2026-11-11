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

Run the following command to download the latest AppImage, make it executable, and install it into `~/.local/bin`:

```bash
mkdir -p ~/.local/bin && curl -s https://api.github.com/repos/qualbyy/qsak/releases/latest | grep "browser_download_url.*AppImage" | cut -d '"' -f 4 | head -n 1 | xargs -I {} curl -L {} -o ~/.local/bin/qsak && chmod +x ~/.local/bin/qsak
```

Run directly:

```bash
qsak
```

### Windows

Download the installer (`.msi` or `-setup.exe`) from [Releases](https://github.com/qualbyy/qsak/releases).

### Web / PWA

Available in browser with offline cache support:
[https://qualbyy.github.io/qsak/](https://qualbyy.github.io/qsak/)

## Development

```bash
npm install
npm run dev
```

Desktop build:

```bash
npm run build
npm run tauri build
```

---

## кусак

Локальный офлайн-конвертер и процессор данных для десктопа и веба.

### Возможности

- Полная автономность: без отправки данных на сервер, без аналитики, вся обработка происходит на устройстве.
- Поддерживаемые форматы и операции:
  - Видео и аудио: транскодирование, обрезка, извлечение аудио, экспорт в GIF (нативный FFmpeg sidecar / WebAssembly).
  - Изображения: конвертация и сжатие WebP, AVIF, PNG, JPEG, SVG, HEIC/HEIF.
  - Документы: объединение, разделение, поворот, очистка метаданных PDF; конвертация CSV в XLSX; рендер Markdown в HTML/PDF.
  - Данные: форматирование и взаимная конвертация JSON, YAML, TOML, CSV, XML.
  - Архивы: просмотр содержимого и распаковка ZIP, TAR, TAR.GZ, 7Z.
  - Криптография и хеши: MD5, SHA-1, SHA-256, SHA-512, Base64, Hex, декодирование JWT.

### Установка

#### Linux (AppImage)

Команда для загрузки последней версии AppImage и установки в `~/.local/bin/qsak`:

```bash
mkdir -p ~/.local/bin && curl -s https://api.github.com/repos/qualbyy/qsak/releases/latest | grep "browser_download_url.*AppImage" | cut -d '"' -f 4 | head -n 1 | xargs -I {} curl -L {} -o ~/.local/bin/qsak && chmod +x ~/.local/bin/qsak
```

Запуск:

```bash
qsak
```

#### Windows

Загрузите `.msi` или инсталлятор `-setup.exe` из раздела [Releases](https://github.com/qualbyy/qsak/releases).

#### Веб-версия / PWA

Работает прямо в браузере с поддержкой полного офлайн-режима:
[https://qualbyy.github.io/qsak/](https://qualbyy.github.io/qsak/)
