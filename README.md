# Website Downloader

![npm](https://img.shields.io/npm/v/website-downloader-cli?style=flat-square)
[![MIT License](https://img.shields.io/github/license/HenryLok0/Website-Downloader?color=blue)](https://github.com/HenryLok0/Website-Downloader/blob/main/LICENSE)
![node](https://img.shields.io/node/v/website-downloader-cli?style=flat-square)

A powerful command-line tool to download an entire website—including HTML, images, CSS, JS, fonts, and media—into a local folder for offline browsing.

---

## Features

- Full Website Download: Download all HTML, CSS, JS, images, fonts, videos, and audio files for offline use.
- Recursive Download: Recursively download same-domain pages with configurable depth.
- Static/Dynamic Detection: Automatically detects if a site is static or dynamic (uses browser rendering for dynamic sites).
- robots.txt Support: Respects robots.txt by default, or can ignore it with a flag.
- Custom User-Agent & Cookie: Set your own User-Agent and Cookie headers for authentication or bypassing restrictions.
- Progress Bar & Statistics: Shows a real-time progress bar with current file, speed, ETA, and a summary (success, fail, total size, elapsed time).
- Resource Path Rewriting: Automatically rewrites all resource paths in HTML for true offline browsing.
- Retry & Error Reporting: Automatically retries failed downloads and displays a detailed failed resource list with error reasons.
- Disk Space Check: Checks disk space before downloading to avoid incomplete downloads.
- Custom Output Folder: Save downloads to a folder of your choice.
- Verbose Logging: Enable verbose mode for detailed logs and error tracking.
- Auto-Open: Optionally auto-open the downloaded homepage in your browser after completion.
- MIME Type Detection: Detects MIME type and corrects file extensions automatically.
- Duplicate & Invalid Resource Filtering: Prevents duplicate downloads and skips invalid resources.
- Gzip/Deflate Support: Supports compressed transfers for faster downloads.
- Resource Type Filtering: Download only specific resource types (images, CSS, JS, HTML, media).
- HTTP/2 & HTTP/3 Support: Uses modern protocols for faster and more reliable downloads.
- Interactive CLI: If parameters are missing, prompts you interactively for input.
- Config File Support: Supports `.websitedownloaderrc` for default CLI options.
- Download Log Output: Outputs a detailed download log for troubleshooting and auditing.

---

## Installation

```bash
git clone https://github.com/HenryLok0/Website-Downloader
cd Website-Downloader
npm install
```

---

## Usage

```bash
node bin/cli.js <website-url> [options]
```

Downloaded content will be saved to `downloaded_site/<host>/` by default, or to a custom folder if you use the `--output` option.

### Common Options

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

### Example

```bash
node bin/cli.js https://example.com --recursive --max-depth 2 --output mysite --type image --verbose
```

---

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Inspired by the need for sustainable web development practices.
- Thanks to the contributors and the open-source community for their support.