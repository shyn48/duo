/**
 * Task management tools — add, update, view, help
 *
 * v0.5.0: Consolidated tools
 * - Merged duo_task_add + duo_task_add_bulk → duo_task_add (accepts single or array)
 * - Merged duo_task_update + duo_task_reassign → duo_task_update (status and/or assignee)
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerTaskTools(server: McpServer): void;
//# sourceMappingURL=tasks.d.ts.map