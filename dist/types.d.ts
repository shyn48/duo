/**
 * Duo MCP Server — Core Types
 */
export type TaskAssignee = "human" | "ai";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type SessionPhase = "idle" | "design" | "planning" | "executing" | "reviewing" | "integrating";
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
export interface DesignDocument {
    taskDescription: string;
    agreedDesign: string;
    decisions: string[];
    deferredItems: string[];
    createdAt: string;
}
export interface DuoSession {
    phase: SessionPhase;
    projectRoot: string;
    taskBoard: TaskBoard;
    design: DesignDocument | null;
    preferences: UserPreferences;
    startedAt: string;
    updatedAt: string;
}
export interface UserPreferences {
    /** Tasks the human prefers to do (overrides heuristics) */
    humanPrefers: string[];
    /** Tasks the human wants AI to handle */
    aiPrefers: string[];
    /** Custom classification rules */
    overrides: Record<string, TaskAssignee>;
}
export interface ClassificationResult {
    taskDescription: string;
    suggestedAssignee: TaskAssignee;
    reasoning: string;
    confidenceFactors: {
        understanding: number;
        quality: number;
        enjoyment: number;
        efficiency: number;
    };
}
export type DuoEvent = {
    type: "phase_changed";
    phase: SessionPhase;
} | {
    type: "task_added";
    task: Task;
} | {
    type: "task_updated";
    taskId: string;
    changes: Partial<Task>;
} | {
    type: "task_reassigned";
    taskId: string;
    from: TaskAssignee;
    to: TaskAssignee;
} | {
    type: "review_requested";
    taskId: string;
    reviewer: TaskAssignee;
} | {
    type: "review_completed";
    taskId: string;
    approved: boolean;
} | {
    type: "help_requested";
    taskId: string;
    question: string;
} | {
    type: "file_changed";
    filePath: string;
    taskId?: string;
} | {
    type: "session_completed";
    summary: SessionSummary;
};
export interface SessionSummary {
    totalTasks: number;
    humanTasks: number;
    aiTasks: number;
    humanLinesWritten: number;
    aiLinesWritten: number;
    reviewIterations: number;
    duration: number;
}
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
export declare const DEFAULT_CONFIG: DuoConfig;
//# sourceMappingURL=types.d.ts.map