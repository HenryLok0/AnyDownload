import React from 'react';
import { useTranslation } from 'react-i18next';

export default function StatusBar({ isRunning, progress, runningTotalTasks = 0 }) {
  const { t } = useTranslation();

  const pct = progress?.effectivePercent != null ? progress.effectivePercent : progress?.percent;

  // Injected by Vite build (see vite.config.js)
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';

  return (
    <div className="min-h-[22px] py-px bg-[#007acc] text-white flex items-center px-2 text-[12px] shrink-0 justify-between relative gap-2">
      <div className="flex items-center gap-2 z-10 min-w-0 flex-wrap">
        <span className="whitespace-nowrap">
          {isRunning ? t('statusBar.engineRunning') : t('statusBar.ready')}
          {isRunning && runningTotalTasks > 0 && (
            <>
              {' '}
              ({t('statusBar.runningTasksCount', { count: runningTotalTasks })})
            </>
          )}
        </span>
        {isRunning && (
          <>
            <span className="opacity-75 hidden sm:inline">|</span>
            <span className="whitespace-nowrap">
              {t('statusBar.files')}: {progress.success} / {progress.total}
            </span>
          </>
        )}
        {progress?.showMultiDownloadsHint && (
          <>
            <span className="opacity-75 hidden sm:inline">|</span>
            <span
              className="opacity-95 text-[11px] truncate max-w-[min(40vw,420px)]"
              title={t('statusBar.multiDownloadProgressHintDetail')}
            >
              {t('statusBar.multiDownloadProgressHint')}
            </span>
          </>
        )}
      </div>

      {isRunning && pct != null && (
        <div
          className="absolute left-0 top-0 bottom-0 bg-[#005a9e] opacity-50 z-0 transition-all duration-300 pointer-events-none"
          style={{ width: `${pct}%` }}
        />
      )}

      <div className="flex items-center gap-3 z-10 shrink-0">
        {isRunning && pct != null && (
          <span className="font-bold whitespace-nowrap" title={progress?.showMultiDownloadsHint ? t('statusBar.averageAcrossDownloads') : undefined}>
            {pct}%
          </span>
        )}
        {progress.bytes > 0 && (
          <span className="whitespace-nowrap" title={t('statusBar.liveBytesDisclaimer')}>
            {(progress.bytes / 1024 / 1024).toFixed(2)} MB
          </span>
        )}
        {appVersion ? (
          <span className="whitespace-nowrap opacity-90" title={t('statusBar.appVersionTitle')}>
            {t('statusBar.appVersion', { version: appVersion })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
