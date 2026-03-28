const express = require('express');
const { Worker } = require('worker_threads');
const { spawn } = require('child_process');
const path = require('path');
const chokidar = require('chokidar');
const config = require('./config');
const { search, db } = require('./database');

const app = express();
const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

let indexingStatus = {
    isIndexing: false,
    scanned: 0,
    indexed: 0,
    lastFile: '',
    totalInDb: 0
};

// Track debounce timers for file changes
const watcherTimers = new Map();

/**
 * Get OS-specific open command info for SPAWN
 */
function getOpenInfo() {
    switch (process.platform) {
        case 'win32': return { cmd: 'cmd.exe', args: ['/c', 'start', ''] };
        case 'darwin': return { cmd: 'open', args: [] };
        default: return { cmd: 'xdg-open', args: [] };
    }
}

/**
 * Start the full background indexer
 */
function startIndexing() {
    if (indexingStatus.isIndexing) return;
    indexingStatus.isIndexing = true;

    const worker = new Worker(path.join(__dirname, 'indexer.js'), {
        workerData: { scanPath: config.scanPath }
    });

    worker.on('message', (msg) => {
        if (msg.type === 'progress') {
            Object.assign(indexingStatus, { scanned: msg.scanned, indexed: msg.indexed, lastFile: msg.lastFile });
        } else if (msg.type === 'done') {
            indexingStatus.isIndexing = false;
            syncTotalCount();
        }
    });

    worker.on('error', () => { indexingStatus.isIndexing = false; });
}

/**
 * Watcher with 500ms safety debounce
 */
function initFileWatcher() {
    const watcher = chokidar.watch(config.scanPath, {
        ignored: config.ignoredDirs.map(d => `**/${d}/**`),
        persistent: true,
        ignoreInitial: true,
    });

    const triggerDebounced = (filePath) => {
        if (watcherTimers.has(filePath)) clearTimeout(watcherTimers.get(filePath));
        
        watcherTimers.set(filePath, setTimeout(() => {
            const worker = new Worker(path.join(__dirname, 'indexer.js'), {
                workerData: { scanPath: filePath, singleFile: true }
            });
            worker.on('exit', () => syncTotalCount());
            watcherTimers.delete(filePath);
        }, 500));
    };

    watcher.on('add', triggerDebounced);
    watcher.on('change', triggerDebounced);
    watcher.on('unlink', (filePath) => {
        db.prepare('DELETE FROM files WHERE path = ?').run(filePath);
        db.prepare('DELETE FROM search_index WHERE path = ?').run(filePath);
        syncTotalCount();
    });
}

function syncTotalCount() {
    const row = db.prepare('SELECT COUNT(*) as count FROM files').get();
    indexingStatus.totalInDb = row.count || 0;
}

// API: Search
app.get('/api/search', (req, res) => {
    try {
        res.json(search(req.query.q, req.query.category));
    } catch (err) {
        res.status(400).json({ error: 'Search failed.' });
    }
});

// API: Secure & Elite Open File (No Shell Injection)
app.get('/api/open', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).send('Missing path');

    const absoluteRoot = path.resolve(config.scanPath);
    const requestedPath = path.resolve(filePath);

    // SECURITY: Use path.relative for robust sandbox validation
    const relative = path.relative(absoluteRoot, requestedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        console.warn(`🛡️ Sandbox Violation Blocked: ${requestedPath}`);
        return res.status(403).send('Forbidden: Path sandbox violation');
    }

    const info = getOpenInfo();
    console.log(`🚀 Launching: ${requestedPath}`);

    /**
     * Use spawn for security (no shell injection)
     * detached: true + stdio: ignore + unref() allows the process to run independently
     */
    const child = spawn(info.cmd, [...info.args, requestedPath], {
        detached: true,
        stdio: 'ignore'
    });
    child.unref();
    
    res.send('Launched');
});

app.get('/api/status', (req, res) => res.json(indexingStatus));

startIndexing();
initFileWatcher();
syncTotalCount();

app.listen(PORT, () => console.log(`🚀 LocalLens v1.4.1: http://localhost:${PORT}`));
