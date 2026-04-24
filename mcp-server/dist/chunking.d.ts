export interface Chunk {
    text: string;
    tokens: number;
    index: number;
}
export declare function chunkText(text: string, targetTokens?: number): Chunk[];
export declare function validateChunks(chunks: Chunk[]): boolean;
//# sourceMappingURL=chunking.d.ts.map