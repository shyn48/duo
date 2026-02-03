/**
 * QMD Search Integration — Semantic search over session context
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const DuoSearchSchema = {
  query: z.string().describe("Search query for session context"),
  mode: z
    .enum(["keyword", "semantic"])
    .default("keyword")
    .describe("Search mode: 'keyword' for fast BM25, 'semantic' for vector search"),
  limit: z.number().optional().default(5).describe("Number of results to return"),
  collection: z
    .string()
    .optional()
    .describe("Specific QMD collection to search (defaults to duo-session)"),
};

interface SearchResult {
  path: string;
  score: number;
  excerpt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Execute QMD search and parse results.
 */
async function executeQmdSearch(
  query: string,
  mode: "keyword" | "semantic",
  limit: number,
  collection?: string
): Promise<SearchResult[]> {
  try {
    const args = [
      mode === "semantic" ? "vsearch" : "search",
      query,
      "-n",
      String(limit),
      "--json",
    ];

    if (collection) {
      args.push("-c", collection);
    }

    const { stdout } = await execFileAsync("qmd", args);
    
    if (!stdout.trim()) {
      return [];
    }

    const results = JSON.parse(stdout);
    
    // QMD returns different formats depending on the mode
    // Normalize to our SearchResult format
    if (Array.isArray(results)) {
      return results.map((r: any) => ({
        path: r.path || r.file || "",
        score: r.score || r.similarity || 0,
        excerpt: r.excerpt || r.content || "",
        metadata: r.metadata || {},
      }));
    }

    return [];
  } catch (error: any) {
    // QMD not installed or collection doesn't exist
    if (error.code === "ENOENT") {
      throw new Error(
        "QMD is not installed. Install with: bun install -g https://github.com/tobi/qmd"
      );
    }
    throw error;
  }
}

/**
 * Ensure QMD collection for current session exists.
 */
async function ensureCollection(stateDir: string, sessionId: string): Promise<void> {
  const chatDir = join(stateDir, "chat");
  const docsDir = join(stateDir, "docs");
  
  if (!existsSync(chatDir) && !existsSync(docsDir)) {
    // No content to index yet
    return;
  }

  try {
    // Check if collection exists
    const { stdout } = await execFileAsync("qmd", ["collection", "list", "--json"]);
    const collections = JSON.parse(stdout || "[]");
    
    const collectionName = `duo-session`;
    const exists = collections.some((c: any) => c.name === collectionName);

    if (!exists && existsSync(chatDir)) {
      // Create collection for chat history
      await execFileAsync("qmd", [
        "collection",
        "add",
        chatDir,
        "--name",
        collectionName,
        "--mask",
        "**/*.jsonl",
      ]);
      
      // Initial indexing
      await execFileAsync("qmd", ["update"]);
    }

    // Add docs directory if it exists and isn't indexed
    if (existsSync(docsDir)) {
      const docsCollectionName = `duo-docs`;
      const docsExists = collections.some((c: any) => c.name === docsCollectionName);
      
      if (!docsExists) {
        await execFileAsync("qmd", [
          "collection",
          "add",
          docsDir,
          "--name",
          docsCollectionName,
          "--mask",
          "**/*.md",
        ]);
        await execFileAsync("qmd", ["update"]);
      }
    }
  } catch (error: any) {
    // Collection operations can fail silently
    console.warn("QMD collection setup warning:", error.message);
  }
}

export function registerSearchTools(server: McpServer) {
  server.tool(
    "duo_search",
    "Search session context (chat history, documents) using QMD. Use keyword mode for fast searches, semantic mode for conceptual similarity.",
    DuoSearchSchema,
    async ({ query, mode, limit, collection }) => {
      try {
        // Get state directory from server context
        const stateDir = process.env.DUO_STATE_DIR || ".duo";
        const sessionId = process.env.DUO_SESSION_ID || "current";

        // Ensure QMD collection is set up
        await ensureCollection(stateDir, sessionId);

        // Execute search
        const results = await executeQmdSearch(
          query,
          mode,
          limit,
          collection || "duo-session"
        );

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No results found for query: "${query}"`,
              },
            ],
          };
        }

        // Format results as readable text
        const formattedResults = results
          .map((r, idx) => {
            return `[${idx + 1}] ${r.path} (score: ${r.score.toFixed(3)})\n${r.excerpt}\n`;
          })
          .join("\n---\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.length} results for "${query}":\n\n${formattedResults}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Search failed: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
