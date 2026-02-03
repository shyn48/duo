/**
 * Duo State Manager — Persistent task and session state
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeCheckpoint } from "./memory/checkpoint.js";
import { ChatLogger } from "./memory/chat.js";
export class DuoState {
    session;
    config;
    stateDir;
    dashboard = null;
    messageCount = 0;
    chatLogger = null;
    constructor(projectRoot, config) {
        const defaults = {
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
        this.config = { ...defaults, ...config };
        this.stateDir = join(projectRoot, this.config.stateDir);
        this.session = {
            phase: "idle",
            projectRoot,
            taskBoard: { tasks: [], createdAt: now(), updatedAt: now() },
            design: null,
            preferences: { humanPrefers: [], aiPrefers: [], overrides: {} },
            subagents: [],
            startedAt: now(),
            updatedAt: now(),
        };
    }
    // ── Dashboard Integration ──
    setDashboard(dashboard) {
        this.dashboard = dashboard;
    }
    emitEvent(event) {
        if (this.dashboard) {
            this.dashboard.emitEvent(event);
        }
    }
    // ── Initialization ──
    async init() {
        if (!existsSync(this.stateDir)) {
            await mkdir(this.stateDir, { recursive: true });
        }
        // Try to load existing state
        const sessionPath = join(this.stateDir, "session.json");
        if (existsSync(sessionPath)) {
            const data = await readFile(sessionPath, "utf-8");
            this.session = JSON.parse(data);
            // Ensure subagents array exists (backward compat with v0.1.0 state)
            if (!this.session.subagents) {
                this.session.subagents = [];
            }
        }
        // Load preferences if they exist
        const prefsPath = join(this.stateDir, "preferences.json");
        if (existsSync(prefsPath)) {
            const data = await readFile(prefsPath, "utf-8");
            this.session.preferences = JSON.parse(data);
        }
        // Initialize chat logger
        this.chatLogger = new ChatLogger(this.stateDir, this.session.startedAt);
    }
    // ── Persistence ──
    async save() {
        this.session.updatedAt = now();
        await writeFile(join(this.stateDir, "session.json"), JSON.stringify(this.session, null, 2));
    }
    async savePreferences() {
        await writeFile(join(this.stateDir, "preferences.json"), JSON.stringify(this.session.preferences, null, 2));
    }
    async saveDesign() {
        if (this.session.design) {
            await writeFile(join(this.stateDir, "design.md"), formatDesignDoc(this.session.design));
        }
    }
    // ── Phase Management ──
    getPhase() {
        return this.session.phase;
    }
    async setPhase(phase) {
        this.session.phase = phase;
        this.emitEvent({ type: "phase_changed", phase });
        await this.save();
    }
    // ── Design ──
    async setDesign(design) {
        this.session.design = design;
        await this.saveDesign();
        await this.save();
    }
    getDesign() {
        return this.session.design;
    }
    // ── Task Board ──
    getTasks() {
        return this.session.taskBoard.tasks;
    }
    getTask(id) {
        return this.session.taskBoard.tasks.find((t) => t.id === id);
    }
    async addTask(id, description, assignee, files = []) {
        const task = {
            id,
            description,
            assignee,
            status: "todo",
            files,
            createdAt: now(),
            updatedAt: now(),
        };
        this.session.taskBoard.tasks.push(task);
        this.session.taskBoard.updatedAt = now();
        this.emitEvent({ type: "task_added", task });
        await this.save();
        return task;
    }
    async updateTaskStatus(id, status) {
        const task = this.getTask(id);
        if (!task)
            throw new Error(`Task ${id} not found`);
        const oldStatus = task.status;
        task.status = status;
        task.updatedAt = now();
        this.session.taskBoard.updatedAt = now();
        this.emitEvent({ type: "task_updated", taskId: id, changes: { status } });
        await this.save();
        return task;
    }
    async reassignTask(id, assignee) {
        const task = this.getTask(id);
        if (!task)
            throw new Error(`Task ${id} not found`);
        const from = task.assignee;
        task.assignee = assignee;
        task.updatedAt = now();
        this.session.taskBoard.updatedAt = now();
        this.emitEvent({ type: "task_reassigned", taskId: id, from, to: assignee });
        await this.save();
        return task;
    }
    async setReviewStatus(id, status, notes) {
        const task = this.getTask(id);
        if (!task)
            throw new Error(`Task ${id} not found`);
        task.reviewStatus = status;
        if (notes)
            task.reviewNotes = notes;
        task.updatedAt = now();
        const approved = status === "approved";
        this.emitEvent({ type: "review_completed", taskId: id, approved });
        await this.save();
        return task;
    }
    // ── Preferences ──
    getPreferences() {
        return this.session.preferences;
    }
    async addPreference(taskType, assignee) {
        this.session.preferences.overrides[taskType] = assignee;
        await this.savePreferences();
        await this.save();
    }
    // ── Task Board Display ──
    formatTaskBoard() {
        const tasks = this.session.taskBoard.tasks;
        if (tasks.length === 0)
            return "📋 Task board is empty";
        const statusIcons = {
            todo: "⬜",
            in_progress: "🔵",
            review: "🟡",
            done: "✅",
        };
        const humanTasks = tasks.filter((t) => t.assignee === "human");
        const aiTasks = tasks.filter((t) => t.assignee === "ai");
        let output = "📋 Duo Task Board\n" + "─".repeat(40) + "\n";
        if (humanTasks.length > 0) {
            output += "\n🧑 HUMAN:\n";
            for (const t of humanTasks) {
                const icon = statusIcons[t.status];
                const files = t.files.length > 0 ? ` — ${t.files.join(", ")}` : "";
                output += `  ${icon} [${t.id}] ${t.description}${files}\n`;
            }
        }
        if (aiTasks.length > 0) {
            output += "\n🤖 AI:\n";
            for (const t of aiTasks) {
                const icon = statusIcons[t.status];
                const files = t.files.length > 0 ? ` — ${t.files.join(", ")}` : "";
                output += `  ${icon} [${t.id}] ${t.description}${files}\n`;
            }
        }
        const done = tasks.filter((t) => t.status === "done").length;
        output += `\n── Progress: ${done}/${tasks.length} tasks complete ──`;
        return output;
    }
    // ── Subagent Tracking ──
    async addSubagent(info) {
        if (!this.session.subagents) {
            this.session.subagents = [];
        }
        this.session.subagents.push(info);
        await this.save();
    }
    getSubagents() {
        return this.session.subagents ?? [];
    }
    // ── Checkpoints ──
    async checkpoint(context) {
        this.messageCount++;
        return writeCheckpoint(this.stateDir, {
            phase: this.session.phase,
            tasks: this.session.taskBoard.tasks,
            design: this.session.design,
            subagents: this.session.subagents ?? [],
            context,
        });
    }
    getMessageCount() {
        return this.messageCount;
    }
    // ── Chat Logging ──
    async logChat(from, type, content, taskId) {
        if (this.chatLogger) {
            await this.chatLogger.log({ from, type, content, taskId });
        }
    }
    getChatLogger() {
        return this.chatLogger;
    }
    // ── State Directory ──
    getStateDir() {
        return this.stateDir;
    }
    // ── Session Info ──
    getSession() {
        return this.session;
    }
    async clear() {
        const { rm } = await import("node:fs/promises");
        await rm(this.stateDir, { recursive: true, force: true });
    }
}
// ── Helpers ──
function now() {
    return new Date().toISOString();
}
function formatDesignDoc(design) {
    let doc = `# Design: ${design.taskDescription}\n\n`;
    doc += `${design.agreedDesign}\n\n`;
    if (design.decisions.length > 0) {
        doc += `## Key Decisions\n\n`;
        for (const d of design.decisions) {
            doc += `- ${d}\n`;
        }
        doc += "\n";
    }
    if (design.deferredItems.length > 0) {
        doc += `## Deferred\n\n`;
        for (const d of design.deferredItems) {
            doc += `- ${d}\n`;
        }
        doc += "\n";
    }
    doc += `\n---\n*Created: ${design.createdAt}*\n`;
    return doc;
}
//# sourceMappingURL=state.js.map