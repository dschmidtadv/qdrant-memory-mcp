export declare function initializeQdrant(): Promise<void>;
export interface Vector {
    id: string;
    vector: number[];
    payload: {
        project: string;
        timestamp: number;
        source: string;
        tags: string[];
        chunk_index: number;
        content: string;
    };
}
export declare function upsertVectors(vectors: Vector[]): Promise<number>;
export declare function searchVectors(query: number[], project: string, limit?: number, tags?: string[]): Promise<any[]>;
//# sourceMappingURL=qdrant.d.ts.map