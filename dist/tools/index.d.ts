/**
 * Duo MCP Tools — Register all tool definitions
 *
 * v0.5.0: Removed memory/search tools (use claude-mem for memory layer)
 * - Removed: duo_search, duo_memory_save, duo_memory_recall
 * - Kept: duo_recover_session (checkpoint-based crash recovery)
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerTools(server: McpServer): void;
//# sourceMappingURL=index.d.ts.map