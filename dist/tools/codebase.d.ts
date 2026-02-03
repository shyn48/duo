/**
 * Codebase Knowledge Management — Persistent architecture/pattern documentation
 */
/**
 * Read CODEBASE.md from .duo directory. Creates template if doesn't exist.
 */
export declare function readCodebaseKnowledge(stateDir: string): Promise<{
    content: string;
    isNew: boolean;
}>;
/**
 * Append updates to CODEBASE.md
 */
export declare function appendCodebaseKnowledge(stateDir: string, updates: {
    architecture?: string;
    patterns?: string[];
    files?: {
        path: string;
        purpose: string;
    }[];
    gotchas?: string[];
    conventions?: string[];
}): Promise<string>;
//# sourceMappingURL=codebase.d.ts.map