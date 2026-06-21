import { LiteParse } from '@llamaindex/liteparse';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// PDF is at doc-search-app/_local_debug/sample_file/sample.pdf
// This script lives at doc-search-app/document_extraction/LiteParseLib/
const pdfPath = join(__dirname, '../../_local_debug/sample_file/sample.pdf');
const outputPath = join(__dirname, 'result.md');

const parser = new LiteParse({
    ocrEnabled: true,              // Enable OCR (default: true)
    ocrLanguage: 'eng',           // Tesseract language code
    ocrServerUrl: undefined,       // HTTP OCR server URL (optional)
    tessdataPath: undefined,       // Path to tessdata directory (optional)
    maxPages: 1000,                // Max pages to parse
    //targetPages: '1-5,10',        // Specific pages (optional)
    dpi: 150,                      // Rendering DPI
    outputFormat: 'markdown',      // "json" | "text" | "markdown"
    imageMode: 'placeholder',      // Markdown image handling: "placeholder" | "off" | "embed"
    extractLinks: true,            // Render [text](url) links in markdown output
    preserveVerySmallText: true,  // Keep tiny text
    password: undefined,           // Password for protected documents
    quiet: false,                  // Suppress progress output
    numWorkers: 4,                 // Concurrent OCR workers
});

console.log(`Parsing PDF: ${pdfPath}`);
const result = await parser.parse(pdfPath);

// Save markdown result to file
writeFileSync(outputPath, result.text, 'utf-8');
console.log(`\nMarkdown result saved to: ${outputPath}`);
console.log('\n--- Preview (first 500 chars) ---');
console.log(result.text.slice(0, 500));