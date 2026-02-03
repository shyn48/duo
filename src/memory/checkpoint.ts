/**
 * Session Memory Checkpoints — periodic state snapshots for crash recovery
 */

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  SessionPhase,
  Task,
  DesignDocument,
  SubagentInfo,
} from "../types.js";

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
export async function ensureMemoryDir(stateDir: string): Promise<string> {
  const memoryDir = join(stateDir, "memory");
  if (!existsSync(memoryDir)) {
    await mkdir(memoryDir, { recursive: true });
  }
  return memoryDir;
}

/**
 * Write a checkpoint snapshot to .duo/memory/checkpoint-{timestamp}.jsonl
 */
export async function writeCheckpoint(
  stateDir: string,
  data: {
    phase: SessionPhase;
    tasks: Task[];
    design: DesignDocument | null;
    subagents: SubagentInfo[];
    context?: string;
  },
): Promise<string> {
  const memoryDir = await ensureMemoryDir(stateDir);
  const timestamp = new Date().toISOString();

  // Extract decisions from design
  const decisions = data.design?.decisions ?? [];

  // Extract modified files from tasks
  const filesModified = Array.from(
    new Set(data.tasks.flatMap((t) => t.files)),
  );

  const checkpoint: Checkpoint = {
    timestamp,
    phase: data.phase,
    tasks: data.tasks,
    design: data.design,
    subagents: data.subagents,
    decisions,
    filesModified,
    context: data.context ?? "",
  };

  // Use a filesystem-safe timestamp for the filename
  const safeTimestamp = timestamp.replace(/[:.]/g, "-");
  const filename = `checkpoint-${safeTimestamp}.jsonl`;
  const filePath = join(memoryDir, filename);

  await writeFile(filePath, JSON.stringify(checkpoint) + "\n");
  return filename;
}

/**
 * List all available checkpoint files, sorted newest first.
 */
export async function listCheckpoints(
  stateDir: string,
): Promise<string[]> {
  const memoryDir = join(stateDir, "memory");
  if (!existsSync(memoryDir)) return [];

  const files = await readdir(memoryDir);
  return files
    .filter((f) => f.startsWith("checkpoint-") && f.endsWith(".jsonl"))
    .sort()
    .reverse();
}

/**
 * Read the most recent checkpoint, or null if none exist.
 */
export async function readLatestCheckpoint(
  stateDir: string,
): Promise<Checkpoint | null> {
  const files = await listCheckpoints(stateDir);
  if (files.length === 0) return null;

  const memoryDir = join(stateDir, "memory");
  const content = await readFile(join(memoryDir, files[0]), "utf-8");
  const line = content.trim().split("\n")[0];
  return JSON.parse(line) as Checkpoint;
}
