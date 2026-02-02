/**
 * Duo File Watcher — Detects human code changes and maps to tasks
 */
import type { DuoConfig, Task } from "./types.js";
export interface FileChange {
    filePath: string;
    relativePath: string;
    eventType: "rename" | "change";
    timestamp: string;
    matchedTaskId?: string;
}
export type FileChangeCallback = (change: FileChange) => void;
export declare class DuoWatcher {
    private watchers;
    private projectRoot;
    private config;
    private callbacks;
    private debounceTimers;
    private debounceMs;
    private running;
    constructor(projectRoot: string, config: DuoConfig);
    /**
     * Register a callback for file changes
     */
    onChange(callback: FileChangeCallback): void;
    /**
     * Start watching the project directory
     */
    start(): Promise<void>;
    /**
     * Stop watching
     */
    stop(): void;
    /**
     * Check if a file change matches any task by file path
     */
    matchTask(filePath: string, tasks: Task[]): Task | undefined;
    private handleChange;
    private emitChange;
    private shouldIgnore;
    private watchDirectoriesRecursive;
}
//# sourceMappingURL=watcher.d.ts.map