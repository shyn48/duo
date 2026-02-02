/**
 * Duo MCP Resources — Expose session state to clients
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DuoState } from "./state.js";
export declare function setStateInstance(state: DuoState): void;
/**
 * Get the state instance, auto-loading from disk if needed.
 * This supports stateless/per-call usage (e.g. mcporter --stdio)
 * by reading from .duo/session.json when the singleton isn't set.
 */
export declare function getStateInstanceAutoLoad(): Promise<DuoState | null>;
/** Sync getter — returns null if not loaded yet (for backward compat) */
export declare function getStateInstance(): DuoState | null;
export declare function registerResources(server: McpServer): void;
//# sourceMappingURL=resources.d.ts.map