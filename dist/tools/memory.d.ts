/**
 * Session Memory System — Enable context recovery between sessions
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DuoSession } from "../types.js";
/**
 * Save session metadata with summary and learnings.
 */
export declare function saveSessionMetadata(stateDir: string, session: DuoSession, summary: string, keyLearnings?: string[], tags?: string[]): Promise<string>;
export declare function registerMemoryTools(server: McpServer): void;
//# sourceMappingURL=memory.d.ts.map