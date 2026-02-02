#!/usr/bin/env node
/**
 * Duo MCP Server — Collaborative Pair Programming
 *
 * Provides MCP tools and resources for the Duo workflow:
 * design → plan → execute → review → integrate
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources.js";
async function main() {
    const server = new McpServer({
        name: "duo",
        version: "0.1.0",
    });
    // Register all tools and resources
    registerTools(server);
    registerResources(server);
    // Start server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Duo MCP server running on stdio");
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map