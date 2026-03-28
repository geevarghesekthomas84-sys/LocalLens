const { workerData, parentPort } = require('worker_threads');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const { extractText } = require('./extractor');
const { upsertFile, updateIndexContent, removeStaleFiles, db } = require('./database');

const { scanPath, singleFile } = workerData;

/**
 * Main Indexer Thread Logic
 */
async function runIndexer() {
    let scannedCount = 0;
    let indexedCount = 0;
    const seenDuringScan = new Set();
    
    // If we're only indexing a single file (from the Watcher)
    if (singleFile) {
        await processFile(scanPath);
        return parentPort.postMessage({ type: 'done', scanned: 1, indexed: 1 });
    }

    /**
     * Recursive scan function
     */
    async function scan(currentPath) {
        let items;
        try {
            items = await fs.readdir(currentPath, { withFileTypes: true });
        } catch (e) { return; }

        for (const item of items) {
            const fullPath = path.join(currentPath, item.name);
            
            if (item.isDirectory()) {
                if (config.ignoredDirs.includes(item.name)) continue;
                await scan(fullPath);
            } else {
                scannedCount++;
                seenDuringScan.add(fullPath);
                
                const changed = await processFile(fullPath);
                if (changed) indexedCount++;
                
                if (scannedCount % 10 === 0) {
                    parentPort.postMessage({ 
                        type: 'progress', 
                        scanned: scannedCount, 
                        indexed: indexedCount, 
                        lastFile: item.name 
                    });
                }
            }
        }
    }

    /**
     * Process an individual file and check if it needs re-indexing
     */
    async function processFile(filePath) {
        try {
            const stats = await fs.stat(filePath);
            const mtime = Math.floor(stats.mtimeMs);
            const size = stats.size;

            // Skip files larger than the configurable limit
            if (size > config.maxFileSize) {
                // console.log(`⏩ Skipping large file: ${path.basename(filePath)}`);
                return false;
            }

            // Accurate Incremental Logic: Only re-index if mtime OR size has changed
            const existing = db.prepare('SELECT last_modified, size FROM files WHERE path = ?').get(filePath);
            if (existing && existing.last_modified === mtime && existing.size === size) {
                return false; 
            }

            // Update metadata and extract text
            upsertFile(filePath, mtime, size);
            const content = await extractText(filePath);
            
            if (content && content.trim()) {
                updateIndexContent(filePath, content);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    await scan(scanPath);
    removeStaleFiles(seenDuringScan);
    parentPort.postMessage({ type: 'done', scanned: scannedCount, indexed: indexedCount });
}

runIndexer();
