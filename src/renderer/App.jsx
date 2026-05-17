import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import DataGrid from './components/DataGrid';
import StatusBar from './components/StatusBar';
import { STORAGE_KEY } from './i18n';
import { classifyTargetUrl } from './utils/targetUrl';

const DEFAULT_CONFIG = {
  mode: 'download',
  url: '',
  output: 'downloaded_site',
  preset: 'page',
  engineMode: 'auto',
  wait: 2000,
  browserType: 'playwright',
  headless: true,
  maxDepth: 1,
  recursive: false,
  useSitemap: false,
  ignoreRobots: false,
  legacyFlatPages: false,
  pathDeep: false,
  pathProbeDepth: 1,
  pathNoRender: false,
  pathSeeds: '',
  pathTxt: '',
  concurrency: 5,
  delay: 500,
  timeout: 30000,
  type: 'all'
};

function readStoredGui() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mergeStoredConfig(stored) {
  if (!stored || typeof stored.config !== 'object') return { ...DEFAULT_CONFIG };
  return { ...DEFAULT_CONFIG, ...stored.config };
}

function mergeWorkspaceTask(prev, updated) {
  const index = prev.findIndex((x) => x.id === updated.id);
  if (index === -1) return [updated, ...prev];
  const next = [...prev];
  next[index] = { ...prev[index], ...updated };
  return next;
}

