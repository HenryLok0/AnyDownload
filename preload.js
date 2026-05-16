const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  openTaskFolder: (path) => ipcRenderer.invoke('open-task-folder', path),
  exportTasks: (ids) => ipcRenderer.invoke('export-tasks', ids),
  deleteTasks: (ids) => ipcRenderer.invoke('delete-tasks', ids),
  startTask: (config) => ipcRenderer.send('start-task', config),
  onTaskUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('task-update', handler);
    return () => ipcRenderer.removeListener('task-update', handler);
  },
  onProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('task-progress', handler);
    return () => {
      ipcRenderer.removeListener('task-progress', handler);
    };
  },
  onTaskDone: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('task-done', handler);
    return () => {
      ipcRenderer.removeListener('task-done', handler);
    };
  }
});
