/**
 * Duo MCP Tools — Register all tool definitions
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSessionTools } from "./session.js";
import { registerTaskTools } from "./tasks.js";
import { registerReviewTools } from "./review.js";
import { registerSubagentTools } from "./subagent.js";
import { registerDocumentTools } from "./document.js";
import { registerRecoverTools } from "./recover.js";
import { registerSearchTools } from "./search.js";
import { registerMemoryTools } from "./memory.js";
import { registerDiscoveryTools } from "./discovery.js";
import { registerSnapshotTools } from "./snapshot.js";

export function registerTools(server: McpServer) {
  registerSessionTools(server);
  registerTaskTools(server);
  registerReviewTools(server);
  registerSubagentTools(server);
  registerDocumentTools(server);
  registerRecoverTools(server);
  registerSearchTools(server);
  registerMemoryTools(server);
  registerDiscoveryTools(server);
  registerSnapshotTools(server);
}
