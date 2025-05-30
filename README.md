# AnyDownload

[![Code Size](https://img.shields.io/github/languages/code-size/HenryLok0/AnyDownload?style=flat-square&logo=github)](https://github.com/HenryLok0/AnyDownload)
[![MIT License](https://img.shields.io/github/license/HenryLok0/AnyDownload?style=flat-square)](LICENSE)

> Download entire websites with a single command! Perfect for offline browsing, archiving, or learning web development.

## Features

- **Fast & Efficient**: Downloads websites quickly with concurrent connections
- **Smart Detection**: Automatically detects static and dynamic websites
- **Complete Downloads**: Grabs all resources (HTML, CSS, JS, images, fonts, media)
- **Web GUI**: User-friendly interface for easy downloads
- **Recursive Download**: Option to download linked pages
- **Customizable**: Multiple options for fine-tuning downloads
- **Mobile-Friendly**: Downloads responsive websites perfectly

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/HenryLok0/AnyDownload

# Navigate to project directory
cd AnyDownload

# Install dependencies
npm install
```

### Basic Usage

```bash
# Download a website
node bin/cli.js https://example.com
```

## Web Interface

Start the web GUI for a visual download experience:

```bash
node web-gui.js
```

Then visit [http://localhost:3000](http://localhost:3000) in your browser.

## Common Examples

### Download a Full Website
```bash
node bin/cli.js https://example.com
```

### Download with Custom Output
```bash
node bin/cli.js https://example.com --output mysite
```

### Download with Depth Control
```bash
node bin/cli.js https://example.com --recursive --max-depth 2
```

### Download Specific Resources
```bash
# Download only images and CSS
node bin/cli.js https://example.com --type image --type css
```

### Dynamic Website Download
```bash
node bin/cli.js https://example.com --dynamic true
```

## Key Options

| Option | Description | Example |
|--------|-------------|---------|
| `--output, -o` | Custom output folder | `--output mysite` |
| `--recursive, -r` | Download linked pages | `--recursive` |
| `--max-depth, -m` | Set recursion depth | `--max-depth 2` |
| `--type` | Resource types to download | `--type image --type css` |
| `--dynamic` | Enable dynamic mode | `--dynamic true` |
| `--verbose` | Show detailed logs | `--verbose` |

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

## Interactive Controls

During download:
- Press `p` to pause
- Press `r` to resume
- Press `c` to cancel

## Docker Support

```bash
# Build the image
docker build -t AnyDownload .

# Run the container
docker run -v ${PWD}/downloaded_site:/app/downloaded_site AnyDownload node bin/cli.js https://example.com
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

Need help? Open an issue on GitHub or reach out to our community.