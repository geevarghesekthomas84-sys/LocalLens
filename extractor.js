const fs = require('fs-extra');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');

/**
 * Identify extension and extract text contents.
 */
async function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    try {
        switch (ext) {
            case '.pdf':
                return await extractPDF(filePath);
            case '.docx':
                return await extractDocx(filePath);
            case '.txt':
            case '.md':
            case '.js':
            case '.py':
            case '.html':
            case '.css':
            case '.json':
            case '.ts':
                return await extractPlain(filePath);
            default:
                return ''; // Ignore binaries and other types
        }
    } catch (err) {
        console.error(`[Extractor] Skipped ${filePath}:`, err.message);
        return '';
    }
}

async function extractPDF(filePath) {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    return data.text || '';
}

async function extractDocx(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
}

async function extractPlain(filePath) {
    return await fs.readFile(filePath, 'utf8');
}

module.exports = {
    extractText
};