export default function App() {
  const { i18n: i18nInstance } = useTranslation();
  const stored = typeof localStorage !== 'undefined' ? readStoredGui() : null;

  const [config, setConfig] = useState(() => mergeStoredConfig(stored));
  const [isRunning, setIsRunning] = useState(false);
  const [workspaceTasks, setWorkspaceTasks] = useState([]);
  const [progress, setProgress] = useState({
    total: 0,
    success: 0,
    bytes: 0,
    percent: null
  });
  const [isDark, setIsDark] = useState(stored?.isDark === true);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [downloadActivityUrls, setDownloadActivityUrls] = useState([]);
  const [discoveryActivityLines, setDiscoveryActivityLines] = useState([]);

  const urlClass = classifyTargetUrl(config.url);

  const digestFromTasks = useCallback((tasks) => {
    const runningList = tasks.filter((t) => t.status === 'running');
    setIsRunning(runningList.length > 0);
  }, []);

  const runningDownloads = useMemo(
    () => workspaceTasks.filter((t) => t.status === 'running' && t.mode === 'download'),
    [workspaceTasks]
  );

  const runsDownloadWork = useMemo(
    () => workspaceTasks.some((t) => t.status === 'running' && t.mode === 'download'),
    [workspaceTasks]
  );
  const runsDownloadWorkRef = useRef(false);
  runsDownloadWorkRef.current = runsDownloadWork;

  const runsDiscoveryWork = useMemo(
    () => workspaceTasks.some((t) => t.status === 'running' && t.mode === 'discovery'),
    [workspaceTasks]
  );
  const runsDiscoveryWorkRef = useRef(false);
  runsDiscoveryWorkRef.current = runsDiscoveryWork;

  const downloadBatchRef = useRef([]);
  const downloadFlushRef = useRef(null);
  const discoveryBatchRef = useRef([]);
  const discoveryFlushRef = useRef(null);

  const flushDownloadBatch = useCallback(() => {
    downloadFlushRef.current = null;
    const batch = downloadBatchRef.current;
    downloadBatchRef.current = [];
    if (batch.length === 0 || !runsDownloadWorkRef.current) return;
    setDownloadActivityUrls((prev) => {
      let next = [...prev];
      for (let i = batch.length - 1; i >= 0; i--) {
        const u = batch[i];
        if (!u) continue;
        if (next[0] === u) continue;
        next = [u, ...next].slice(0, 12);
      }
      return next;
    });
  }, []);

  const flushDiscoveryBatch = useCallback(() => {
    discoveryFlushRef.current = null;
    const batch = discoveryBatchRef.current;
    discoveryBatchRef.current = [];
    if (batch.length === 0 || !runsDiscoveryWorkRef.current) return;
    setDiscoveryActivityLines((prev) => {
      let next = [...prev];
      for (let i = batch.length - 1; i >= 0; i--) {
        const line = batch[i];
        if (!line) continue;
        if (next[0] === line) continue;
        next = [line, ...next].slice(0, 12);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    if (window.electronAPI?.setAppLocale) {
      window.electronAPI.setAppLocale(i18nInstance.language);
    }
  }, [i18nInstance.language]);

  useEffect(() => {
    const tmr = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            lng: i18nInstance.language,
            isDark,
            config
          })
        );
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(tmr);
  }, [config, isDark, i18nInstance.language]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.getTasks) return undefined;

    let throttleDig = null;
    async function refreshDigestDebounced() {
      clearTimeout(throttleDig);
      throttleDig = setTimeout(async () => {
        try {
          const tasks = await api.getTasks();
          digestFromTasks(tasks);
        } catch (_) {
          /* ignore */
        }
      }, 120);
    }

    async function bootstrap() {
      try {
        const tasks = await api.getTasks();
        setWorkspaceTasks(tasks);
        digestFromTasks(tasks);
      } catch (_) {
        /* ignore */
      }
    }

    bootstrap().catch(() => {});

    const unUpdate = api.onTaskUpdate((updated) => {
      setWorkspaceTasks((prev) => mergeWorkspaceTask(prev, updated));
      refreshDigestDebounced();
    });

    const unDone = api.onTaskDone(async () => {
      setRefreshTrigger((p) => p + 1);
      try {
        const tasks = await api.getTasks();
        digestFromTasks(tasks);
      } catch (_) {
        /* ignore */
      }
    });

    const unProgress = api.onProgress((data) => {
      setProgress((prev) => ({
        total: data.total || prev.total + 1,
        success:
          data.current != null ? data.current : data.status === 'success' ? prev.success + 1 : prev.success,
        bytes:
          typeof data.downloadedBytesTotal === 'number' && Number.isFinite(data.downloadedBytesTotal)
            ? data.downloadedBytesTotal
            : prev.bytes,
        percent: data.percent != null ? data.percent : data.phase === 'discovery' ? null : prev.percent
      }));

      const phase = typeof data.phase === 'string' ? data.phase : '';
      const status = typeof data.status === 'string' ? data.status : '';
      const u = typeof data.url === 'string' ? data.url.trim() : '';

      if (status === 'error' || status === 'cancelled') return;

      if (/^discovery-/i.test(phase)) {
        const line = u || phase;
        if (runsDiscoveryWorkRef.current && line) {
          discoveryBatchRef.current.push(line);
          if (!discoveryFlushRef.current) {
            discoveryFlushRef.current = setTimeout(flushDiscoveryBatch, 120);
          }
        }
        return;
      }

      if (runsDownloadWorkRef.current && u) {
        downloadBatchRef.current.push(u);
        if (!downloadFlushRef.current) {
          downloadFlushRef.current = setTimeout(flushDownloadBatch, 120);
        }
      }
    });

    return () => {
      clearTimeout(throttleDig);
      clearTimeout(downloadFlushRef.current);
      clearTimeout(discoveryFlushRef.current);
      if (typeof unUpdate === 'function') unUpdate();
      if (typeof unDone === 'function') unDone();
      if (typeof unProgress === 'function') unProgress();
    };
  }, [digestFromTasks, flushDiscoveryBatch, flushDownloadBatch]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.getTasks) return undefined;
    api.getTasks().then(setWorkspaceTasks).catch(() => {});
    return undefined;
  }, [refreshTrigger]);

  useEffect(() => {
    if (!runsDownloadWork) setDownloadActivityUrls([]);
  }, [runsDownloadWork]);

  useEffect(() => {
    if (config.mode !== 'download') setDownloadActivityUrls([]);
  }, [config.mode]);

  useEffect(() => {
    if (!runsDiscoveryWork) setDiscoveryActivityLines([]);
  }, [runsDiscoveryWork]);

  useEffect(() => {
    if (config.mode !== 'discovery') setDiscoveryActivityLines([]);
  }, [config.mode]);

  const handleStart = useCallback(() => {
    const c = classifyTargetUrl(config.url);
    if (c) return;
    setDownloadActivityUrls([]);
    setDiscoveryActivityLines([]);
    setProgress({ total: 0, success: 0, bytes: 0, percent: null });
    if (window.electronAPI) {
      window.electronAPI.startTask(config);
    }
  }, [config]);

  const handleStartRef = useRef(handleStart);
  handleStartRef.current = handleStart;

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      handleStartRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const averageDownloadPercent = useMemo(() => {
    if (runningDownloads.length < 2) return null;
    const sum = runningDownloads.reduce((acc, t) => acc + (Number.isFinite(t.percent) ? t.percent : 0), 0);
    return Math.round(sum / runningDownloads.length);
  }, [runningDownloads]);

  const tasksSummary = useMemo(() => {
    const runningTotal = workspaceTasks.filter((t) => t.status === 'running').length;
    const downloadRunning = runningDownloads.length;
    return { runningTotal, downloadRunning };
  }, [workspaceTasks, runningDownloads.length]);

  const statusBarPercent = averageDownloadPercent != null ? averageDownloadPercent : progress.percent;
  const showMultiHint = runsDownloadWork && tasksSummary.downloadRunning > 1;

  const handleStop = async () => {
    if (!window.electronAPI?.cancelAllDownloads) return;
    await window.electronAPI.cancelAllDownloads();
    try {
      const tasks = await window.electronAPI.getTasks();
      setWorkspaceTasks(tasks);
      digestFromTasks(tasks);
    } catch (_) {
      /* ignore */
    }
  };

  const handleExport = async () => {
    if (selectedTasks.length === 0) return;
    if (window.electronAPI) {
      await window.electronAPI.exportTasks(selectedTasks);
      setSelectedTasks([]);
    }
  };

  const handleDelete = async () => {
    if (selectedTasks.length === 0) return;
    if (window.electronAPI) {
      const deleted = await window.electronAPI.deleteTasks(selectedTasks);
      if (deleted) {
        setSelectedTasks([]);
        setRefreshTrigger((prev) => prev + 1);
      }
    }
  };

  const handleOfflinePreview = async () => {
    if (!window.electronAPI?.startOfflinePreview) return;
    await window.electronAPI.startOfflinePreview(config.output || 'downloaded_site');
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-base)] text-[var(--text-main)] text-[13px] font-segoe overflow-hidden select-none cursor-default">
      <Toolbar
        isRunning={isRunning}
        onStart={handleStart}
        onStop={handleStop}
        onExport={handleExport}
        onDelete={handleDelete}
        hasSelection={selectedTasks.length > 0}
        isDark={isDark}
        onToggleDark={() => setIsDark(!isDark)}
        mode={config.mode}
        onOfflinePreview={handleOfflinePreview}
        startBlockedUrlClass={urlClass}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          config={config}
          setConfig={setConfig}
          isRunning={isRunning}
          targetUrlClass={urlClass}
          downloadActivityUrls={downloadActivityUrls}
          discoveryActivityLines={discoveryActivityLines}
        />

        <div className="flex-1 border-l border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-col overflow-hidden">
          <DataGrid tasks={workspaceTasks} selectedTasks={selectedTasks} setSelectedTasks={setSelectedTasks} />
        </div>
      </div>

      <StatusBar
        isRunning={isRunning}
        progress={{
          ...progress,
          effectivePercent: statusBarPercent,
          showMultiDownloadsHint: showMultiHint
        }}
        runningTotalTasks={tasksSummary.runningTotal}
      />
    </div>
  );
}
