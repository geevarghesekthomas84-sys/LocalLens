/* public/app.js - v1.4 LocalLens Premium UX */
const searchBar = document.getElementById('search-bar');
const container = document.getElementById('results-container');
const resultsMeta = document.getElementById('results-meta');
const badge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const filterBar = document.getElementById('filter-bar');

let debounceTimer;
let currentCategory = 'all';
let isIndexingEmpty = false;

/**
 * Icons based on file extension
 */
function getFileIcon(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return '📄';
    if (['docx', 'doc', 'txt', 'md'].includes(ext)) return '🧾';
    if (['js', 'py', 'ts', 'html', 'css', 'json', 'c', 'cpp', 'java'].includes(ext)) return '🧑‍💻';
    return '📁';
}

/**
 * Perform Search
 */
async function triggerSearch(q) {
    if (!q.trim()) {
        container.innerHTML = `<div class="intro"><p>Press / to search securely across LocalLens...</p></div>`;
        resultsMeta.innerText = '';
        return;
    }

    // UX: Show searching state immediately
    container.innerHTML = `<div class="introSearching"><p>Searching...</p></div>`;
    resultsMeta.innerText = 'Calculating matches...';

    try {
        const params = new URLSearchParams({ q: q.trim(), category: currentCategory });
        const res = await fetch(`/api/search?${params}`);
        if (!res.ok) throw new Error();
        display(await res.json());
    } catch (e) {
        resultsMeta.innerText = 'Search error.';
        container.innerHTML = '';
    }
}

/**
 * Open File Gateway (Securely via SPAWN)
 */
async function openFile(path) {
    try {
        const res = await fetch(`/api/open?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
            const msg = (res.status === 403) ? '🛡️ Access Denied: Path protected.' : 'Launch failed.';
            alert(msg);
        }
    } catch (e) { console.error('Open error:', e); }
}

/**
 * UI Display
 */
function display(results) {
    if (results.length === 0) {
        container.innerHTML = `<div class="intro"><p>No results match your search keywords.</p></div>`;
        resultsMeta.innerText = '0 matches';
        return;
    }

    resultsMeta.innerText = `${results.length} matches found`;
    container.innerHTML = results.map(item => `
        <div class="result-card">
            <div class="card-header">
                <div class="path-wrap">
                    <span class="file-icon">${getFileIcon(item.path)}</span>
                    <span class="path">${item.path}</span>
                </div>
                <button class="open-btn" onclick="openFile('${item.path.replace(/\\/g, '\\\\')}')">OPEN</button>
            </div>
            <div class="snippet">${item.snippet || 'No preview available.'}</div>
        </div>
    `).join('');
}

/**
 * Status Pooling & Empty State Check
 */
async function checkStatus() {
    try {
        const st = await (await fetch('/api/status')).json();
        
        // v1.4: Check for empty index state
        if (st.totalInDb === 0 && st.isIndexing) {
            container.innerHTML = `<div class="intro"><p>No files indexed yet. Please wait...</p></div>`;
            isIndexingEmpty = true;
        } else if (st.totalInDb > 0 && isIndexingEmpty) {
            // Restore welcome message if files are finally indexed
            isIndexingEmpty = false;
            triggerSearch(''); 
        }

        if (st.isIndexing) {
            badge.classList.add('indexing');
            statusText.innerText = `Syncing: ${st.scanned} files...`;
        } else {
            badge.classList.remove('indexing');
            statusText.innerText = `LocalLens v1.4 | ${st.totalInDb} Indexed`;
        }
    } catch (e) {}
}

// v1.4 Shortcut: Press / to focus
document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchBar) {
        e.preventDefault();
        searchBar.focus();
    }
});

filterBar.addEventListener('click', (e) => {
    if (e.target.classList.contains('pill')) {
        document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        currentCategory = e.target.dataset.category;
        triggerSearch(searchBar.value); 
    }
});

searchBar.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => triggerSearch(e.target.value), 250);
});

setInterval(checkStatus, 2000);
checkStatus();
