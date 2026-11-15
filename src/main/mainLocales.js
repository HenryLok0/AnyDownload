/** Native dialog strings for the Electron main process (mirrors renderer locales). */

const FALLBACK = 'en';

const PACK = {
    en: {
        openOutputFolderFailed: 'Open output folder failed',
        previewFailed: 'Preview failed',
        invalidOutputFolder: 'Invalid output folder',
        archiveInvalidFolder: 'Cannot use this URL as an archive folder.',
        archiveEntryMissing: 'The entry page was not saved, so the archive cannot be replaced.',
        archiveDownloadIncomplete: 'Could not replace the archive because {{count}} resource(s) failed to download.',
        archiveTargetNotDirectory: 'Cannot replace the path “{{path}}” as an archive folder.',
        archiveBackupRetained: 'Could not finish replacing the archive. The previous archive is saved at “{{backup}}”.',
        outputFolderOutsideRoot: 'Output folder must stay under: {{root}}',
        folderNotFound: 'Folder not found: {{root}}',
        exportTasksZipTitle: 'Export Tasks as ZIP',
        exportZipFilterName: 'ZIP Archives',
        deleteTasksTitle: 'Delete Tasks',
        deleteTasksMessage: 'Are you sure you want to delete {{count}} task(s)?',
        deleteTasksDetail: 'You can choose to also delete the downloaded files from your disk.',
        btnCancel: 'Cancel',
        btnRemoveListOnly: 'Remove from List Only',
        btnDeleteFilesAndRemove: 'Delete Files and Remove',
        playwrightBrowserMissingTitle: 'Playwright browser missing',
        playwrightBrowserMissingMessage: 'Chromium for downloads was not found.',
        playwrightBrowserMissingDetail: 'The next button installs the Chromium shipped with AnyDownload.',
        playwrightBtnOk: 'OK',
        playwrightBtnInstall: 'Install browser',
        playwrightInstallDone: 'Chromium installed.',
        chooseFolderTitle: 'Select Folder',
        chooseFileTitle: 'Select File',
        textFilesFilter: 'Text Files',
        allFilesFilter: 'All Files'
    },
    'zh-CN': {
        openOutputFolderFailed: '无法打开输出文件夹',
        previewFailed: '预览失败',
        invalidOutputFolder: '输出文件夹无效',
        archiveInvalidFolder: '无法用此网址作为存档文件夹。',
        archiveEntryMissing: '入口页面未保存，无法覆盖存档。',
        archiveDownloadIncomplete: '有 {{count}} 个资源下载失败，无法覆盖存档。',
        archiveTargetNotDirectory: '路径「{{path}}」无法作为存档文件夹替换。',
        archiveBackupRetained: '覆盖未完成。旧存档已保留在「{{backup}}」。',
        outputFolderOutsideRoot: '输出文件夹必须位于以下目录内：{{root}}',
        folderNotFound: '找不到文件夹：{{root}}',
        exportTasksZipTitle: '将任务导出为 ZIP',
        exportZipFilterName: 'ZIP 压缩包',
        deleteTasksTitle: '删除任务',
        deleteTasksMessage: '确定要删除 {{count}} 个任务吗？',
        deleteTasksDetail: '你也可以同时删除保存在本地的下载文件。',
        btnCancel: '取消',
        btnRemoveListOnly: '仅从列表中移除',
        btnDeleteFilesAndRemove: '删除文件并移除任务',
        playwrightBrowserMissingTitle: '缺少 Playwright 浏览器',
        playwrightBrowserMissingMessage: '找不到下载页面所需的 Chromium 浏览器。',
        playwrightBrowserMissingDetail: '点击“安装浏览器”可安装 AnyDownload 所需的 Chromium。',
        playwrightBtnOk: '确定',
        playwrightBtnInstall: '安装浏览器',
        playwrightInstallDone: 'Chromium 已安装。',
        chooseFolderTitle: '选择文件夹',
        chooseFileTitle: '选择文件',
        textFilesFilter: '文本文件',
        allFilesFilter: '所有文件'
    },
    'zh-TW': {
        openOutputFolderFailed: '無法開啟輸出資料夾',
        previewFailed: '伺服器預覽失敗',
        invalidOutputFolder: '無效的輸出資料夾',
        archiveInvalidFolder: '無法使用此網址作為存檔資料夾。',
        archiveEntryMissing: '入口頁面未儲存，無法覆寫存檔。',
        archiveDownloadIncomplete: '有 {{count}} 個資源下載失敗，無法覆寫存檔。',
        archiveTargetNotDirectory: '無法將路徑「{{path}}」當作存檔資料夾取代。',
        archiveBackupRetained: '覆寫未完成。舊存檔已保留在「{{backup}}」。',
        exportTasksZipTitle: '匯出任務為 ZIP',
        exportZipFilterName: 'ZIP 封存',
        deleteTasksTitle: '刪除任務',
        deleteTasksMessage: '確定要刪除 {{count}} 個任務嗎？',
        deleteTasksDetail: '您可以選擇是否一併刪除硬碟上的已下載檔案。',
        btnCancel: '取消',
        btnRemoveListOnly: '僅從列表移除',
        btnDeleteFilesAndRemove: '刪除檔案並移除',
        playwrightBrowserMissingTitle: 'Playwright 缺少瀏覽器',
        playwrightBrowserMissingMessage: '找不到用於下載的 Chromium。',
        playwrightBrowserMissingDetail: '下一個按鈕會安裝這個程式自帶的 Chromium。',
        playwrightBtnOk: '確定',
        playwrightBtnInstall: '安裝瀏覽器',
        playwrightInstallDone: 'Chromium 已安裝。',
        chooseFolderTitle: '選擇資料夾',
        chooseFileTitle: '選擇檔案'
    },
    ja: {
        openOutputFolderFailed: '出力フォルダを開けません',
        previewFailed: 'プレビューに失敗しました',
        invalidOutputFolder: '無効な出力フォルダ',
        archiveInvalidFolder: 'この URL をアーカイブフォルダとして使用できません。',
        archiveEntryMissing: '最初のページが保存されなかったため、アーカイブを上書きできません。',
        archiveDownloadIncomplete: '{{count}} 件のリソースのダウンロードに失敗したため、アーカイブを上書きできません。',
        archiveTargetNotDirectory: '「{{path}}」はアーカイブフォルダとして置き換えられません。',
        archiveBackupRetained: '上書きを完了できませんでした。以前のアーカイブは「{{backup}}」に残っています。',
        exportTasksZipTitle: 'タスクをZIPにエクスポート',
        exportZipFilterName: 'ZIPアーカイブ',
        deleteTasksTitle: 'タスクの削除',
        deleteTasksMessage: 'タスクを {{count}} 件削除しますか？',
        deleteTasksDetail: 'ダウンロードしたファイルもディスクから削除できます。',
        btnCancel: 'キャンセル',
        btnRemoveListOnly: 'リストからのみ削除',
        btnDeleteFilesAndRemove: 'ファイルも削除して一覧から削除',
        playwrightBrowserMissingTitle: 'Playwrightのブラウザがありません',
        playwrightBrowserMissingMessage: 'ダウンロード用のChromiumが見つかりません。',
        playwrightBrowserMissingDetail: '次のボタンで、このアプリに同梱された Chromium をインストールします。',
        playwrightBtnOk: 'OK',
        playwrightBtnInstall: 'ブラウザをインストール',
        playwrightInstallDone: 'Chromium をインストールしました。',
        chooseFolderTitle: 'フォルダを選択',
        chooseFileTitle: 'ファイルを選択'
    },
    ko: {
        openOutputFolderFailed: '출력 폴더를 열 수 없습니다',
        previewFailed: '미리보기 실패',
        invalidOutputFolder: '잘못된 출력 폴더',
        archiveInvalidFolder: '이 URL을 보관 폴더로 사용할 수 없습니다.',
        archiveEntryMissing: '시작 페이지를 저장하지 못해 보관본을 덮어쓸 수 없습니다.',
        archiveDownloadIncomplete: '리소스 {{count}}개를 다운로드하지 못해 보관본을 덮어쓸 수 없습니다.',
        archiveTargetNotDirectory: '‘{{path}}’ 경로를 보관 폴더로 교체할 수 없습니다.',
        archiveBackupRetained: '덮어쓰기를 완료하지 못했습니다. 이전 보관본은 ‘{{backup}}’에 남아 있습니다.',
        exportTasksZipTitle: '작업을 ZIP으로 내보내기',
        exportZipFilterName: 'ZIP 파일',
        deleteTasksTitle: '작업 삭제',
        deleteTasksMessage: '작업 {{count}}개를 삭제하시겠습니까?',
        deleteTasksDetail: '디스크의 다운로드 파일을 함께 삭제할 수 있습니다.',
        btnCancel: '취소',
        btnRemoveListOnly: '목록에서만 제거',
        btnDeleteFilesAndRemove: '파일 삭제 후 목록에서 제거',
        playwrightBrowserMissingTitle: 'Playwright 브라우저 없음',
        playwrightBrowserMissingMessage: '다운로드용 Chromium을 찾을 수 없습니다.',
        playwrightBrowserMissingDetail: '다음 버튼은 이 앱에 포함된 Chromium을 설치합니다.',
        playwrightBtnOk: '확인',
        playwrightBtnInstall: '브라우저 설치',
        playwrightInstallDone: 'Chromium을 설치했습니다.',
        chooseFolderTitle: '폴더 선택',
        chooseFileTitle: '파일 선택'
    }
};

