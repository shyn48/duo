/**
 * Discovery Collection — Capture codebase insights during session
 *
 * v0.5.0: Consolidated duo_note_discovery + duo_list_discoveries → duo_discovery
 *
 * Agents call duo_discovery to note patterns, gotchas, etc.
 * These are stored and presented at session end for inclusion in CODEBASE.md.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export type DiscoveryType = "pattern" | "gotcha" | "architecture" | "file" | "convention";
export interface Discovery {
    type: DiscoveryType;
    content: string;
    filePath?: string;
    timestamp: string;
}
/**
 * Read discoveries from .duo/discoveries.json
 */
export declare function readDiscoveries(stateDir: string): Promise<Discovery[]>;
/**
 * Save a discovery to .duo/discoveries.json
 */
export declare function saveDiscovery(stateDir: string, discovery: Discovery, sessionStartedAt: string): Promise<void>;
/**
 * Clear discoveries (called after session end)
 */
export declare function clearDiscoveries(stateDir: string): Promise<void>;
/**
 * Format discoveries for display
 */
export declare function formatDiscoveries(discoveries: Discovery[]): string;
/**
 * Convert discoveries to codebaseUpdates format
 */
export declare function discoveriesToCodebaseUpdates(discoveries: Discovery[]): {
    patterns?: string[];
    gotchas?: string[];
    architecture?: string;
    files?: {
        path: string;
        purpose: string;
    }[];
    conventions?: string[];
};
export declare function registerDiscoveryTools(server: McpServer): void;
//# sourceMappingURL=discovery.d.ts.map