/**
 * Duo MCP Tools — Register all tool definitions
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSessionTools } from "./session.js";
import { registerTaskTools } from "./tasks.js";
import { registerReviewTools } from "./review.js";

export function registerTools(server: McpServer) {
  registerSessionTools(server);
  registerTaskTools(server);
  registerReviewTools(server);
}
