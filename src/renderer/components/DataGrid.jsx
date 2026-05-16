import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';

export default function DataGrid({ setProgress, onTaskDone, selectedTasks, setSelectedTasks, refreshTrigger }) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getTasks().then(setTasks);
    }
  }, [refreshTrigger]);

  useEffect(() => {
    if (window.electronAPI) {
      const unsubUpdate = window.electronAPI.onTaskUpdate((updatedTask) => {
        setTasks(prev => {
          const index = prev.findIndex(t => t.id === updatedTask.id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = updatedTask;
            return next;
          }
          return [updatedTask, ...prev];
        });
      });

      const unsubProgress = window.electronAPI.onProgress((data) => {
        setProgress(prev => ({
          total: data.total || prev.total + 1,
          success: data.current != null ? data.current : (data.status === 'success' ? prev.success + 1 : prev.success),
          bytes: prev.bytes + (parseFloat(data.size) || 0) * 1024,
          percent: data.percent != null ? data.percent : (data.phase === 'discovery' ? null : prev.percent)
        }));
      });

      const unsubDone = window.electronAPI.onTaskDone(() => {
        onTaskDone();
      });

      return () => {
        unsubUpdate();
        unsubProgress();
        if (unsubDone) unsubDone();
      };
    }
  }, [setProgress, onTaskDone]);

  const toggleSelect = (id) => {
    setSelectedTasks(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const StatusIcon = ({ status }) => {
    switch (status) {
      case 'success': return <span className="text-green-600 text-xs">●</span>;
      case 'running': return <span className="text-blue-500 text-xs animate-pulse">●</span>;
      case 'error': return <span className="text-red-600 text-xs">●</span>;
      default: return <span className="text-gray-400 text-xs">○</span>;
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-[var(--bg-panel)]">
      <table className="w-full text-left border-collapse table-fixed">
        <thead className="bg-[var(--bg-header)] sticky top-0 z-10 border-b border-[var(--border-color)] shadow-sm text-[var(--text-main)]">
          <tr>
            <th className="px-2 py-1 font-semibold border-r border-[var(--border-light)] w-8 text-center"></th>
            <th className="px-2 py-1 font-semibold border-r border-[var(--border-light)] w-8 text-center"></th>
            <th className="px-2 py-1 font-semibold border-r border-[var(--border-light)] w-3/5 truncate">{t('dataGrid.target')}</th>
            <th className="px-2 py-1 font-semibold border-r border-[var(--border-light)] w-1/5 truncate">{t('dataGrid.size')}</th>
            <th className="px-2 py-1 font-semibold border-r border-[var(--border-light)] w-1/5 truncate">{t('dataGrid.statusTime')}</th>
          </tr>
        </thead>
        <tbody className="text-[12px] font-mono">
          {tasks.map((task, i) => (
            <tr 
              key={task.id} 
              className={`hover:bg-[var(--bg-selected)] ${i % 2 === 0 ? 'bg-[var(--bg-panel)]' : 'bg-[var(--bg-base)]'}`}
            >
              <td className="px-2 py-0.5 border-r border-[var(--border-lighter)] text-center">
                <input 
                  type="checkbox" 
                  checked={selectedTasks.includes(task.id)}
                  onChange={() => toggleSelect(task.id)}
                  className="cursor-pointer"
                />
              </td>
              <td className="px-2 py-0.5 border-r border-[var(--border-lighter)] text-center">
                <StatusIcon status={task.status} />
              </td>
              <td 
                className="px-2 py-0.5 border-r border-[var(--border-lighter)] truncate text-[var(--text-main)] cursor-pointer hover:underline flex items-center gap-2" 
                title={task.url}
                onClick={() => window.electronAPI.openTaskFolder(task.outputDir)}
              >
                <FolderOpen size={14} className="text-yellow-600 shrink-0" />
                <span className="truncate">{task.url}</span>
              </td>
              <td className="px-2 py-0.5 border-r border-[var(--border-lighter)] text-right truncate text-[var(--text-main)]">
                {task.size} {task.percent != null && task.status === 'running' ? `(${task.percent}%)` : ''}
              </td>
              <td className="px-2 py-0.5 border-r border-[var(--border-lighter)] truncate text-[var(--text-muted)]">
                {new Date(task.timestamp).toLocaleString()} - {task.status}
              </td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr>
              <td colSpan="5" className="text-center py-4 text-[var(--text-placeholder)] font-sans italic">
                {t('dataGrid.noItems')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
