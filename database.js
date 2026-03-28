const Database = require('better-sqlite3');
const path = require('path');
const config = require('./config');

const db = new Database(path.join(__dirname, 'search.db'));

// Initialize Database Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE,
    last_modified INTEGER,
    size INTEGER
  );

  /* FTS5 Virtual Table for searchable content */
  CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    path, 
    content, 
    tokenize='porter'
  );
`);

/**
 * Perform a safe, keyword-based search with category filtering.
 * Uses corrected MATCH syntax against the entire virtual table.
 */
function search(query, category) {
    if (!query || !query.trim()) return [];

    // Sanitize query to prevent FTS5 MATCH crashes
    const sanitized = query
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map(w => `"${w}"*`)
        .join(' AND ');

    if (!sanitized) return [];

    // Correct FTS5: Use 'search_index MATCH' instead of 'column MATCH' for safety
    let sql = `
        SELECT 
            path,
            snippet(search_index, 1, '<mark>', '</mark>', '...', 32) as snippet,
            rank
        FROM search_index 
        WHERE search_index MATCH ?
    `;
    
    const params = [sanitized];

    if (category && config.categories[category] && config.categories[category].length > 0) {
        const set = config.categories[category];
        const conditions = set.map(() => 'path LIKE ?').join(' OR ');
        sql += ` AND (${conditions})`;
        set.forEach(ext => params.push(`%${ext}`));
    }

    sql += ` ORDER BY rank LIMIT 30`;

    try {
        const stmt = db.prepare(sql);
        return stmt.all(...params);
    } catch (err) {
        console.error('❌ SQL Search failed:', err.message);
        return [];
    }
}

function upsertFile(filePath, lastModified, size) {
    const upsertStmt = db.prepare(`
        INSERT INTO files (path, last_modified, size) 
        VALUES (?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET 
            last_modified = excluded.last_modified,
            size = excluded.size
        RETURNING id
    `);
    const info = upsertStmt.get(filePath, lastModified, size);
    return info.id;
}

function updateIndexContent(filePath, content) {
    db.prepare('DELETE FROM search_index WHERE path = ?').run(filePath);
    db.prepare('INSERT INTO search_index(path, content) VALUES (?, ?)').run(filePath, content);
}

function removeStaleFiles(scannedPathsSet) {
    const dbPaths = db.prepare('SELECT path FROM files').all();
    const stalePaths = dbPaths.map(r => r.path).filter(p => !scannedPathsSet.has(p));

    if (stalePaths.length > 0) {
        const deleteMeta = db.prepare('DELETE FROM files WHERE path = ?');
        const deleteIndex = db.prepare('DELETE FROM search_index WHERE path = ?');
        const transaction = db.transaction((paths) => {
            for (const p of paths) {
                deleteMeta.run(p);
                deleteIndex.run(p);
            }
        });
        transaction(stalePaths);
    }
}

module.exports = {
    db,
    search,
    upsertFile,
    updateIndexContent,
    removeStaleFiles
};
