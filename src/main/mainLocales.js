/** Native dialog strings for the Electron main process (mirrors renderer locales). */

const FALLBACK = 'en';

const PACK = {
    en: {
        openOutputFolderFailed: 'Open output folder failed',
        previewFailed: 'Preview failed',
        invalidOutputFolder: 'Invalid output folder',
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
        playwrightBrowserMissingDetail: '{{cmd}}\n\nUse the secondary button to copy.',
        playwrightBtnOk: 'OK',
        playwrightBtnCopy: 'Copy install command',
        chooseFolderTitle: 'Select Folder',
        chooseFileTitle: 'Select File'
    },
    'zh-TW': {
        openOutputFolderFailed: '無法開啟輸出資料夾',
        previewFailed: '伺服器預覽失敗',
        invalidOutputFolder: '無效的輸出資料夾',
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
        playwrightBrowserMissingDetail: '{{cmd}}\n\n請使用次要按鈕複製安裝指令。',
        playwrightBtnOk: '確定',
        playwrightBtnCopy: '複製安裝指令',
        chooseFolderTitle: '選擇資料夾',
        chooseFileTitle: '選擇檔案'
    },
    ja: {
        openOutputFolderFailed: '出力フォルダを開けません',
        previewFailed: 'プレビューに失敗しました',
        invalidOutputFolder: '無効な出力フォルダ',
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
        playwrightBrowserMissingDetail: '{{cmd}}\n\n別ボタンでコピーできます。',
        playwrightBtnOk: 'OK',
        playwrightBtnCopy: 'インストールコマンドをコピー',
        chooseFolderTitle: 'フォルダを選択',
        chooseFileTitle: 'ファイルを選択'
    },
    ko: {
        openOutputFolderFailed: '출력 폴더를 열 수 없습니다',
        previewFailed: '미리보기 실패',
        invalidOutputFolder: '잘못된 출력 폴더',
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
        playwrightBrowserMissingDetail: '{{cmd}}\n\n보조 버튼으로 복사하세요.',
        playwrightBtnOk: '확인',
        playwrightBtnCopy: '설치 명령 복사',
        chooseFolderTitle: '폴더 선택',
        chooseFileTitle: '파일 선택'
    }
};

function normalizeLocale(loc) {
    const s = typeof loc === 'string' ? loc.trim().replace(/_/g, '-') : '';
    if (PACK[s]) return s;
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
