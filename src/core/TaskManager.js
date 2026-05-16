const fs = require('fs-extra');
const path = require('path');

class TaskManager {
    constructor(userDataPath) {
        this.tasksFile = path.join(userDataPath, 'tasks.json');
        this.tasks = [];
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.tasksFile)) {
                this.tasks = fs.readJsonSync(this.tasksFile);
            }
        } catch (err) {
            console.error('Failed to load tasks:', err);
            this.tasks = [];
        }
    }

    _save() {
        try {
            fs.writeJsonSync(this.tasksFile, this.tasks, { spaces: 2 });
        } catch (err) {
            console.error('Failed to save tasks:', err);
        }
    }

    getTasks() {
        return this.tasks;
    }

    addTask(task) {
        const newTask = {
            id: Date.now().toString(),
            url: task.url,
            mode: task.mode,
            outputDir: task.outputDir,
            status: 'running',
            timestamp: new Date().toISOString(),
            size: '0 KB',
            percent: 0,
            ...task
        };
        this.tasks.unshift(newTask); // Add to beginning
        this._save();
        return newTask;
    }

    updateTask(id, updates) {
        const index = this.tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            this.tasks[index] = { ...this.tasks[index], ...updates };
            this._save();
            return this.tasks[index];
        }
        return null;
    }

    removeTask(id) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        this._save();
    }
}

module.exports = TaskManager;
