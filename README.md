# AnyDownload

[![Code Size](https://img.shields.io/github/languages/code-size/HenryLok0/AnyDownload?style=flat-square&logo=github)](https://github.com/HenryLok0/AnyDownload)
[![MIT License](https://img.shields.io/github/license/HenryLok0/AnyDownload?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/HenryLok0/AnyDownload?style=flat-square)](https://github.com/HenryLok0/AnyDownload/stargazers)

A powerful and efficient website downloader that allows you to download entire websites with a single command. Perfect for offline browsing, archiving, or learning web development.

## Key Features

### Core Features
- **High Performance**: Optimized for speed with concurrent connections and efficient resource management
- **Intelligent Detection**: Advanced algorithms to detect and handle both static and dynamic websites
- **Comprehensive Downloads**: Captures all website resources including HTML, CSS, JavaScript, images, fonts, and media files
- **User-Friendly Interface**: Modern web GUI for easy configuration and monitoring
- **Recursive Download**: Configurable depth control for linked pages
- **Customization Options**: Extensive configuration options for fine-tuning downloads
- **Mobile Compatibility**: Perfect handling of responsive websites
- **Multi-Language Support**: Built-in support for English and Traditional Chinese
- **Download History**: Comprehensive tracking of download history
- **Scheduled Downloads**: Automated downloads with cron job support
- **Browser Engine Support**: Multiple browser engine options (Puppeteer, Playwright)
- **Real-time Progress**: Detailed progress tracking and visualization
- **Resource Filtering**: Advanced filtering capabilities for resources
- **Authentication Support**: Multiple authentication methods

### Advanced Features
- **Resume Download**: Support for resuming interrupted downloads
- **Speed Control**: Configurable download speed limits
- **Proxy Support**: Built-in proxy server support
- **Sitemap Generation**: Automatic sitemap.xml generation
- **Resource Validation**: SSL and content validation
- **URL Cleaning**: Advanced URL cleaning and normalization
- **Parallel Downloads**: Configurable parallel download limits
- **Timeout Control**: Customizable request timeouts
- **File Size Limits**: Maximum file size restrictions
- **Retry Mechanism**: Configurable retry delays and counts
- **Redirect Handling**: Advanced redirect following options
- **Error Handling**: Flexible error handling strategies

## Performance Comparison

| Feature | AnyDownload | wget | HTTrack |
|---------|------------|------|---------|
| Speed | Fast | Medium | Slow |
| Dynamic Sites | Yes | No | Limited |
| GUI | Yes | No | Yes |
| Concurrent Downloads | Yes | Limited | Yes |
| Resource Filtering | Advanced | Basic | Basic |
| Browser Support | Multiple | None | None |
| Resume Support | Yes | Yes | Limited |
| Proxy Support | Yes | Yes | Limited |
| Sitemap Generation | Yes | No | Yes |
| Speed Control | Yes | Yes | No |
| Authentication | Multiple | Basic | Basic |

## Installation

```bash
# Using npm
npm install -g anydownload

# Or clone the repository
git clone https://github.com/HenryLok0/AnyDownload
cd AnyDownload
npm install
```

## Basic Usage

```bash
# Download a website
anydownload https://example.com

# Or using the repository
node bin/cli.js https://example.com
```

## Web Interface

Start the web GUI for a visual download experience:

```bash
anydownload --gui
# Or
node web-gui.js
```

Then visit [http://localhost:3000](http://localhost:3000) in your browser.

## Use Cases

### For Developers
- Website structure analysis and learning
- Offline documentation creation
- Website performance testing
- Web development learning through site analysis
- Local development environment setup
- Website migration preparation
- Content archiving and backup
- Testing and debugging

### For Content Creators
- Web content archiving
- Offline backup creation
- Research material collection
- Reference material organization
- Content migration
- Media asset collection
- Website mirroring
- Content preservation

### For Businesses
- Website backup creation
- Competitor website analysis
- Company documentation archiving
- Offline web application creation
- Website migration preparation
- Content auditing
- Compliance documentation
- Knowledge base creation

## Advanced Examples

### Download with Login
```bash
# Download a website that requires login
anydownload https://example.com --login-url https://example.com/login --login-form '{"#username": "username", "#password": "password"}' --login-credentials '{"username": "user", "password": "pass"}'
```

### Download with Custom Output
```bash
anydownload https://example.com --output mysite
```

### Download with Depth Control
```bash
anydownload https://example.com --recursive --max-depth 2
```

### Download Specific Resources
```bash
# Download only images and CSS
anydownload https://example.com --type image --type css
```

### Dynamic Website Download
```bash
anydownload https://example.com --dynamic true
```

### Scheduled Downloads
```bash
# Download every day at 2 AM
anydownload https://example.com --schedule "0 2 * * *"
```

### Resume Interrupted Download
```bash
anydownload https://example.com --resume
```

### Speed Limited Download
```bash
anydownload https://example.com --speed-limit 1000
```

### Proxy Download
```bash
anydownload https://example.com --proxy http://proxy.example.com:8080
```

### Generate Sitemap
```bash
anydownload https://example.com --sitemap
```

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
| `--browser` | Choose browser engine | `puppeteer` |
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

## FAQ

### Q: How to handle websites with login?
A: Use the `--login-url` and `--login-form` options to provide login credentials.

### Q: How to download a specific section of a website?
A: Use the `--filter` option with a regular expression to match specific URLs.

### Q: How to handle rate limiting?
A: Use the `--delay` option to add delays between requests.

### Q: How to download large websites?
A: Use the `--max-depth` and `--type` options to limit the scope of download.

### Q: How to resume interrupted downloads?
A: Use the `--resume` option to continue from where the download was interrupted.

### Q: How to limit download speed?
A: Use the `--speed-limit` option to set a maximum download speed in KB/s.

### Q: How to use a proxy server?
A: Use the `--proxy` option to specify a proxy server URL.

### Q: How to generate a sitemap?
A: Use the `--sitemap` option to generate a sitemap.xml file.

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