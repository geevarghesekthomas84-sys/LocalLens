const path = require('path');

module.exports = {
    // The root directory to scan/watch (Default: current project folder)
    scanPath: __dirname, // Change this to any absolute path like 'C:/Users/GG/Documents'

    // Folders to strictly skip during indexing
    ignoredDirs: ['node_modules', '.git', 'dist', 'build', '.gemini', 'tmp'],

    // Skip files larger than 10MB to maintain performance (in Bytes)
    maxFileSize: 10 * 1024 * 1024,

    // File Category Mapping for the UI filter
    categories: {
        all: [],
        pdf: ['.pdf'],
        docs: ['.docx', '.doc', '.txt', '.pdf'],
        code: ['.js', '.py', '.ts', '.html', '.css', '.json', '.c', '.cpp', '.java', '.go']
    }
};
