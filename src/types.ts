/**
 * Duo MCP Server — Core Types
 */

// ── Task Management ──

export type TaskAssignee = "human" | "ai";

export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export type SessionPhase =
  | "idle"
  | "design"
  | "planning"
  | "executing"
  | "reviewing"
  | "integrating";

export interface Task {
  id: string;
  description: string;
  assignee: TaskAssignee;
  status: TaskStatus;
  files: string[];
  reviewStatus?: "pending" | "approved" | "changes_requested";
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskBoard {
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

// ── Design Phase ──

export interface DesignDocument {
  taskDescription: string;
  agreedDesign: string;
  decisions: string[];
  deferredItems: string[];
  createdAt: string;
}

// ── Session State ──

export interface DuoSession {
  phase: SessionPhase;
  projectRoot: string;
  taskBoard: TaskBoard;
  design: DesignDocument | null;
  preferences: UserPreferences;
  startedAt: string;
  updatedAt: string;
}

// ── User Preferences ──

export interface UserPreferences {
  /** Tasks the human prefers to do (overrides heuristics) */
  humanPrefers: string[];
  /** Tasks the human wants AI to handle */
  aiPrefers: string[];
  /** Custom classification rules */
  overrides: Record<string, TaskAssignee>;
}

// ── Classification ──

export interface ClassificationResult {
  taskDescription: string;
  suggestedAssignee: TaskAssignee;
  reasoning: string;
  confidenceFactors: {
    understanding: number; // 0-1: does human learn from doing this?
    quality: number;       // 0-1: does this benefit from human judgment?
    enjoyment: number;     // 0-1: is this enjoyable to code?
    efficiency: number;    // 0-1: would AI be significantly faster?
  };
}

// ── Events ──

export type DuoEvent =
  | { type: "phase_changed"; phase: SessionPhase }
  | { type: "task_added"; task: Task }
  | { type: "task_updated"; taskId: string; changes: Partial<Task> }
  | { type: "task_reassigned"; taskId: string; from: TaskAssignee; to: TaskAssignee }
  | { type: "review_requested"; taskId: string; reviewer: TaskAssignee }
  | { type: "review_completed"; taskId: string; approved: boolean }
  | { type: "help_requested"; taskId: string; question: string }
  | { type: "file_changed"; filePath: string; taskId?: string }
  | { type: "session_completed"; summary: SessionSummary };

// ── Summary ──

export interface SessionSummary {
  totalTasks: number;
  humanTasks: number;
  aiTasks: number;
  humanLinesWritten: number;
  aiLinesWritten: number;
  reviewIterations: number;
  duration: number; // ms
}

// ── Config ──

export interface DuoConfig {
  /** Directory for .duo state files */
  stateDir: string;
  /** Whether to watch files for changes */
  watchFiles: boolean;
  /** Git integration enabled */
  gitIntegration: boolean;
  /** Patterns to ignore in file watcher */
  ignorePatterns: string[];
}

export const DEFAULT_CONFIG: DuoConfig = {
  stateDir: ".duo",
  watchFiles: true,
  gitIntegration: true,
  ignorePatterns: [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".duo",
    "*.log",
  ],
};
