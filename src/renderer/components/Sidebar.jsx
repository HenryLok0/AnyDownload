import React from 'react';
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Heuristic for showing "relative resolves under Documents/..." helper in GUI */
function looksLikeAbsoluteOutput(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (/^\\\\/.test(t)) return true;
  if (/^[a-zA-Z]:[/\\]/.test(t)) return true;
  return t.startsWith('/');
}

export default function Sidebar({
  config,
  setConfig,
  isRunning,
  targetUrlClass,
  downloadActivityUrls = [],
  discoveryActivityLines = []
}) {
  const { t } = useTranslation();
  const [guiHints, setGuiHints] = React.useState({ documentOutputRoot: '', pathTxtSearchDir: '' });
  const [outputFolderOpenErr, setOutputFolderOpenErr] = React.useState('');

  React.useEffect(() => {
    setOutputFolderOpenErr('');
  }, [config.output]);

  React.useEffect(() => {
    if (window.electronAPI?.getGuiOutputHints) {
      window.electronAPI.getGuiOutputHints().then(setGuiHints).catch(() => {});
    }
  }, []);

  const update = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="w-64 bg-[var(--bg-base)] flex flex-col overflow-y-auto shrink-0 border-r border-[var(--border-color)]">
      <Section title={t('sidebar.targetSetup')} defaultOpen={true}>
        <SelectField label={t('sidebar.actionMode')} disabled={isRunning} value={config.mode} onChange={(v) => update('mode', v)}>
          <option value="download">{t('sidebar.downloadWebsite')}</option>
          <option value="discovery">{t('sidebar.pathDiscovery')}</option>
        </SelectField>
        
        <InputField label={t('sidebar.targetUrl')} disabled={isRunning} value={config.url} onChange={(v) => update('url', v)} placeholder="https://example.com" />
        
        {targetUrlClass === 'empty' && (
          <p className="text-[10px] text-[var(--text-muted)] leading-snug px-0.5 font-sans">
            {t('sidebar.targetUrlHintEmpty')}
          </p>
        )}
        {targetUrlClass === 'invalid' && (
          <p className="text-[10px] text-red-600 leading-snug px-0.5 font-sans">
            {t('sidebar.targetUrlHintInvalid')}
          </p>
        )}

        {config.mode === 'download' && (
          <>
            <InputField
              label={t('sidebar.outputFolder')}
              disabled={isRunning}
              value={config.output}
              onChange={(v) => update('output', v)}
              onBrowse={async () => {
                if (window.electronAPI) {
                  const folder = await window.electronAPI.selectFolder();
                  if (folder) update('output', folder);
                }
              }}
              afterBrowse={
                window.electronAPI?.openGuiDownloadFolder ? (
                  <button
                    type="button"
                    aria-label={t('sidebar.openOutputFolderButton')}
                    title={t('sidebar.openOutputFolderTooltip')}
                    onClick={async () => {
                      setOutputFolderOpenErr('');
                      try {
                        const res = await window.electronAPI.openGuiDownloadFolder(config.output);
                        if (res && !res.ok) setOutputFolderOpenErr(res.error || t('sidebar.openOutputFolderFailedShort'));
                      } catch (e) {
                        setOutputFolderOpenErr(e?.message || String(e));
                      }
                    }}
                    className="shrink-0 px-2 py-0.5 text-[11px] bg-[var(--bg-header-alt)] border border-[var(--border-color)] rounded-sm hover:bg-[var(--bg-hover)] text-[var(--text-main)] inline-flex items-center gap-1"
                  >
                    <FolderOpen size={12} />
                    <span>{t('sidebar.openOutputFolderButton')}</span>
                  </button>
                ) : null
              }
            />
            {outputFolderOpenErr ? (
              <p className="text-[10px] text-red-600 leading-snug px-0.5 font-sans">{outputFolderOpenErr}</p>
            ) : null}
            {Boolean(guiHints.documentOutputRoot) && !looksLikeAbsoluteOutput(config.output) && (
              <p className="text-[10px] text-[var(--text-muted)] leading-snug px-0.5 font-sans">
                {t('sidebar.relativeOutputResolvedUnder', { path: guiHints.documentOutputRoot })}
              </p>
            )}
            <div className="rounded-sm border border-[var(--border-color)] bg-[var(--bg-panel)] p-1.5">
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
                {t('sidebar.liveDownloadActivityTitle')}
              </div>
              {downloadActivityUrls.length === 0 ? (
                <p className="text-[10px] text-[var(--text-muted)] leading-snug font-sans">
                  {t('sidebar.liveDownloadActivityIdle')}
                </p>
              ) : (
                <ul className="max-h-28 overflow-y-auto space-y-0.5 text-[10px] font-mono leading-snug list-none">
                  {downloadActivityUrls.map((u, idx) => (
                    <li key={`${idx}-${u.slice(-24)}`} className="truncate text-[var(--text-main)]" title={u}>
                      {u}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <SelectField label={t('sidebar.preset')} disabled={isRunning} value={config.preset} onChange={(v) => update('preset', v)}>
              <option value="page">{t('sidebar.presetPage')}</option>
              <option value="full">{t('sidebar.presetFull')}</option>
              <option value="mirror">{t('sidebar.presetMirror')}</option>
            </SelectField>
          </>
        )}
      </Section>

      {config.mode === 'download' && (
        <Section title={t('sidebar.engineRendering')} defaultOpen={true}>
          <SelectField label={t('sidebar.engineMode')} disabled={isRunning} value={config.engineMode} onChange={(v) => update('engineMode', v)}>
            <option value="auto">{t('sidebar.engineAuto')}</option>
            <option value="static">{t('sidebar.engineStatic')}</option>
            <option value="render">{t('sidebar.engineRender')}</option>
          </SelectField>
          <div className="flex gap-2">
            <SelectField label={t('sidebar.browser')} disabled={isRunning} value={config.browserType} onChange={(v) => update('browserType', v)}>
              <option value="playwright">{t('sidebar.browserPlaywright', 'Playwright')}</option>
              <option value="puppeteer">{t('sidebar.browserPuppeteer', 'Puppeteer')}</option>
            </SelectField>
            <InputField label={t('sidebar.wait')} type="number" disabled={isRunning} value={config.wait} onChange={(v) => update('wait', Number(v))} />
          </div>
          <CheckboxField label={t('sidebar.headlessMode')} disabled={isRunning} checked={config.headless} onChange={(v) => update('headless', v)} />
        </Section>
      )}

      {config.mode === 'download' && (
        <Section title={t('sidebar.crawlingRules')}>
          <InputField label={t('sidebar.maxDepth')} type="number" disabled={isRunning} value={config.maxDepth} onChange={(v) => update('maxDepth', Number(v))} />
          <CheckboxField label={t('sidebar.recursive')} disabled={isRunning} checked={config.recursive} onChange={(v) => update('recursive', v)} />
          <CheckboxField label={t('sidebar.useSitemap')} disabled={isRunning} checked={config.useSitemap} onChange={(v) => update('useSitemap', v)} />
          <CheckboxField label={t('sidebar.ignoreRobots')} disabled={isRunning} checked={config.ignoreRobots} onChange={(v) => update('ignoreRobots', v)} />
          <CheckboxField label={t('sidebar.legacyFlatPages')} disabled={isRunning} checked={config.legacyFlatPages} onChange={(v) => update('legacyFlatPages', v)} />
        </Section>
      )}

      {config.mode === 'discovery' && (
        <Section title={t('sidebar.pathDiscoveryRules')} defaultOpen={true}>
          <CheckboxField label={t('sidebar.deepScan')} disabled={isRunning} checked={config.pathDeep} onChange={(v) => update('pathDeep', v)} />
          <InputField label={t('sidebar.probeDepth')} type="number" disabled={isRunning} value={config.pathProbeDepth} onChange={(v) => update('pathProbeDepth', Number(v))} />
          <CheckboxField label={t('sidebar.skipRender')} disabled={isRunning} checked={config.pathNoRender} onChange={(v) => update('pathNoRender', v)} />
          <InputField 
            label={t('sidebar.customSeeds')} 
            disabled={isRunning} 
            value={config.pathSeeds} 
            onChange={(v) => update('pathSeeds', v)} 
            placeholder="C:\paths.txt" 
            onBrowse={async () => {
              if (window.electronAPI) {
                const file = await window.electronAPI.selectFile();
                if (file) update('pathSeeds', file);
              }
            }}
          />
          <InputField 
            label={t('sidebar.customWordlist')} 
            disabled={isRunning} 
            value={config.pathTxt} 
            onChange={(v) => update('pathTxt', v)} 
            placeholder="C:\wordlist.txt" 
            onBrowse={async () => {
              if (window.electronAPI) {
                const file = await window.electronAPI.selectFile();
                if (file) update('pathTxt', file);
              }
            }}
          />
          {Boolean(guiHints.pathTxtSearchDir) && (
            <p className="text-[10px] text-[var(--text-muted)] leading-snug px-0.5 font-sans">
              {t('sidebar.pathTxtBundledFallbackDir', { path: guiHints.pathTxtSearchDir })}
            </p>
          )}
          <div className="rounded-sm border border-[var(--border-color)] bg-[var(--bg-panel)] p-1.5">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
              {t('sidebar.discoveryLiveActivityTitle')}
            </div>
            {discoveryActivityLines.length === 0 ? (
              <p className="text-[10px] text-[var(--text-muted)] leading-snug font-sans">{t('sidebar.discoveryLiveActivityIdle')}</p>
            ) : (
              <ul className="max-h-24 overflow-y-auto space-y-0.5 text-[10px] font-mono leading-snug list-none">
                {discoveryActivityLines.map((line, idx) => (
                  <li key={`${idx}-${line.slice(-20)}`} className="truncate text-[var(--text-main)]" title={line}>
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      )}

      <Section title={t('sidebar.limitsFilters')}>
        <div className="flex gap-2">
          <InputField label={t('sidebar.concurrency')} type="number" disabled={isRunning} value={config.concurrency} onChange={(v) => update('concurrency', Number(v))} />
          <InputField label={t('sidebar.delay')} type="number" disabled={isRunning} value={config.delay} onChange={(v) => update('delay', Number(v))} />
        </div>
        <div className="flex gap-2">
          <InputField label={t('sidebar.timeout')} type="number" disabled={isRunning} value={config.timeout} onChange={(v) => update('timeout', Number(v))} />
        </div>
        {config.mode === 'download' && (
          <SelectField label={t('sidebar.resourceType')} disabled={isRunning} value={config.type} onChange={(v) => update('type', v)}>
            <option value="all">{t('sidebar.allFiles')}</option>
            <option value="image">{t('sidebar.imagesOnly')}</option>
            <option value="css">{t('sidebar.cssOnly')}</option>
            <option value="js">{t('sidebar.jsOnly')}</option>
            <option value="html">{t('sidebar.htmlOnly')}</option>
            <option value="media">{t('sidebar.mediaOnly')}</option>
            <option value="font">{t('sidebar.fontsOnly')}</option>
          </SelectField>
        )}
      </Section>
    </div>
  );
}

function Section({ title, defaultOpen = false, children }) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-[var(--border-color)]">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-2 py-1.5 bg-[var(--bg-header-alt)] border-b border-[var(--border-color)] font-semibold text-[11px] text-[var(--text-main)] tracking-wide uppercase flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors cursor-default"
      >
        <span>{title}</span>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {isOpen && (
        <div className="p-2 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

function InputField({ label, type = 'text', disabled, value, onChange, placeholder, onBrowse, afterBrowse }) {
  return (
    <label className="block flex-1 min-w-0">
      <span className="text-[11px] font-semibold text-[var(--text-muted)] block mb-0.5">{label}</span>
      <div className="flex gap-1 min-w-0 flex-wrap items-stretch">
        <input 
          type={type} 
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 px-1.5 py-0.5 text-[12px] border border-[var(--border-color)] rounded-sm bg-[var(--bg-panel)] text-[var(--text-main)] outline-none focus:border-blue-500 disabled:opacity-50"
        />
        {onBrowse && (
          <button 
            type="button"
            disabled={disabled}
            onClick={onBrowse}
            className="px-2 py-0.5 shrink-0 text-[11px] bg-[var(--bg-header-alt)] border border-[var(--border-color)] rounded-sm hover:bg-[var(--bg-hover)] disabled:opacity-50 text-[var(--text-main)]"
          >
            ...
          </button>
        )}
        {afterBrowse}
      </div>
    </label>
  );
}

function SelectField({ label, disabled, value, onChange, children }) {
  return (
    <label className="block flex-1">
      <span className="text-[11px] font-semibold text-[var(--text-muted)] block mb-0.5">{label}</span>
      <select 
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-1 py-0.5 text-[12px] border border-[var(--border-color)] rounded-sm bg-[var(--bg-panel)] text-[var(--text-main)] outline-none focus:border-blue-500 disabled:opacity-50"
      >
        {children}
      </select>
    </label>
  );
}

function CheckboxField({ label, disabled, checked, onChange }) {
  return (
    <label className="flex items-center gap-1.5 cursor-default group">
      <input 
        type="checkbox" 
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded-sm border-[var(--border-color)] text-blue-600 focus:ring-blue-500 bg-[var(--bg-panel)] disabled:opacity-50"
      />
      <span className="text-[12px] text-[var(--text-main)] group-hover:text-blue-600 transition-colors">{label}</span>
    </label>
  );
}
