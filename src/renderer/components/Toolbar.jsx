import React from 'react';
import { Play, Square, Settings, FileBox, FolderOpen, Moon, Sun, Globe, Trash2, MonitorPlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Toolbar({
  isRunning,
  onStart,
  onStop,
  onExport,
  onDelete,
  hasSelection,
  isDark,
  onToggleDark,
  mode,
  onOfflinePreview
}) {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  return (
    <div className="h-10 bg-[var(--bg-header)] border-b border-[var(--border-color)] flex items-center px-2 gap-1 shrink-0">
      <ToolbarButton 
        icon={<Play size={16} className={isRunning ? 'text-[var(--text-placeholder)]' : 'text-green-600'} />} 
        label={t('toolbar.start')} 
        onClick={onStart}
        disabled={isRunning}
      />
      <ToolbarButton 
        icon={<Square size={16} className={!isRunning ? 'text-[var(--text-placeholder)]' : 'text-red-600'} />} 
        label={t('toolbar.stop')} 
        onClick={onStop}
        disabled={!isRunning}
      />

      {mode === 'download' && (
        <ToolbarButton 
          icon={<MonitorPlay size={16} className="text-teal-600" />} 
          label={t('toolbar.offlinePreview')} 
          onClick={onOfflinePreview}
          disabled={!window.electronAPI?.startOfflinePreview}
        />
      )}
      
      <div className="w-px h-6 bg-[var(--border-color)] mx-1" />
      
      <ToolbarButton 
        icon={<FileBox size={16} className={hasSelection ? 'text-blue-600' : 'text-[var(--text-placeholder)]'} />} 
        label={t('toolbar.export')} 
        onClick={onExport} 
        disabled={!hasSelection}
      />
      <ToolbarButton 
        icon={<Trash2 size={16} className={hasSelection ? 'text-red-600' : 'text-[var(--text-placeholder)]'} />} 
        label={t('toolbar.delete', 'Delete')} 
        onClick={onDelete} 
        disabled={!hasSelection}
      />
      
      <div className="flex-1" />
      
      <div className="flex items-center gap-1 px-2 text-[var(--text-muted)]">
        <Globe size={14} />
        <select 
          className="bg-transparent border-none text-[11px] font-medium outline-none cursor-pointer hover:text-[var(--text-main)] transition-colors"
          value={i18n.language}
          onChange={handleLanguageChange}
        >
          <option value="en">English</option>
          <option value="zh-TW">繁體中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
        </select>
      </div>

      <div className="w-px h-6 bg-[var(--border-color)] mx-1" />
      
      <ToolbarButton 
        icon={isDark ? <Sun size={16} className="text-yellow-500" /> : <Moon size={16} className="text-[var(--text-muted)]" />} 
        label={isDark ? t('toolbar.lightMode') : t('toolbar.darkMode')} 
        onClick={onToggleDark} 
      />
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, disabled }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors text-[var(--text-main)] ${
        disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : 'hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)]'
      }`}
      title={label}
    >
      {icon}
      <span className="text-[12px] font-medium leading-none">{label}</span>
    </button>
  );
}
