# AnyDownload

[![Code Size](https://img.shields.io/github/languages/code-size/HenryLok0/AnyDownload?style=flat-square&logo=github)](https://github.com/HenryLok0/AnyDownload)
[![npm version](https://img.shields.io/npm/v/anydownload?style=flat-square)](https://www.npmjs.com/package/anydownload)

[![MIT License](https://img.shields.io/github/license/HenryLok0/AnyDownload?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/HenryLok0/AnyDownload?style=flat-square)](https://github.com/HenryLok0/AnyDownload/stargazers)

Download websites for **offline browsing** — HTML, CSS, JavaScript, images, fonts, and common SPA bundles (React, Vite, Vue).

---

## Install

### 1. CLI (npm)

```bash
npm install -g anydownload
```

### 2. Desktop app (recommended for GUI users)

Grab the **desktop build** for your OS from **[Releases](https://github.com/HenryLok0/AnyDownload/releases)** — Windows portable `.exe`, macOS `.dmg`, and Linux `.AppImage` are uploaded automatically when **`main`** is updated (GitHub Actions). No wizard-style setup on Windows: run the `.exe` directly.

### From source

`git clone` → `cd AnyDownload` → `npm install`

---

## Choose your scenario (copy & run)

| I want to… | Command |
|------------|---------|
| Download one page + assets (default) | `anydownload example.com` |
| Download a simple static site (fast, no browser) | `anydownload example.com --mode static` |
| Download a React / Vite / SPA site | `anydownload example.com --mode render` |
| Download and open preview when done (SPA) | `anydownload example.com --mode render --open` |
| Skip external CDN/fonts assets | `anydownload example.com --block-external-assets` |
| Block specific asset hosts/patterns | `anydownload example.com --block-asset "unpkg.com/*" --block-asset "cdn.jsdelivr.net/*"` |
| Download full site (depth 2) | `anydownload example.com --preset full` |
| Mirror many pages (depth 5) | `anydownload example.com --preset mirror` |
| Preview an existing download folder | `anydownload serve test` (auto-finds `test/example.com/`) |
| Interactive wizard (URL, scope, engine — no browser pick) | `anydownload --wizard` |
| Only CSS files | `anydownload example.com --type css` |
| *(optional)* List URLs only (no download) | `anydownload example.com -p -o mysite` |

---

## Important: how to view offline sites

### Do NOT double-click `index.html`

Modern sites (React, Vite, Next.js) use **ES modules**. Browsers block them on `file://` → you see a **white screen** even when files downloaded correctly.

### DO use HTTP preview

```bash
# After download (render mode asks yes/no to open automatically)
anydownload example.com --mode render

# Or skip the prompt and open immediately
anydownload example.com --mode render --open

# Preview a folder you already downloaded (parent or host folder both work)
anydownload serve test
anydownload serve test/example.com
```

Preview runs at **http://127.0.0.1:8765/** (default) and always opens the site root `/`. Press **Ctrl+C** to stop the server.

> **Note:** `--mode render` finishes with **Open offline preview? (Y/n)**. Choosing **Yes** runs `anydownload serve "<folder>"` and opens your browser.

---

## Mirrored HTML layout (framework docs)

- Pages are mirrored to a folder tree aligned with URLs: `/` becomes `index.html`, `/learn` becomes `learn/index.html`, `/reference/react` becomes `reference/react/index.html`.
- Scripts, stylesheets, and other same-origin URLs are rewritten **relative to the saved HTML file** so shared roots like `_next/static/...` still resolve offline at any depth.

### Preview (`anydownload serve`)

- Open `http://127.0.0.1:8765/learn/` **or** `http://127.0.0.1:8765/learn` once `learn/index.html` exists—the server probes `subdir/index.html` and `subdir.html` before falling back to the SPA bootstrap page.

- Nested pages often request **`/subdir/_next/...`**, **`/subdir/static/...`**, **`/subdir/assets/...`**, or **`/subdir/logo.svg`** (relative links) while the mirror keeps those files at the site root; `anydownload serve` maps matching URLs back to the root bundles and public assets so nested routes still load.

### Backward-compatible layout

- Use **`--legacy-flat-pages`** if you rely on older behavior with every HTML file in the hostname root (`_underscore.html`). Default is hierarchical.

---

## Engine modes (`--mode`)

| Mode | Use when | Browser install? |
|------|----------|------------------|
| `auto` (default) | Unknown site; picks static or render | Only if SPA detected |
| `static` | Blogs, docs, plain HTML | **No** |
| `render` | SPAs, React, Vue, Vite, heavy JS | **Yes** — Playwright + Chromium (auto on install) |

```bash
anydownload https://example.com --mode static
anydownload https://spa-app.com --mode render
anydownload https://example.com                    # auto
anydownload https://spa-app.com -d                 # same as --mode render
```

**Render mode** saves assets from the browser’s network capture (not plain HTTP re-download). Use `--wait 5000` if images load late (e.g. backgrounds).

```bash
anydownload example.com --mode render --wait 5000 -v
```

---

## Presets

| Preset | What it does |
|--------|----------------|
| `page` (default) | One page + all assets on that page |
| `full` | Same-hostname links, depth 2, sitemap |
| `mirror` | Deep crawl, depth 5, sitemap |

> **Mirror** follows links on the **exact same hostname** only (not `sub.example.com`). For single-page portfolios (SPA), prefer **`page`** preset — mirror crawls many routes and is slow on portfolio sites.

```bash
anydownload https://example.com --preset full -o mysite
```

---

## Common options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <dir>` | Output parent folder (files go in `<dir>/<hostname>/`) | `downloaded_site` |
| `--mode <mode>` | `static` \| `render` \| `auto` | `auto` |
| `--open` | Start HTTP preview + open browser | off |
| `--serve` | Start HTTP preview after download | off |
| `--serve-port <n>` | Preview port (download command) | `8765` |
| `--wait <ms>` | Extra wait after page load (**render** only) | `2000` |
| `-v, --verbose` | Verbose logs | off |
| `--preset <name>` | `page` \| `full` \| `mirror` | `page` |
| `-r, --recursive` | Follow same-**hostname** links | preset |
| `-m, --max-depth <n>` | Crawl / path-discovery depth | `1` |
| `--type <type>` | Filter assets: `all` \| `image` \| `css` \| `js` \| `html` \| `media` \| `font` | `all` |
| `--block-external-assets` | Skip cross-origin assets (CDN/fonts/etc.) | off |
| `--block-asset <pattern>` | Block URL patterns (repeatable, supports `*` and `/regex/flags`) | — |
| `--sitemap` | Use sitemap when crawling + write `sitemap.xml.gz` | off |
| `--delay <ms>` | Delay between requests (path probe / download) | `500` |
| `--concurrency <n>` | Parallel asset downloads | `5` |
| `--filter <regex>` | Only URLs matching regex | — |
| `-d, --dynamic` | Same as `--mode render` | off |
| `--legacy-flat-pages` | Flat HTML in hostname root (`_learn.html` layout) | off |

**Render-only:** `--browser` (`playwright` default, or `puppeteer`), `--browser-engine`, `--headless`

**`serve` subcommand:** `-p, --port <n>` — preview server port (default `8765`)

Full list: `anydownload --help`

### Block external/CDN assets

Use `--block-external-assets` to keep only same-host assets, or set explicit patterns via `--block-asset`.

```bash
anydownload example.com \
  --block-external-assets \
  --block-asset "unpkg.com/*" \
  --block-asset "cdn.jsdelivr.net/*" \
  --block-asset "fonts.gstatic.com/*" \
  --block-asset "fonts.googleapis.com/*"
```

Pattern notes:

- `host/*` matches `host/path...` regardless of `http`/`https`.
- Repeat `--block-asset` multiple times.
- Regex is supported with `/.../flags`, e.g. `--block-asset '/fonts\\.(gstatic|googleapis)\\.com\\//i'`.

### Path discovery (optional, `-p`)

**Auxiliary only** — does not download the site. Writes **`paths.txt`** under `<output>/<hostname>/` by combining sitemap, crawl, robots hints, JS/service-worker strings, and optional HTTP probes.

```bash
anydownload example.com -p -o mysite
# → mysite/example.com/paths.txt
```

| Flag | When to use |
|------|-------------|
| `--path-deep` | Bundled ~2000-path wordlist + Wayback (slow; use `--delay`) |
| `--path-seeds <file>` | One guessed path per line (e.g. secret routes you know) |
| `--path-probe-depth 2` | Also probe `/found-prefix/word` (capped) |
| `--path-txt` / `./path.txt` | Replace bundled [`data/path-wordlist.txt`](data/path-wordlist.txt) |
| `--path-no-render` | Faster scan without Playwright |

Example (deeper scan): `anydownload example.com -p --path-deep --delay 500 -o mysite`. Paths with no public signal still need **`--path-seeds`**. Full flags: `anydownload --help`.

---

## Project limitations

AnyDownload builds **offline-browsable mirrors**. It is **not** a universal “download anything from the internet” tool.

### Works well

- Public HTTP(S) pages and same-origin assets
- Static sites, blogs, documentation
- Many SPAs with `--mode render` + HTTP preview
- HTML, CSS, JS (including `type="module"`), images, fonts, preload/modulepreload
- WASM, JSON, webp/avif, media when captured in render mode

### Does not work (or unreliable)

| Case | Why |
|------|-----|
| Login / paywall | No credentials unless you pass cookies |
| DRM video (Netflix, etc.) | Encrypted streams |
| CAPTCHA / bot protection | Needs human verification |
| WebSocket / live streams | Not a static file |
| `blob:` / `data:` URLs | Skipped by design |
| Infinite scroll without scrolling | Content never loads |
| Double-clicking `index.html` | `file://` breaks ES modules → white screen |
| “Download every file on the internet” | Out of scope |

Themes, locale switching, or client bundles that lazy-load translations from CDN may behave differently offline—even when `_next`/React chunks load locally. Interactive features aren’t guaranteed. External links (`https://`, other hostnames, e.g. GitHub) intentionally stay absolute so browsers can reach the live network when available.

Optional failures (e.g. `favicon`, `banner.png`, cross-origin CDN fonts) may be reported in verbose mode but do not increment the failed count or block the main page.

---

## Output layout

Files are saved under **`<output-folder>/<hostname>/`**, not directly in the output folder root:

```
downloaded_site/                          ← folder you pass with -o or wizard
└── example.com/               ← hostname subfolder (always created)
    ├── index.html
    ├── paths.txt              ← when using -p / --path
    ├── sitemap.xml.gz         ← when --sitemap is used
    └── assets/
        ├── index-xxxxx.js
        └── index-xxxxx.css
```

If you choose output `test`, the site lives at `test/example.com/`. A separate default `downloaded_site/` folder is only used when you omit `-o` entirely (not from wizard defaults leaking into CLI).

---

## Desktop App (Executable)

AnyDownload can be compiled into a standalone desktop application (**Windows portable `.exe`**, **macOS `.dmg`**, **Linux `.AppImage`**) using Electron. The app bundles the Web GUI and Chromium directly, meaning users do not need Node.js or Playwright separately.

On **Windows**, the release is a **single portable executable**: download and double-click — no setup wizard (`NSIS`).

To build locally (match the OS you are running):

```bash
# Install dependencies
npm install

# Start in development mode
npm run electron:start

# Build for Windows (portable single .exe, no installer)
npm run electron:build:win

# Build for macOS (.dmg — open disk image, drag/run the app or run from mounted volume)
npm run electron:build:mac

# Build for Linux (.AppImage — chmod +x then run)
npm run electron:build:linux

# Same as electron-builder for the CURRENT platform only (does not emit all three OSes locally)
npm run electron:build:all
```

Built binaries appear under **`dist-electron/`**. Release assets use predictable names (**`AnyDownload-Windows-<version>.exe`**, **`AnyDownload-macOS-<version>-<arch>.dmg`**, **`AnyDownload-Linux-<version>-<arch>.AppImage`**).

### GitHub Releases (automatic)

Each **push to `main`** runs [.github/workflows/release-electron.yml](.github/workflows/release-electron.yml) and creates a **new GitHub Release** with **Windows portable `.exe`**, **macOS `.dmg`**, and **Linux `.AppImage`** attachments. Release **version tagging** bumps the **MINOR semver** (`x.y.z` → `x.(y+1).0`; e.g. `2.0.0` → `2.1.0`) using the **[latest Release](https://github.com/HenryLok0/AnyDownload/releases)** tag as baseline, or `package.json` `version` if no release exists yet.

Each Release includes:

- Windows portable `.exe` / macOS `.dmg` / Linux `.AppImage` produced in CI  
- **`AnyDownload-<version>-source.zip`** (`git archive` of the triggering commit — tracked sources only)

GitHub also shows **Source code (zip)** and **Source code (tar.gz)** for the Release tag automatically in the Releases UI — those are maintained by GitHub alongside the desktop binaries.

**macOS code signing / notarization:** CI produces an unsigned `.dmg` by default. Wide distribution typically requires Apple Developer **`CSC_`*** env secrets and optional notarization; that is advanced setup and not required for those builds to attach to the Release.

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Contributors

<a href="https://github.com/HenryLok0/AnyDownload/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=HenryLok0/AnyDownload" />
</a>

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- GitHub Issues: [Open an issue](https://github.com/HenryLok0/AnyDownload/issues)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=HenryLok0/AnyDownload&type=Date)](https://star-history.com/#HenryLok0/AnyDownload&Date)