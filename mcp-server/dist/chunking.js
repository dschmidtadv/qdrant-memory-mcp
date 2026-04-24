"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunkText = chunkText;
exports.validateChunks = validateChunks;
const js_tiktoken_1 = require("js-tiktoken");
const enc = (0, js_tiktoken_1.encodingForModel)('gpt-3.5-turbo');
function chunkText(text, targetTokens = 768) {
    // Split on semantic boundaries
    const paragraphs = text.split(/\n\n+/);
    const chunks = [];
    let currentChunk = '';
    let chunkIndex = 0;
    for (const paragraph of paragraphs) {
        const tokens = enc.encode(currentChunk + paragraph).length;
        if (tokens > targetTokens && currentChunk) {
            // Save current chunk
            chunks.push({
                text: currentChunk.trim(),
                tokens: enc.encode(currentChunk).length,
                index: chunkIndex++
            });
            // Start new chunk with overlap (15%)
            const overlapTokens = Math.floor(targetTokens * 0.15);
            const overlapText = currentChunk.slice(-Math.floor(currentChunk.length * 0.15));
            currentChunk = overlapText + paragraph;
        }
        else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
    }
    // Add final chunk
    if (currentChunk.trim()) {
        chunks.push({
            text: currentChunk.trim(),
            tokens: enc.encode(currentChunk).length,
            index: chunkIndex
        });
    }
    return chunks;
}
function validateChunks(chunks) {
    return chunks.every(chunk => {
        const tokens = chunk.tokens;
        return tokens >= 512 && tokens <= 1024;
    });
}
//# sourceMappingURL=chunking.js.map