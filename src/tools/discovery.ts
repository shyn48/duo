/**
 * Discovery Collection — Capture codebase insights during session
 * 
 * v0.5.0: Consolidated duo_note_discovery + duo_list_discoveries → duo_discovery
 * 
 * Agents call duo_discovery to note patterns, gotchas, etc.
 * These are stored and presented at session end for inclusion in CODEBASE.md.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getStateInstanceAutoLoad } from "../resources.js";

export type DiscoveryType = "pattern" | "gotcha" | "architecture" | "file" | "convention";

export interface Discovery {
  type: DiscoveryType;
  content: string;
  filePath?: string;
  timestamp: string;
}

interface DiscoveryStore {
  discoveries: Discovery[];
  sessionStartedAt: string;
}

const DISCOVERIES_FILE = "discoveries.json";

/**
 * Read discoveries from .duo/discoveries.json
 */
export async function readDiscoveries(stateDir: string): Promise<Discovery[]> {
  const path = join(stateDir, DISCOVERIES_FILE);
  if (!existsSync(path)) {
    return [];
  }
  try {
    const data = await readFile(path, "utf-8");
    const store: DiscoveryStore = JSON.parse(data);
    return store.discoveries || [];
  } catch {
    return [];
  }
}

/**
 * Save a discovery to .duo/discoveries.json
 */
export async function saveDiscovery(
  stateDir: string,
  discovery: Discovery,
  sessionStartedAt: string
): Promise<void> {
  const path = join(stateDir, DISCOVERIES_FILE);
  
  let store: DiscoveryStore;
  if (existsSync(path)) {
    try {
      const data = await readFile(path, "utf-8");
      store = JSON.parse(data);
      // Reset if from a different session
      if (store.sessionStartedAt !== sessionStartedAt) {
        store = { discoveries: [], sessionStartedAt };
      }
    } catch {
      store = { discoveries: [], sessionStartedAt };
    }
  } else {
    store = { discoveries: [], sessionStartedAt };
  }
  
  store.discoveries.push(discovery);
  await writeFile(path, JSON.stringify(store, null, 2));
}

/**
 * Clear discoveries (called after session end)
 */
export async function clearDiscoveries(stateDir: string): Promise<void> {
  const path = join(stateDir, DISCOVERIES_FILE);
  if (existsSync(path)) {
    await writeFile(path, JSON.stringify({ discoveries: [], sessionStartedAt: "" }, null, 2));
  }
}

/**
 * Format discoveries for display
 */
export function formatDiscoveries(discoveries: Discovery[]): string {
  if (discoveries.length === 0) {
    return "No discoveries collected this session.";
  }
  
  const icons: Record<DiscoveryType, string> = {
    pattern: "🔄",
    gotcha: "⚠️",
    architecture: "🏗️",
    file: "📄",
    convention: "📏",
  };
  
  const lines = discoveries.map((d) => {
    const icon = icons[d.type] || "📝";
    const fileNote = d.filePath ? ` (${d.filePath})` : "";
    return `${icon} [${d.type}] ${d.content}${fileNote}`;
  });
  
  return lines.join("\n");
}

/**
 * Convert discoveries to codebaseUpdates format
 */
export function discoveriesToCodebaseUpdates(discoveries: Discovery[]): {
  patterns?: string[];
  gotchas?: string[];
  architecture?: string;
  files?: { path: string; purpose: string }[];
  conventions?: string[];
} {
  const updates: {
    patterns?: string[];
    gotchas?: string[];
    architecture?: string;
    files?: { path: string; purpose: string }[];
    conventions?: string[];
  } = {};
  
  for (const d of discoveries) {
    switch (d.type) {
      case "pattern":
        updates.patterns = updates.patterns || [];
        updates.patterns.push(d.content);
        break;
      case "gotcha":
        updates.gotchas = updates.gotchas || [];
        updates.gotchas.push(d.content);
        break;
      case "architecture":
        updates.architecture = updates.architecture 
          ? `${updates.architecture}\n${d.content}`
          : d.content;
        break;
      case "file":
        if (d.filePath) {
          updates.files = updates.files || [];
          updates.files.push({ path: d.filePath, purpose: d.content });
        }
        break;
      case "convention":
        updates.conventions = updates.conventions || [];
        updates.conventions.push(d.content);
        break;
    }
  }
  
  return updates;
}

export function registerDiscoveryTools(server: McpServer) {
  // ── Combined discovery tool: add or list ──
  server.tool(
    "duo_discovery",
    "Note a codebase discovery OR list all discoveries. Call immediately when you discover patterns, gotchas, important files, or conventions. Use action='list' to see all discoveries.",
    {
      action: z
        .enum(["add", "list"])
        .default("add")
        .describe("'add' to note a new discovery, 'list' to see all discoveries"),
      type: z
        .enum(["pattern", "gotcha", "architecture", "file", "convention"])
        .optional()
        .describe("Type of discovery (required for action='add')"),
      content: z
        .string()
        .optional()
        .describe("Description of what you discovered (required for action='add')"),
      filePath: z
        .string()
        .optional()
        .describe("Relevant file path (required for type='file', optional for others)"),
    },
    async ({ action, type, content, filePath }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [{ type: "text" as const, text: "No active Duo session. Start one with duo_session_start." }],
        };
      }
      
      // List mode
      if (action === "list") {
        const discoveries = await readDiscoveries(state.getStateDir());
        return {
          content: [{
            type: "text" as const,
            text: `📝 Discoveries this session: ${discoveries.length}\n\n${formatDiscoveries(discoveries)}`,
          }],
        };
      }
      
      // Add mode - validate required fields
      if (!type || !content) {
        return {
          content: [{ type: "text" as const, text: "For action='add', both 'type' and 'content' are required." }],
          isError: true,
        };
      }
      
      const discovery: Discovery = {
        type: type as DiscoveryType,
        content,
        filePath,
        timestamp: new Date().toISOString(),
      };
      
      const session = state.getSession();
      await saveDiscovery(state.getStateDir(), discovery, session.startedAt);
      
      // Also log to chat for recovery
      await state.logChat("system", "event", `Discovery noted: [${type}] ${content}`);
      
      const icons: Record<string, string> = {
        pattern: "🔄",
        gotcha: "⚠️",
        architecture: "🏗️",
        file: "📄",
        convention: "📏",
      };
      
      return {
        content: [{
          type: "text" as const,
          text: `${icons[type]} Discovery noted: [${type}] ${content}\n\nThis will be suggested for CODEBASE.md at session end.`,
        }],
      };
    },
  );
}
