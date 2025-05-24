# Website Downloader

[中文說明 (Traditional Chinese)](./README.Tc.md)

[![Code Size](https://img.shields.io/github/languages/code-size/HenryLok0/Website-Downloader?style=flat-square&logo=github)](https://github.com/HenryLok0/Website-Downloader)
[![MIT License](https://img.shields.io/github/license/HenryLok0/Website-Downloader?style=flat-square)](LICENSE)

Website Downloader is a command-line tool that lets you download an entire website—including HTML, images, CSS, JS, fonts, and media—into a local folder for offline browsing.

---

## Quick Start

### 1. Installation

Clone the repository and install dependencies:
```sh
git clone https://github.com/HenryLok0/Website-Downloader
cd Website-Downloader
npm install
```

### 2. Basic Usage

Download a website with the default settings:
```sh
node bin/cli.js <website-url>
```
Downloaded content will be saved to `downloaded_site/<host>/` by default.

---

## Web GUI (index) on Port 3000

Website Downloader also provides a simple web GUI for generating commands and directly triggering downloads from your browser.

### Start the Web GUI

```sh
node web-gui.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

- You can fill in all options in the web form.
- Click Start Download to trigger the download directly from the browser.
- The generated command and download status will be shown on the page.

---

## Common Use Cases

- **Download a full website:**
  ```sh
  node bin/cli.js https://example.com
  ```

- **Specify output folder:**
  ```sh
  node bin/cli.js https://example.com --output mysite
  ```

- **Recursively download same-domain pages (depth 2):**
  ```sh
  node bin/cli.js https://example.com --recursive --max-depth 2
  ```

- **Download only images and CSS:**
  ```sh
  node bin/cli.js https://example.com --type image --type css
  ```

- **Use dynamic mode for JavaScript-heavy sites:**
  ```sh
  node bin/cli.js https://example.com --dynamic true
  ```

- **Show detailed logs:**
  ```sh
  node bin/cli.js https://example.com --verbose
  ```

---

## How to Choose the Best Download Mode

- **Static sites:** Default mode is usually sufficient.
- **Dynamic sites (Single Page Apps, content loaded by JavaScript):** Use `--dynamic true` for best results.

You can test which mode works best for your site by running:
```sh
node bin/cli.js <website-url> --test-mode
```

---

## Main Options

| Option                | Description                                                        |
|-----------------------|--------------------------------------------------------------------|
| `--output, -o`        | Set custom output folder                                           |
| `--recursive, -r`     | Recursively download same-domain pages                             |
| `--max-depth, -m`     | Set recursion depth (default: 1)                                   |
| `--type`              | Download only specific resource types (image, css, js, html, media, all) |
| `--dynamic`           | Use browser rendering for dynamic sites                            |
| `--headless`          | Use headless browser                                               |
| `--user-agent, -u`    | Set custom User-Agent                                              |
| `--cookie`            | Send custom Cookie header                                          |
| `--delay, -d`         | Delay between downloads in ms (default: 1000)                      |
| `--concurrency`       | Set max concurrent downloads (default: 5)                          |
| `--verbose`           | Show detailed logs                                                 |
| `--open`              | Auto-open homepage after download                                  |

For a full list of options, see the section below.

---

## Interactive Controls

During download, you can:
- Press `p` to pause
- Press `r` to resume
- Press `c` to cancel

---

## Full Option List

- `--output, -o <folder>`  Set custom output folder
- `--recursive, -r`     Recursively download same-domain pages
- `--max-depth, -m <n>`   Set recursion depth (default: 1)
- `--delay, -d <ms>`     Delay between downloads in ms (default: 1000)
- `--user-agent, -u <ua>`  Set custom User-Agent
- `--cookie <cookie>`    Send custom Cookie header
- `--ignore-robots`     Ignore robots.txt restrictions
- `--verbose`        Show detailed logs
- `--retry <n>`       Retry count for failed downloads (default: 3)
- `--type <type>`      Download only specific resource types (`image`, `css`, `js`, `html`, `media`, `all`)
- `--open`          Auto-open homepage after download
- `--concurrency <n>`    Set max concurrent downloads (default: 5)
- `--filter <regex>`     Filter resource URLs with regex
- `--glob <pattern>`     Filter resource URLs with glob pattern
- `--mimetype <type>`    Filter by MIME type (e.g. image/png)
- `--min-size <bytes>`    Filter resources by minimum file size
- `--max-size <bytes>`    Filter resources by maximum file size
- `--whitelist <pattern>`  Whitelist resource URLs (comma-separated)
- `--blacklist <pattern>`  Blacklist resource URLs (comma-separated)
- `--headless`        Use headless browser for dynamic sites
- `--browser <type>`    Choose browser engine (`puppeteer` or `playwright`)
- `--proxy <url>`      Download via HTTP/SOCKS proxy or Tor
- `--auth-user <user>`    HTTP basic auth username
- `--auth-pass <pass>`    HTTP basic auth password
- `--login-url <url>`    Login form URL for session-based authentication
- `--login-form <json>`   Login form data as JSON string
- `--sitemap`        Enable sitemap.xml parsing for batch download
- `--schedule <cron>`    Schedule automatic downloads (cron syntax)
- `--gui`          Launch web GUI instead of CLI

---

## API Usage

You can use Website Downloader as a Node.js module:

```js
const { Downloader } = require('./src/downloader');
const downloader = new Downloader({ outputDir: 'myfolder', concurrency: 3 });
await downloader.downloadWebsite('https://example.com');
```

---

## Docker Usage

To run in Docker:

```sh
docker build -t website-downloader .
docker run -v ${PWD}/downloaded_site:/app/downloaded_site website-downloader node bin/cli.js https://example.com
```

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Support

If you have questions or need help, please open an issue on GitHub.

Thank you to all contributors and the open-source community for your support.