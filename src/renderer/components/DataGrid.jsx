import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';

/** Build native tooltip summary for terminal task states */
function rowStatusTooltip(task, t) {
  const parts = [];
  if (typeof task.resourceFailCount === 'number' && task.resourceFailCount > 0) {
    parts.push(t('dataGrid.resourceFailuresSummary', { count: task.resourceFailCount }));
  }
  if ((task.status === 'error' || task.status === 'cancelled') && task.lastError) {
    parts.push(String(task.lastError));
  }
  if (task.status === 'cancelled' && !task.lastError) {
    parts.push(t('dataGrid.cancelledTooltip'));
  }
  return parts.filter(Boolean).join('\n');
}

function parseTaskTime(ts) {
  const n = new Date(ts).getTime();
  return Number.isFinite(n) ? n : 0;
}

export default function DataGrid({ tasks, selectedTasks, setSelectedTasks }) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('timestamp');
  const [sortDesc, setSortDesc] = useState(true);

  const toggleSelect = (id) => {
    setSelectedTasks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const cycleSort = (key) => {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(key === 'timestamp');
    }
  };

  const sortedFiltered = useMemo(() => {
    const list = Array.isArray(tasks) ? [...tasks] : [];
    const filtered =
      statusFilter === 'all' ? list : list.filter((task) => task.status === statusFilter);
    filtered.sort((a, b) => {
      if (sortKey === 'url') {
        return sortDesc
          ? String(b.url || '').localeCompare(String(a.url || ''))
          : String(a.url || '').localeCompare(String(b.url || ''));
      }
      if (sortKey === 'status') {
        return sortDesc
          ? String(b.status || '').localeCompare(String(a.status || ''))
          : String(a.status || '').localeCompare(String(b.status || ''));
      }
      const ta = parseTaskTime(a.timestamp);
      const tb = parseTaskTime(b.timestamp);
      return sortDesc ? tb - ta : ta - tb;
    });
    return filtered;
  }, [tasks, statusFilter, sortKey, sortDesc]);

  const StatusIcon = ({ status }) => {
    switch (status) {
      case 'success':
        return <span className="text-green-600 text-xs">●</span>;
      case 'running':
        return <span className="text-blue-500 text-xs animate-pulse">●</span>;
      case 'error':
        return <span className="text-red-600 text-xs">●</span>;
      case 'cancelled':
        return <span className="text-amber-600 text-xs">●</span>;
      default:
        return <span className="text-gray-400 text-xs">○</span>;
    }
  };

  const openFolder = (task) => {
    if (task.status === 'running') return;
    if (window.electronAPI?.openTaskFolder) window.electronAPI.openTaskFolder(task.outputDir);
  };

  const sortMark = (key) => (sortKey === key ? (sortDesc ? ' \u25BC' : ' \u25B2') : '');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-panel)] min-h-0">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--border-color)] bg-[var(--bg-base)] shrink-0">
        <label className="text-[11px] text-[var(--text-muted)] font-semibold">{t('dataGrid.filterLabel')}</label>
        <select
          aria-label={t('dataGrid.filterLabel')}
          className="text-[11px] border border-[var(--border-color)] rounded-sm bg-[var(--bg-panel)] text-[var(--text-main)] px-1 py-0.5"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">{t('dataGrid.filterAll')}</option>
          <option value="running">{t('dataGrid.filterRunning')}</option>
          <option value="success">{t('dataGrid.filterSuccess')}</option>
          <option value="error">{t('dataGrid.filterError')}</option>
          <option value="cancelled">{t('dataGrid.filterCancelled')}</option>
        </select>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse table-fixed">
          <thead className="bg-[var(--bg-header)] sticky top-0 z-10 border-b border-[var(--border-color)] shadow-sm text-[var(--text-main)]">
            <tr>
              <th className="px-2 py-1 font-semibold border-r border-[var(--border-light)] w-8 text-center" />
              <th className="px-2 py-1 font-semibold border-r border-[var(--border-light)] w-8 text-center" />
              <th className="px-2 py-1 font-semibold border-r border-[var(--border-light)] w-3/5 truncate">
                <button
                  type="button"
                  className="text-left w-full font-semibold hover:text-blue-600 cursor-default"
                  onClick={() => cycleSort('url')}
                  title={t('dataGrid.sortByTarget')}
                >
                  {t('dataGrid.target')}
                  {sortMark('url')}
                </button>
              </th>
              <th className="px-2 py-1 font-semibold border-r border-[var(--border-light)] w-1/5 truncate">{t('dataGrid.size')}</th>
              <th className="px-2 py-1 font-semibold border-r border-[var(--border-light)] w-1/5 truncate">
                <button
                  type="button"
                  className="text-left w-full font-semibold hover:text-blue-600 cursor-default"
                  onClick={() => cycleSort('timestamp')}
                  title={t('dataGrid.sortByTime')}
                >
                  {t('dataGrid.statusTime')}
                  {sortMark('timestamp')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="text-[12px] font-mono">
            {sortedFiltered.map((task, i) => {
              const tip = rowStatusTooltip(task, t);
              const needsTip = tip.length > 0;
              const folderTitle =
                task.status === 'running' ? t('dataGrid.folderOpenDisabledWhileRunning') : task.url ?? '';
              return (
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
                  <td
                    className="px-2 py-0.5 border-r border-[var(--border-lighter)] text-center"
                    title={needsTip ? tip : undefined}
                  >
                    <StatusIcon status={task.status} />
                  </td>
                  <td
                    className={`px-2 py-0.5 border-r border-[var(--border-lighter)] truncate text-[var(--text-main)] flex items-center gap-2 ${
                      task.status === 'running' ? 'cursor-default opacity-80' : 'cursor-pointer hover:underline'
                    }`}
                    title={folderTitle}
                    onClick={() => openFolder(task)}
                    onDoubleClick={() => openFolder(task)}
                  >
                    <FolderOpen size={14} className="text-yellow-600 shrink-0" />
                    <span className="truncate">{task.url}</span>
                  </td>
                  <td
                    className="px-2 py-0.5 border-r border-[var(--border-lighter)] text-right truncate text-[var(--text-main)]"
                    title={
                      typeof task.resourceFailCount === 'number' && task.resourceFailCount > 0
                        ? t('dataGrid.partialSuccessExplain')
                        : undefined
                    }
                  >
                    {task.size}{' '}
                    {task.percent != null && task.status === 'running' ? `(${task.percent}%)` : ''}
                  </td>
                  <td
                    className="px-2 py-0.5 border-r border-[var(--border-lighter)] truncate text-[var(--text-muted)]"
                    title={needsTip ? tip : undefined}
                  >
                    {new Date(task.timestamp).toLocaleString()} - {task.status}
                  </td>
                </tr>
              );
            })}
            {sortedFiltered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-4 text-[var(--text-placeholder)] font-sans italic">
                  {t('dataGrid.noItems')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
