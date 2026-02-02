/**
 * Duo MCP Tools — Register all tool definitions
 */
import { registerSessionTools } from "./session.js";
import { registerTaskTools } from "./tasks.js";
import { registerReviewTools } from "./review.js";
export function registerTools(server) {
    registerSessionTools(server);
    registerTaskTools(server);
    registerReviewTools(server);
}
//# sourceMappingURL=index.js.map