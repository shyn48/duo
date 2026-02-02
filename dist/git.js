/**
 * Duo Git Integration — Track commits, changes, and generate collaborative messages
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export class DuoGit {
    cwd;
    constructor(projectRoot) {
        this.cwd = projectRoot;
    }
    /**
     * Check if the project is a git repository
     */
    async isGitRepo() {
        try {
            await this.run("rev-parse", "--is-inside-work-tree");
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get current branch name
     */
    async getCurrentBranch() {
        const result = await this.run("rev-parse", "--abbrev-ref", "HEAD");
        return result.trim();
    }
    /**
     * Get file-level diff stats (additions/deletions per file)
     */
    async getDiffStats(staged = false) {
        const args = ["diff", "--numstat"];
        if (staged)
            args.push("--staged");
        const result = await this.run(...args);
        if (!result.trim())
            return [];
        return result
            .trim()
            .split("\n")
            .map((line) => {
            const [add, del, file] = line.split("\t");
            return {
                filePath: file,
                additions: add === "-" ? 0 : parseInt(add, 10),
                deletions: del === "-" ? 0 : parseInt(del, 10),
            };
        });
    }
    /**
     * Get the current working tree status
     */
    async getStatus() {
        const result = await this.run("status", "--porcelain");
        const status = {
            modified: [],
            added: [],
            deleted: [],
            untracked: [],
        };
        if (!result.trim())
            return status;
        for (const line of result.trim().split("\n")) {
            // Porcelain format varies: "XY path" or "X  path"
            // Safely extract status chars and filename
            const trimmed = line.trimStart();
            const spaceIdx = trimmed.indexOf(" ");
            if (spaceIdx === -1)
                continue;
            const statusChars = line.substring(0, line.length - trimmed.length + spaceIdx);
            const filePath = trimmed.substring(spaceIdx + 1);
            if (!filePath)
                continue;
            if (statusChars.includes("M"))
                status.modified.push(filePath);
            else if (statusChars.includes("A"))
                status.added.push(filePath);
            else if (statusChars.includes("D"))
                status.deleted.push(filePath);
            else if (statusChars.includes("?"))
                status.untracked.push(filePath);
        }
        return status;
    }
    /**
     * Get changed files mapped to tasks
     */
    async getChangesPerTask(tasks) {
        const diffs = await this.getDiffStats();
        const taskChanges = new Map();
        for (const diff of diffs) {
            const matchedTask = tasks.find((t) => t.files.some((f) => diff.filePath === f ||
                diff.filePath.includes(f) ||
                f.includes(diff.filePath)));
            if (matchedTask) {
                const existing = taskChanges.get(matchedTask.id) ?? [];
                existing.push(diff);
                taskChanges.set(matchedTask.id, existing);
            }
            else {
                const unassigned = taskChanges.get("_unassigned") ?? [];
                unassigned.push(diff);
                taskChanges.set("_unassigned", unassigned);
            }
        }
        return taskChanges;
    }
    /**
     * Get diff content for specific files
     */
    async getFileDiff(filePath) {
        try {
            return await this.run("diff", "--", filePath);
        }
        catch {
            return "";
        }
    }
    /**
     * Generate a collaborative commit message
     */
    generateCommitMessage(taskDescription, tasks) {
        const humanTasks = tasks.filter((t) => t.assignee === "human" && t.status === "done");
        const aiTasks = tasks.filter((t) => t.assignee === "ai" && t.status === "done");
        let message = `feat: ${taskDescription}\n\n`;
        message += `Collaborative implementation using Duo workflow.\n\n`;
        if (humanTasks.length > 0) {
            message += `Human-authored:\n`;
            for (const t of humanTasks) {
                message += `  - ${t.description}\n`;
            }
            message += "\n";
        }
        if (aiTasks.length > 0) {
            message += `AI-authored (reviewed by human):\n`;
            for (const t of aiTasks) {
                message += `  - ${t.description}\n`;
            }
            message += "\n";
        }
        message += `Co-authored-by: Duo AI <duo@collaborative.dev>`;
        return message;
    }
    /**
     * Get line count summary per assignee
     */
    async getLineCountByAssignee(tasks) {
        const changes = await this.getChangesPerTask(tasks);
        const summary = {
            human: { added: 0, deleted: 0 },
            ai: { added: 0, deleted: 0 },
        };
        for (const [taskId, diffs] of changes) {
            if (taskId === "_unassigned")
                continue;
            const task = tasks.find((t) => t.id === taskId);
            if (!task)
                continue;
            const assignee = task.assignee;
            for (const diff of diffs) {
                summary[assignee].added += diff.additions;
                summary[assignee].deleted += diff.deletions;
            }
        }
        return summary;
    }
    // ── Private ──
    async run(...args) {
        const { stdout } = await exec("git", args, { cwd: this.cwd });
        return stdout;
    }
}
//# sourceMappingURL=git.js.map