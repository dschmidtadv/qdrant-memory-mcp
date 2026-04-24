"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmbedding = getEmbedding;
exports.validateEmbedding = validateEmbedding;
const axios_1 = __importDefault(require("axios"));
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const metrics_js_1 = require("./metrics.js");
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'nomic-embed-text:latest';
const NODE_ENV = process.env.NODE_ENV || 'local';
async function getEmbedding(text) {
    if (NODE_ENV === 'local') {
        return getOllamaEmbedding(text);
    }
    else {
        return getBedrockEmbedding(text);
    }
}
async function getOllamaEmbedding(text) {
    const timer = metrics_js_1.embeddingDuration.startTimer({ provider: 'ollama' });
    try {
        const response = await axios_1.default.post(`${OLLAMA_URL}/api/embeddings`, {
            model: OLLAMA_MODEL,
            prompt: text
        });
        return response.data.embedding;
    }
    catch (error) {
        console.error('Ollama embedding failed:', error);
        throw new Error('Failed to generate embedding');
    }
    finally {
        timer();
    }
}
async function getBedrockEmbedding(text) {
    const timer = metrics_js_1.embeddingDuration.startTimer({ provider: 'bedrock' });
    const client = new client_bedrock_runtime_1.BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const model = process.env.AWS_BEDROCK_MODEL || 'amazon.titan-embed-text-v2:0';
    try {
        const command = new client_bedrock_runtime_1.InvokeModelCommand({
            modelId: model,
            body: JSON.stringify({ inputText: text })
        });
        const response = await client.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.body));
        // Normalize 1024-dim to 768-dim (truncate)
        return result.embedding.slice(0, 768);
    }
    catch (error) {
        console.error('Bedrock embedding failed:', error);
        throw new Error('Failed to generate embedding');
    }
    finally {
        timer();
    }
}
function validateEmbedding(embedding) {
    return embedding.length === 768 && embedding.every(v => typeof v === 'number');
}
//# sourceMappingURL=embedding.js.map