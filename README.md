# AnyDownload

[![Code Size](https://img.shields.io/github/languages/code-size/HenryLok0/AnyDownload?style=flat-square&logo=github)](https://github.com/HenryLok0/AnyDownload)
[![npm version](https://img.shields.io/npm/v/anydownload?style=flat-square)](https://www.npmjs.com/package/anydownload)

[![MIT License](https://img.shields.io/github/license/HenryLok0/AnyDownload?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/HenryLok0/AnyDownload?style=flat-square)](https://github.com/HenryLok0/AnyDownload/stargazers)

Download websites for **offline browsing** — HTML, CSS, JavaScript, images, fonts, and common SPA bundles (React, Vite, Vue).

---

## Install

```bash
npm install -g anydownload
```

From source: `git clone` → `cd AnyDownload` → `npm install`

---

## Choose your scenario (copy & run)

| I want to… | Command |
|------------|---------|
| Download one page + assets (default) | `anydownload example.com` |
| Download a simple static site (fast, no browser) | `anydownload example.com --mode static` |
| Download a React / Vite / SPA site | `anydownload example.com --mode render` |
| Download and open preview when done (SPA) | `anydownload example.com --mode render --open` |
| Download full site (depth 2) | `anydownload example.com --preset full` |
| Mirror many pages (depth 5) | `anydownload example.com --preset mirror` |
| Preview an existing download folder | `anydownload serve test` (auto-finds `test/example.com/`) |
| Interactive wizard (URL, scope, engine — no browser pick) | `anydownload --wizard` |
| Only CSS files | `anydownload example.com --type css` |
| Discover hidden / unlinked paths | `anydownload example.com -p -o mysite` |
| Deep path discovery (Wayback + wordlist) | `anydownload example.com -p --path-deep --delay 500` |

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

- Nested framework folders often make the browser request **`/subdir/_next/...`** or **`/subdir/assets/...`** even though mirrored files live at **`/_next/...`** or **`/assets/...`**; `anydownload serve` maps those URLs back to the site root so nested pages still load CSS/JS.

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
| `-p, --path` | Discover URLs; save `paths.txt` only (uses Playwright by default) | off |
| `--path-deep` | Add Wayback Machine + extended path wordlist | off |
| `--path-no-render` | Skip Playwright during `-p` | off |
| `--open` | Start HTTP preview + open browser | off |
| `--serve` | Start HTTP preview after download | off |
| `--serve-port <n>` | Preview port (download command) | `8765` |
| `--wait <ms>` | Extra wait after page load (**render** only) | `2000` |
| `-v, --verbose` | Verbose logs | off |
| `--preset <name>` | `page` \| `full` \| `mirror` | `page` |
| `-r, --recursive` | Follow same-**hostname** links | preset |
| `-m, --max-depth <n>` | Crawl / path-discovery depth | `1` |
| `--type <type>` | Filter assets: `all` \| `image` \| `css` \| `js` \| `html` \| `media` \| `font` | `all` |
| `--sitemap` | Use sitemap when crawling + write `sitemap.xml.gz` | off |
| `--delay <ms>` | Delay between requests (path probe / download) | `500` |
| `--concurrency <n>` | Parallel asset downloads | `5` |
| `--filter <regex>` | Only URLs matching regex | — |
| `-d, --dynamic` | Same as `--mode render` | off |
| `--legacy-flat-pages` | Flat HTML in hostname root (`_learn.html` layout) | off |

**Render-only:** `--browser` (`playwright` default, or `puppeteer`), `--browser-engine`, `--headless`

**`serve` subcommand:** `-p, --port <n>` — preview server port (default `8765`)

Full list: `anydownload --help`

### Path discovery (`-p`)

```bash
anydownload example.com -p -o mysite
# → mysite/example.com/paths.txt
```

Sources: sitemap, `robots.txt`, same-hostname crawl, path probes, JS hints, web manifest, source maps, **Playwright network capture** (default). With `--path-deep`: [Wayback Machine](https://web.archive.org) historical URLs + ~150 path wordlist probes.

```bash
anydownload example.com -p --path-deep --delay 500 -o mysite
anydownload example.com -p --path-no-render   # static discovery only, faster
```

Does **not** download the full site. Cannot guarantee login-only or CAPTCHA-protected routes. Use only on sites you are allowed to scan.

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