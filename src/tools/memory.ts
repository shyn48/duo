/**
 * Session Memory Utilities — Archive session metadata for future reference
 * 
 * v0.5.0: MCP tools removed (use claude-mem for memory layer)
 * - Kept: saveSessionMetadata (used by duo_session_end for archiving)
 * - Removed: duo_memory_save, duo_memory_recall tools
 */

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DuoSession } from "../types.js";

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
 * Called by duo_session_end to archive completed sessions.
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
 * Load past session metadata (for internal use, e.g., session start context).
 */
export async function loadPastSessions(stateDir: string, limit = 5): Promise<SessionMetadata[]> {
  const sessionsDir = join(stateDir, "sessions");
  
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
    }
  }

  // Sort by most recent first and limit
  sessions.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  return sessions.slice(0, limit);
}

/**
 * Format a session summary for display.
 */
export function formatSessionSummary(session: SessionMetadata): string {
  const date = new Date(session.startedAt).toLocaleString();
  const tags = session.tags?.length ? ` [${session.tags.join(", ")}]` : "";
  
  let output = `📅 ${date}${tags}\n`;
  output += `📊 ${session.stats.completedTasks}/${session.stats.totalTasks} tasks completed in ${session.stats.durationMinutes}m\n`;
  output += `💭 ${session.summary}`;

  if (session.keyLearnings && session.keyLearnings.length > 0) {
    output += `\n🧠 Key Learnings:\n`;
    output += session.keyLearnings.map((l) => `  • ${l}`).join("\n");
  }

  return output;
}
