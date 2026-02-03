/**
 * Session Memory System — Enable context recovery between sessions
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DuoSession, SessionSummary } from "../types.js";

const execFileAsync = promisify(execFile);

const DuoMemorySaveSchema = {
  summary: z.string().describe("Human-readable summary of the session"),
  keyLearnings: z
    .array(z.string())
    .optional()
    .describe("Important insights or decisions from this session"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags for categorizing this session (e.g., 'refactoring', 'bugfix')"),
};

const DuoMemoryRecallSchema = {
  query: z
    .string()
    .optional()
    .describe("Optional search query to find specific past sessions"),
  limit: z.number().optional().default(5).describe("Number of sessions to recall"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Filter by specific tags"),
};

interface SessionMetadata {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  phase: string;
  summary: string;
  keyLearnings?: string[];
  tags?: string[];
  stats: {
    totalTasks: number;
    completedTasks: number;
    durationMinutes: number;
  };
}

/**
 * Ensure sessions directory exists.
 */
async function ensureSessionsDir(stateDir: string): Promise<string> {
  const sessionsDir = join(stateDir, "sessions");
  if (!existsSync(sessionsDir)) {
    await mkdir(sessionsDir, { recursive: true });
  }
  return sessionsDir;
}

/**
 * Save session metadata with summary and learnings.
 */
export async function saveSessionMetadata(
  stateDir: string,
  session: DuoSession,
  summary: string,
  keyLearnings?: string[],
  tags?: string[]
): Promise<string> {
  const sessionsDir = await ensureSessionsDir(stateDir);
  
  // Generate session ID from startedAt timestamp
  const sessionId = session.startedAt.replace(/[:.]/g, "-");
  const metadataPath = join(sessionsDir, `${sessionId}.json`);

  const completedTasks = session.taskBoard.tasks.filter(
    (t) => t.status === "done"
  ).length;

  const durationMs = Date.now() - new Date(session.startedAt).getTime();
  const durationMinutes = Math.floor(durationMs / 1000 / 60);

  const metadata: SessionMetadata = {
    sessionId,
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
    phase: session.phase,
    summary,
    keyLearnings,
    tags,
    stats: {
      totalTasks: session.taskBoard.tasks.length,
      completedTasks,
      durationMinutes,
    },
  };

  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  return metadataPath;
}

/**
 * Index session artifacts with QMD for future search.
 */
async function indexSessionWithQmd(
  stateDir: string,
  sessionId: string
): Promise<void> {
  try {
    // Update QMD index to include the latest session data
    await execFileAsync("qmd", ["update"]);
    
    // Optionally embed for semantic search (can be slow, so skip for now)
    // await execFileAsync("qmd", ["embed"]);
  } catch (error: any) {
    // QMD indexing is best-effort
    console.warn("QMD indexing warning:", error.message);
  }
}

/**
 * Load session metadata files.
 */
async function loadSessionMetadata(stateDir: string): Promise<SessionMetadata[]> {
  const sessionsDir = await ensureSessionsDir(stateDir);
  
  if (!existsSync(sessionsDir)) {
    return [];
  }

  const files = await readdir(sessionsDir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const sessions: SessionMetadata[] = [];
  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(sessionsDir, file), "utf-8");
      sessions.push(JSON.parse(content));
    } catch (error) {
      // Skip malformed files
      console.warn(`Failed to parse session metadata: ${file}`);
    }
  }

  // Sort by most recent first
  sessions.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  return sessions;
}

/**
 * Filter sessions by query and tags.
 */
function filterSessions(
  sessions: SessionMetadata[],
  query?: string,
  tags?: string[]
): SessionMetadata[] {
  let filtered = sessions;

  if (tags && tags.length > 0) {
    filtered = filtered.filter((s) =>
      s.tags?.some((t) => tags.includes(t))
    );
  }

  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.summary.toLowerCase().includes(lowerQuery) ||
        s.keyLearnings?.some((l) => l.toLowerCase().includes(lowerQuery))
    );
  }

  return filtered;
}

/**
 * Format session metadata for display.
 */
function formatSessionSummary(session: SessionMetadata): string {
  const date = new Date(session.startedAt).toLocaleString();
  const tags = session.tags?.length ? ` [${session.tags.join(", ")}]` : "";
  
  let output = `📅 ${date}${tags}\n`;
  output += `📊 ${session.stats.completedTasks}/${session.stats.totalTasks} tasks completed in ${session.stats.durationMinutes}m\n`;
  output += `💭 ${session.summary}\n`;

  if (session.keyLearnings && session.keyLearnings.length > 0) {
    output += `\n🧠 Key Learnings:\n`;
    output += session.keyLearnings.map((l) => `  • ${l}`).join("\n");
  }

  return output;
}

export function registerMemoryTools(server: McpServer) {
  server.tool(
    "duo_memory_save",
    "Save current session to memory with a summary and key learnings for future recall.",
    DuoMemorySaveSchema,
    async ({ summary, keyLearnings, tags }) => {
      try {
        const stateDir = process.env.DUO_STATE_DIR || ".duo";
        
        // Load current session state
        const sessionPath = join(stateDir, "session.json");
        if (!existsSync(sessionPath)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No active session to save.",
              },
            ],
            isError: true,
          };
        }

        const sessionContent = await readFile(sessionPath, "utf-8");
        const session: DuoSession = JSON.parse(sessionContent);

        // Save metadata
        const metadataPath = await saveSessionMetadata(
          stateDir,
          session,
          summary,
          keyLearnings,
          tags
        );

        // Index with QMD for future search
        const sessionId = session.startedAt.replace(/[:.]/g, "-");
        await indexSessionWithQmd(stateDir, sessionId);

        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Session saved to memory!\n\n${formatSessionSummary({
                sessionId,
                startedAt: session.startedAt,
                endedAt: new Date().toISOString(),
                phase: session.phase,
                summary,
                keyLearnings,
                tags,
                stats: {
                  totalTasks: session.taskBoard.tasks.length,
                  completedTasks: session.taskBoard.tasks.filter(
                    (t) => t.status === "done"
                  ).length,
                  durationMinutes: Math.floor(
                    (Date.now() - new Date(session.startedAt).getTime()) / 1000 / 60
                  ),
                },
              })}\n\nMetadata saved to: ${metadataPath}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to save session: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "duo_memory_recall",
    "Recall previous Duo sessions to restore context. Filter by query or tags.",
    DuoMemoryRecallSchema,
    async ({ query, limit, tags }) => {
      try {
        const stateDir = process.env.DUO_STATE_DIR || ".duo";
        
        // Load all session metadata
        const sessions = await loadSessionMetadata(stateDir);

        if (sessions.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No previous sessions found. Start a new session with duo_session_start.",
              },
            ],
          };
        }

        // Filter sessions
        const filtered = filterSessions(sessions, query, tags);
        const results = filtered.slice(0, limit);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No sessions found matching criteria. Total sessions: ${sessions.length}`,
              },
            ],
          };
        }

        // Format results
        const formattedResults = results
          .map((s, idx) => `\n[${idx + 1}]\n${formatSessionSummary(s)}`)
          .join("\n\n---\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `📚 Found ${results.length} previous session(s):\n${formattedResults}\n\nUse duo_search to search specific session content.`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to recall sessions: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
