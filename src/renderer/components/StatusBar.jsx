import React from 'react';
import { useTranslation } from 'react-i18next';

export default function StatusBar({ isRunning, progress }) {
  const { t } = useTranslation();

  return (
    <div className="h-[22px] bg-[#007acc] text-white flex items-center px-2 text-[12px] shrink-0 justify-between relative">
      <div className="flex items-center gap-4 z-10">
        <span>{isRunning ? t('statusBar.engineRunning') : t('statusBar.ready')}</span>
        {isRunning && (
          <>
            <span className="opacity-75">|</span>
            <span>{t('statusBar.files')}: {progress.success} / {progress.total}</span>
          </>
        )}
      </div>
      
      {/* Background Progress Bar */}
      {isRunning && progress.percent != null && (
        <div 
          className="absolute left-0 top-0 bottom-0 bg-[#005a9e] opacity-50 z-0 transition-all duration-300"
          style={{ width: `${progress.percent}%` }}
        />
      )}
      
      <div className="flex items-center gap-4 z-10">
        {isRunning && progress.percent != null && (
          <span className="font-bold">{progress.percent}%</span>
        )}
        {progress.bytes > 0 && <span>{(progress.bytes / 1024 / 1024).toFixed(2)} MB</span>}
        <span>UTF-8</span>
      </div>
    </div>
  );
}
