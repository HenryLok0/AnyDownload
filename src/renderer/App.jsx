import React, { useState, useEffect } from 'react';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import DataGrid from './components/DataGrid';
import StatusBar from './components/StatusBar';

export default function App() {
  const [config, setConfig] = useState({
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
  });

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ total: 0, success: 0, bytes: 0 });
  const [isDark, setIsDark] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleStart = () => {
    if (!config.url) return;
    setIsRunning(true);
    setProgress({ total: 0, success: 0, bytes: 0 });
    if (window.electronAPI) {
      window.electronAPI.startTask(config);
    }
  };

  const handleStop = () => {
    setIsRunning(false);
    // TODO: wire up stop IPC
  };

  const handleExport = async () => {
    if (selectedTasks.length === 0) return;
    if (window.electronAPI) {
      await window.electronAPI.exportTasks(selectedTasks);
      setSelectedTasks([]); // clear selection after export
    }
  };

  const handleDelete = async () => {
    if (selectedTasks.length === 0) return;
    if (window.electronAPI) {
      const deleted = await window.electronAPI.deleteTasks(selectedTasks);
      if (deleted) {
        setSelectedTasks([]); // clear selection
        setRefreshTrigger(prev => prev + 1);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-base)] text-[var(--text-main)] text-[13px] font-segoe overflow-hidden select-none cursor-default">
      {/* Top Toolbar */}
      <Toolbar 
        isRunning={isRunning} 
        onStart={handleStart} 
        onStop={handleStop} 
        onExport={handleExport}
        onDelete={handleDelete}
        hasSelection={selectedTasks.length > 0}
        isDark={isDark}
        onToggleDark={() => setIsDark(!isDark)}
      />

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Config Sidebar */}
        <Sidebar config={config} setConfig={setConfig} isRunning={isRunning} />

        {/* Center Data Grid */}
        <div className="flex-1 border-l border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-col overflow-hidden">
          <DataGrid 
            setProgress={setProgress} 
            onTaskDone={() => setIsRunning(false)} 
            selectedTasks={selectedTasks}
            setSelectedTasks={setSelectedTasks}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar isRunning={isRunning} progress={progress} />
    </div>
  );
}
