# AnyDownload

[![npm version](https://img.shields.io/npm/v/anydownload?style=flat-square)](https://www.npmjs.com/package/anydownload)
[![MIT License](https://img.shields.io/github/license/HenryLok0/AnyDownload?style=flat-square)](LICENSE)

Download entire websites for offline browsing, archiving, or learning. Supports static sites and JavaScript-heavy pages via a unified **BrowserEngine** (Puppeteer or Playwright) with network capture and recursive CSS asset resolution.

---

## Quick Start

```bash
npm install -g anydownload

# Download a page and all assets (domain without https:// also works)
anydownload example.com
anydownload https://example.com

# Full site preset (recursive depth 2, sitemap, dynamic)
anydownload https://example.com --preset full

# Interactive wizard
anydownload --wizard

# Web GUI
anydownload --gui
```

---

## Installation

```bash
npm install -g anydownload

# Or from source
git clone https://github.com/HenryLok0/AnyDownload
cd AnyDownload
npm install
```

**No manual browser install needed for most sites.** AnyDownload uses its own **Static Engine** (HTTP + CSS parsing) by default. A headless browser is only used when a page requires JavaScript rendering—and Chromium is installed automatically on first use.

---

## Presets

| Preset | Description |
|--------|-------------|
| `page` (default) | Single page + all linked assets (CSS, images, fonts) |
| `full` | Recursive depth 2, sitemap discovery, dynamic mode |
| `mirror` | Deep mirror (depth 5), sitemap, dynamic mode |

```bash
anydownload https://example.com --preset mirror -o mysite
```

---

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output` | Output folder | `downloaded_site` |
| `--preset` | `page` \| `full` \| `mirror` | `page` |
| `--wizard` | Interactive setup | - |
| `--gui` | Start web interface | - |
| `-d, --dynamic` | Force browser rendering | auto |
| `--mode` | `static` \| `render` \| `auto` | `auto` |
| `--engine-mode` | (deprecated) same as `--mode` | - |
| `--browser` | Render backend: `puppeteer` \| `playwright` | `puppeteer` |
| `--browser-engine` | `chromium` \| `firefox` \| `webkit` | `chromium` |
| `-r, --recursive` | Follow same-domain links | preset |
| `-m, --max-depth` | Recursion depth | preset |
| `--sitemap` | Read sitemap.xml + write sitemap.xml.gz | preset |
| `--ignore-robots` | Skip robots.txt check | `false` |
| `--wait` | Extra ms after page load | `2000` |

### Advanced subcommand

```bash
anydownload advanced https://example.com --proxy http://127.0.0.1:8080 --type css
```

---

## Web GUI

```bash
anydownload --gui
# Visit http://localhost:3000
```

The GUI has three levels: **simple** (URL, output, preset), **advanced** (browser, depth, concurrency), and **expert** (proxy, filters, login JSON).

---

## AnyDownload Engine

AnyDownload has its own engine with three modes—no Playwright install required unless render mode is triggered:

| Mode | When used | Browser needed? |
|------|-----------|-----------------|
| `static` | Simple HTML sites, blogs, docs | **No** |
| `auto` (default) | Detects if page needs JS; uses static when possible | Only if detected |
| `render` | SPAs, React/Vue/Next.js sites (`-d` flag) | Yes (auto-installed) |

```bash
# Static only — fastest, zero browser
anydownload https://example.com --mode static

# Force browser rendering
anydownload https://spa-app.com --mode render

# Auto (default) — smart pick
anydownload https://example.com
```

Render backend defaults to **Puppeteer** (Chromium downloads with `npm install`). Use `--browser playwright` only if you prefer Playwright; it will auto-install Chromium on first render download.

---

## Docker

```bash
docker build -t anydownload .
docker run -p 3000:3000 anydownload
```

---

## Library API

```javascript
const { SiteDownloader } = require('anydownload/downloader');

const downloader = new SiteDownloader({
  outputDir: './output',
  preset: 'page',
  browserType: 'playwright'
});

await downloader.downloadWebsite('https://example.com');
```

---

## Architecture (v2)

```
src/
├── engine/          # Unified BrowserEngine (Puppeteer + Playwright)
├── downloader/      # SiteDownloader, AssetPipeline, parsers, Crawler
├── cli/             # Simplified CLI with presets
└── server/          # Web GUI
```

---

## License

MIT — see [LICENSE](LICENSE)
