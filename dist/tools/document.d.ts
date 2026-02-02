/**
 * Document storage tools — auto-store docs in .duo/docs/
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Ensure the .duo/docs/ directory exists.
 */
export declare function ensureDocsDir(stateDir: string): Promise<string>;
/**
 * Save a document to .duo/docs/ programmatically.
 * Used internally by other tools (design save, integration, etc.).
 */
export declare function saveDocument(stateDir: string, opts: {
    title: string;
    content: string;
    phase: string;
    category?: string;
}): Promise<string>;
export declare function registerDocumentTools(server: McpServer): void;
//# sourceMappingURL=document.d.ts.map