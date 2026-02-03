/**
 * Session Memory Checkpoints — periodic state snapshots for crash recovery
 */
import type { SessionPhase, Task, DesignDocument, SubagentInfo } from "../types.js";
export interface Checkpoint {
    timestamp: string;
    phase: SessionPhase;
    tasks: Task[];
    design: DesignDocument | null;
    subagents: SubagentInfo[];
    decisions: string[];
    filesModified: string[];
    context: string;
}
/**
 * Ensure the .duo/memory/ directory exists.
 */
export declare function ensureMemoryDir(stateDir: string): Promise<string>;
/**
 * Write a checkpoint snapshot to .duo/memory/checkpoint-{timestamp}.jsonl
 */
export declare function writeCheckpoint(stateDir: string, data: {
    phase: SessionPhase;
    tasks: Task[];
    design: DesignDocument | null;
    subagents: SubagentInfo[];
    context?: string;
}): Promise<string>;
/**
 * List all available checkpoint files, sorted newest first.
 */
export declare function listCheckpoints(stateDir: string): Promise<string[]>;
/**
 * Read the most recent checkpoint, or null if none exist.
 */
export declare function readLatestCheckpoint(stateDir: string): Promise<Checkpoint | null>;
//# sourceMappingURL=checkpoint.d.ts.map