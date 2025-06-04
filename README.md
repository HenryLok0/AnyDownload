# AnyDownload

[![Code Size](https://img.shields.io/github/languages/code-size/HenryLok0/AnyDownload?style=flat-square&logo=github)](https://github.com/HenryLok0/AnyDownload)
[![npm version](https://img.shields.io/npm/v/anydownload?style=flat-square)](https://www.npmjs.com/package/anydownload)

[![MIT License](https://img.shields.io/github/license/HenryLok0/AnyDownload?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/HenryLok0/AnyDownload?style=flat-square)](https://github.com/HenryLok0/AnyDownload/stargazers)

A powerful and efficient website downloader support both `Puppeteer` and `Playwright` that allows you to download entire websites with a single command. Perfect for offline browsing, archiving, or learning web development.

---

## Key Features

- **High Performance**: Fast concurrent downloads and efficient resource management
- **Dynamic Website Support**: Download modern JavaScript-heavy sites using Puppeteer or Playwright
- **Comprehensive Resource Capture**: HTML, CSS, JS, images, fonts, media, and more
- **User-Friendly Web GUI**: Configure and monitor downloads visually
- **Recursive Download**: Configurable depth for linked pages
- **Advanced Filtering**: Download only what you need
- **Authentication**: Supports login flows (form-based)
- **Resume, Proxy, Speed Limit, Sitemap, and More**

---

## Installation

```bash
# Using npm
npm install -g anydownload

# Or clone the repository
git clone https://github.com/HenryLok0/AnyDownload
cd AnyDownload
npm install
```

> **Note:** If you want to use Playwright, you may need to install browser binaries:
> ```bash
> npx playwright install
> ```

---

## Docker

You can run AnyDownload easily with Docker.

### 1. Build the Docker image

```bash
docker build -t anydownload .
```

### 2. Run the Web GUI

```bash
docker run -p 3000:3000 anydownload
```

Then visit [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Run CLI mode (with output folder mounted)

```bash
docker run --rm -v $(pwd)/output:/app/output anydownload anydownload https://example.com -o output
```

### Dockerfile Example

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["node", "web-gui.js"]
```

---

## Basic Usage

```bash
# Download a website (default: Puppeteer)
anydownload https://example.com

# Use Playwright as the browser engine
anydownload https://example.com --dynamic --browser playwright

# Or using the repository
node bin/cli.js https://example.com --browser puppeteer
node bin/cli.js https://example.com --browser playwright
```

## Web Interface

Start the web GUI for a visual download experience:

```bash
anydownload --gui
# Or
node web-gui.js
```

Then visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## Advanced Examples

### Download Full Website(About all sitemap pages)
```bash
anydownload https://example.com --browser playwright --dynamic --sitemap --recursive
```

### Download with Login
```bash
anydownload https://example.com --login-url https://example.com/login --login-form '{"#username": "username", "#password": "password"}' --login-credentials '{"username": "user", "password": "pass"}' --browser playwright
```

### Download with Custom Output
```bash
anydownload https://example.com --output mysite --browser puppeteer
```

### Download with Depth Control
```bash
anydownload https://example.com --recursive --max-depth 2 --browser playwright
```

### Download Specific Resources
```bash
anydownload https://example.com --type image --type css --browser puppeteer
```

### Dynamic Website Download
```bash
anydownload https://example.com --dynamic true --browser playwright
```

---

### AnyDownloadSupports Both Puppeteer and Playwright

AnyDownload supports **both [Puppeteer](https://pptr.dev/)** and **[Playwright](https://playwright.dev/)** as browser engines for dynamic website rendering.  
You can freely choose which engine to use with the `--browser` option.

### What's the difference between Puppeteer and Playwright?

| Feature                | Puppeteer                        | Playwright                              |
|------------------------|----------------------------------|-----------------------------------------|
| Supported Browsers     | Chromium (Chrome, Edge)          | Chromium, Firefox, WebKit (Safari)      |
| Stealth/Evasion        | Good (with plugins)              | Good, often less detectable             |
| Multi-browser Support  | Limited                          | Excellent (cross-browser)               |
| API Similarity         | Industry standard                | Very similar, but more advanced options |
| Stability              | Very stable                      | Very stable                             |
| Use Case               | Most dynamic sites               | Sites that block Puppeteer, or need Safari/Firefox support |

- **Puppeteer** is great for most dynamic websites and is widely used.
- **Playwright** is recommended if you need to handle websites that block Puppeteer, require Firefox or Safari/WebKit rendering, or need more advanced browser automation features.

**All features of AnyDownload are available in both modes!**

---

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `--output, -o` | Custom output folder | `downloaded_site` |
| `--recursive, -r` | Download linked pages | `false` |
| `--max-depth, -m` | Set recursion depth | `1` |
| `--type` | Resource types to download | `all` |
| `--dynamic` | Enable dynamic mode | `false` |
| `--verbose` | Show detailed logs | `false` |
| `--schedule` | Schedule automatic downloads | `none` |
| `--browser` | Choose browser engine (`puppeteer` or `playwright`) | `puppeteer` |
| `--concurrency` | Max concurrent downloads | `5` |
| `--delay` | Delay between requests | `1000ms` |
| `--retry` | Retry count for failed downloads | `3` |
| `--proxy` | Use proxy server | `none` |
| `--speed-limit` | Download speed limit | `0` |
| `--resume` | Enable resume download | `false` |
| `--sitemap` | Generate sitemap | `false` |
| `--timeout` | Request timeout | `30000ms` |
| `--max-file-size` | Maximum file size | `0` |
| `--retry-delay` | Retry delay | `1000ms` |
| `--validate-ssl` | SSL validation | `true` |
| `--follow-redirects` | Follow redirects | `true` |
| `--max-redirects` | Maximum redirects | `5` |
| `--keep-original-urls` | Keep original URLs | `false` |
| `--clean-urls` | Clean URLs | `false` |
| `--ignore-errors` | Ignore errors | `false` |
| `--parallel-limit` | Parallel download limit | `5` |
| `--login-url` | Login page URL | `null` |
| `--login-form` | Login form field mapping | `null` |
| `--login-credentials` | Login credentials | `null` |

---

## FAQ

### Q: Should I use Puppeteer or Playwright?
A:  
- Use **Puppeteer** for most dynamic websites (Chromium/Chrome-based).
- Use **Playwright** if you need to download sites that block Puppeteer, require Firefox/Safari/WebKit, or want more stealth/cross-browser support.

### Q: What is the easiest way to download an entire website (including all sitemap pages)?
A: Use the command `anydownload https://example.com --browser playwright --dynamic --sitemap --recursive`

It will:
- Read `sitemap_index.xml`
- Parse all sub-sitemaps

### Q: How to handle websites with login?
A: Use the `--login-url`, `--login-form`, and `--login-credentials` options. Both Puppeteer and Playwright support login automation.

### Q: Do I need to install browsers for Playwright?
A: Yes, run `npx playwright install` after installing dependencies.

### Q: Are all features available in both engines?
A: Yes! All download, filtering, login, and automation features work with both Puppeteer and Playwright.

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