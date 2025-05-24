# 網站下載器 Website Downloader

[English README](./README.md)

[![Code Size](https://img.shields.io/github/languages/code-size/HenryLok0/Website-Downloader?style=flat-square&logo=github)](https://github.com/HenryLok0/Website-Downloader)
[![MIT License](https://img.shields.io/github/license/HenryLok0/Website-Downloader?style=flat-square)](LICENSE)

Website Downloader 是一個命令列工具，可將整個網站（包含 HTML、圖片、CSS、JS、字型、媒體等）下載到本地資料夾，方便離線瀏覽。

---

## 快速開始

### 1. 安裝

複製本專案並安裝依賴：
```sh
git clone https://github.com/HenryLok0/Website-Downloader
cd Website-Downloader
npm install
```

### 2. 基本用法

使用預設設定下載網站：
```sh
node bin/cli.js <網站網址>
```
下載內容預設儲存於 `downloaded_site/<host>/`。

---

## Web GUI（網頁介面）3000 埠

Website Downloader 也提供簡易網頁 GUI，可在瀏覽器中產生命令並直接觸發下載。

### 啟動 Web GUI

```sh
node web-gui.js
```

然後在瀏覽器開啟 [http://localhost:3000](http://localhost:3000)。

- 可在表單中填寫所有選項。
- 點擊「開始下載」即可直接從瀏覽器觸發下載。
- 產生的命令與下載狀態會顯示於頁面上。

---

## 常見用法

- **下載整個網站：**
  ```sh
  node bin/cli.js https://example.com
  ```

- **指定輸出資料夾：**
  ```sh
  node bin/cli.js https://example.com --output mysite
  ```

- **遞迴下載同網域頁面（深度 2）：**
  ```sh
  node bin/cli.js https://example.com --recursive --max-depth 2
  ```

- **只下載圖片與 CSS：**
  ```sh
  node bin/cli.js https://example.com --type image --type css
  ```

- **JavaScript 網站用動態模式：**
  ```sh
  node bin/cli.js https://example.com --dynamic true
  ```

- **顯示詳細日誌：**
  ```sh
  node bin/cli.js https://example.com --verbose
  ```

---

## 如何選擇最佳下載模式

- **靜態網站：** 預設模式通常足夠。
- **動態網站（SPA、內容由 JS 載入）：** 請加上 `--dynamic true` 效果最佳。

你也可以用下列指令測試最佳模式：
```sh
node bin/cli.js <網站網址> --test-mode
```

---

## 主要選項

| 選項                    | 說明                                                         |
|-------------------------|--------------------------------------------------------------|
| `--output, -o`          | 指定輸出資料夾                                               |
| `--recursive, -r`       | 遞迴下載同網域頁面                                           |
| `--max-depth, -m`       | 設定遞迴深度（預設：1）                                      |
| `--type`                | 只下載特定資源類型（image, css, js, html, media, all）       |
| `--dynamic`             | 動態網站用瀏覽器渲染                                         |
| `--headless`            | 使用無頭瀏覽器                                               |
| `--user-agent, -u`      | 自訂 User-Agent                                              |
| `--cookie`              | 傳送自訂 Cookie 標頭                                         |
| `--delay, -d`           | 每次下載延遲（預設：1000ms）                                 |
| `--concurrency`         | 最大同時下載數（預設：5）                                    |
| `--verbose`             | 顯示詳細日誌                                                 |
| `--open`                | 下載後自動開啟首頁                                           |

完整選項請見下方。

---

## 互動控制

下載過程中可：
- 按 `p` 暫停
- 按 `r` 繼續
- 按 `c` 取消

---

## 完整選項列表

- `--output, -o <folder>`  自訂輸出資料夾
- `--recursive, -r`     遞迴下載同網域頁面
- `--max-depth, -m <n>`   設定遞迴深度（預設：1）
- `--delay, -d <ms>`     每次下載延遲毫秒數（預設：1000）
- `--user-agent, -u <ua>`  自訂 User-Agent
- `--cookie <cookie>`    自訂 Cookie 標頭
- `--ignore-robots`     忽略 robots.txt 限制
- `--verbose`        顯示詳細日誌
- `--retry <n>`       失敗重試次數（預設：3）
- `--type <type>`      只下載特定資源類型（image, css, js, html, media, all）
- `--open`          下載後自動開啟首頁
- `--concurrency <n>`    最大同時下載數（預設：5）
- `--filter <regex>`     以正則過濾資源網址
- `--glob <pattern>`     以 glob 樣式過濾資源網址
- `--mimetype <type>`    以 MIME 類型過濾（如 image/png）
- `--min-size <bytes>`    最小檔案大小過濾
- `--max-size <bytes>`    最大檔案大小過濾
- `--whitelist <pattern>`  白名單資源網址（逗號分隔）
- `--blacklist <pattern>`  黑名單資源網址（逗號分隔）
- `--headless`        動態網站使用無頭瀏覽器
- `--browser <type>`    選擇瀏覽器引擎（puppeteer 或 playwright）
- `--proxy <url>`      透過 HTTP/SOCKS 代理或 Tor 下載
- `--auth-user <user>`    HTTP 基本認證帳號
- `--auth-pass <pass>`    HTTP 基本認證密碼
- `--login-url <url>`    表單登入網址（需 session）
- `--login-form <json>`   登入表單資料（JSON 字串）
- `--sitemap`        啟用 sitemap.xml 批次下載
- `--schedule <cron>`    排程自動下載（cron 語法）
- `--gui`          啟動網頁 GUI（取代 CLI）

---

## API 用法

你可以在 Node.js 專案中這樣使用 Website Downloader：

```js
const { Downloader } = require('./src/downloader');
const downloader = new Downloader({ outputDir: 'myfolder', concurrency: 3 });
await downloader.downloadWebsite('https://example.com');
```

---

## Docker 用法

在 Docker 中執行：

```sh
docker build -t website-downloader .
docker run -v ${PWD}/downloaded_site:/app/downloaded_site website-downloader node bin/cli.js https://example.com
```

---

## 貢獻

歡迎貢獻！請參閱 [CONTRIBUTING.md](CONTRIBUTING.md) 以了解詳細規範。

---

## 授權

本專案採用 MIT 授權，詳見 [LICENSE](LICENSE)。

---

## 支援

如有問題或需要協助，請在 GitHub 上開 issue。

感謝所有貢獻者與開源社群的支持！