function normalizeLocale(loc) {
    const s = typeof loc === 'string' ? loc.trim().replace(/_/g, '-') : '';
    if (PACK[s]) return s;
    if (/^zh-(cn|hans)(-|$)/i.test(s)) return 'zh-CN';
    if (/^zh-/i.test(s)) return 'zh-TW';
    const base = String(s.split('-')[0] || FALLBACK).toLowerCase();
    if (PACK[base]) return base;
    if (base === 'zh') return 'zh-TW';
    return FALLBACK;
}

function interpolate(str, vars) {
    let out = str;
    for (const [k, v] of Object.entries(vars || {})) {
        out = out.split(`{{${k}}}`).join(String(v));
    }
    return out;
}

let currentLocale = FALLBACK;

function setMainLocale(loc) {
    currentLocale = normalizeLocale(loc);
}

function getMainLocale() {
    return currentLocale;
}

/** @param {string} key @param {Record<string, string | number>?} vars */
function mainT(key, vars) {
    const b = PACK[currentLocale] || PACK[FALLBACK];
    const fb = PACK[FALLBACK];
    let s = Object.prototype.hasOwnProperty.call(b, key) ? b[key] : fb[key];
    if (vars) s = interpolate(s, vars);
    return s;
}

module.exports = {
    setMainLocale,
    getMainLocale,
    normalizeLocale,
    mainT,
    PACK,
    FALLBACK
};
