
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'project_codebase.json');

const IGNORED_DIRS = [
    'node_modules',
    '.git',
    '.gemini',
    'dist',
    'logs',
    'data',
    'coverage',
    '.DS_Store'
];

const IGNORED_FILES = [
    '.env',
    'project_codebase.json',
    'package-lock.json',
    '.DS_Store',
    'server.log',
    'ps.txt',
    'test-results.txt',
    'ngrok.log'
];

// File extensions to include (to avoid binary files)
const INCLUDED_EXTENSIONS = [
    '.js',
    '.json',
    '.md',
    '.html',
    '.css',
    '.txt',
    '.gitignore',
    '.env.example'
];

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || {};

    files.forEach(function (file) {
        if (IGNORED_DIRS.includes(file) || IGNORED_FILES.includes(file)) {
            return;
        }

        const fullPath = path.join(dirPath, file);

        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            const ext = path.extname(file);
            if (INCLUDED_EXTENSIONS.includes(ext) || file.startsWith('.')) {
                // Read file content
                try {
                    // Skip if file is too large (> 1MB)
                    const stats = fs.statSync(fullPath);
                    if (stats.size > 1024 * 1024) {
                        console.warn(`Skipping large file: ${file}`);
                        return;
                    }

                    const content = fs.readFileSync(fullPath, 'utf8');
                    const relativePath = path.relative(ROOT_DIR, fullPath);
                    arrayOfFiles[relativePath] = content;
                } catch (e) {
                    console.error(`Error reading ${file}:`, e.message);
                }
            }
        }
    });

    return arrayOfFiles;
}

console.log('📦 Starting codebase export...');
const codebase = getAllFiles(ROOT_DIR);
const jsonContent = JSON.stringify(codebase, null, 2);

fs.writeFileSync(OUTPUT_FILE, jsonContent);
console.log(`✅ Codebase exported to: ${OUTPUT_FILE}`);
console.log(`Total files: ${Object.keys(codebase).length}`);
console.log(`Size: ${(jsonContent.length / 1024).toFixed(2)} KB`);
