/**
 * Duo MCP Tools — Register all tool definitions
 */
import { registerSessionTools } from "./session.js";
import { registerTaskTools } from "./tasks.js";
import { registerReviewTools } from "./review.js";
import { registerSubagentTools } from "./subagent.js";
import { registerDocumentTools } from "./document.js";
import { registerRecoverTools } from "./recover.js";
import { registerSearchTools } from "./search.js";
import { registerMemoryTools } from "./memory.js";
import { registerDiscoveryTools } from "./discovery.js";
export function registerTools(server) {
    registerSessionTools(server);
    registerTaskTools(server);
    registerReviewTools(server);
    registerSubagentTools(server);
    registerDocumentTools(server);
    registerRecoverTools(server);
    registerSearchTools(server);
    registerMemoryTools(server);
    registerDiscoveryTools(server);
}
//# sourceMappingURL=index.js.map