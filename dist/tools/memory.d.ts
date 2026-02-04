/**
 * Session Memory Utilities — Archive session metadata for future reference
 *
 * v0.5.0: MCP tools removed (use claude-mem for memory layer)
 * - Kept: saveSessionMetadata (used by duo_session_end for archiving)
 * - Removed: duo_memory_save, duo_memory_recall tools
 */
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
 * Save session metadata with summary and learnings.
 * Called by duo_session_end to archive completed sessions.
 */
export declare function saveSessionMetadata(stateDir: string, session: DuoSession, summary: string, keyLearnings?: string[], tags?: string[]): Promise<string>;
/**
 * Load past session metadata (for internal use, e.g., session start context).
 */
export declare function loadPastSessions(stateDir: string, limit?: number): Promise<SessionMetadata[]>;
/**
 * Format a session summary for display.
 */
export declare function formatSessionSummary(session: SessionMetadata): string;
export {};
//# sourceMappingURL=memory.d.ts.map