/**
 * Duo Git Integration — Track commits, changes, and generate collaborative messages
 */
import type { Task } from "./types.js";
export interface GitDiff {
    filePath: string;
    additions: number;
    deletions: number;
}
export interface GitStatus {
    modified: string[];
    added: string[];
    deleted: string[];
    untracked: string[];
}
export declare class DuoGit {
    private cwd;
    constructor(projectRoot: string);
    /**
     * Check if the project is a git repository
     */
    isGitRepo(): Promise<boolean>;
    /**
     * Get current branch name
     */
    getCurrentBranch(): Promise<string>;
    /**
     * Get file-level diff stats (additions/deletions per file)
     */
    getDiffStats(staged?: boolean): Promise<GitDiff[]>;
    /**
     * Get the current working tree status
     */
    getStatus(): Promise<GitStatus>;
    /**
     * Get changed files mapped to tasks
     */
    getChangesPerTask(tasks: Task[]): Promise<Map<string, GitDiff[]>>;
    /**
     * Get diff content for specific files
     */
    getFileDiff(filePath: string): Promise<string>;
    /**
     * Generate a collaborative commit message
     */
    generateCommitMessage(taskDescription: string, tasks: Task[]): string;
    /**
     * Get line count summary per assignee
     */
    getLineCountByAssignee(tasks: Task[]): Promise<{
        human: {
            added: number;
            deleted: number;
        };
        ai: {
            added: number;
            deleted: number;
        };
    }>;
    private run;
}
//# sourceMappingURL=git.d.ts.map