/**
 * Duo MCP Tools — Register all tool definitions
 *
 * v0.5.0: Removed memory/search tools (use claude-mem for memory layer)
 * - Removed: duo_search, duo_memory_save, duo_memory_recall
 * - Kept: duo_recover_session (checkpoint-based crash recovery)
 */
import { registerSessionTools } from "./session.js";
import { registerTaskTools } from "./tasks.js";
import { registerReviewTools } from "./review.js";
import { registerSubagentTools } from "./subagent.js";
import { registerDocumentTools } from "./document.js";
import { registerRecoverTools } from "./recover.js";
import { registerDiscoveryTools } from "./discovery.js";
export function registerTools(server) {
    registerSessionTools(server);
    registerTaskTools(server);
    registerReviewTools(server);
    registerSubagentTools(server);
    registerDocumentTools(server);
    registerRecoverTools(server);
    // Note: Memory/search handled by claude-mem plugin
    registerDiscoveryTools(server);
}
//# sourceMappingURL=index.js.map