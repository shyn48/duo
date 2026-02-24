/**
 * Duo State Manager — Persistent task and session state
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  DuoSession,
  DuoConfig,
  Task,
  TaskAssignee,
  TaskBoard,
  TaskStatus,
  SessionPhase,
  DesignDocument,
  UserPreferences,
  SubagentInfo,
  DEFAULT_CONFIG,
  DuoEvent,
  MessageSource,
} from "./types.js";
import type { DashboardServer } from "./dashboard/index.js";
import { writeCheckpoint } from "./memory/checkpoint.js";
import { ChatLogger } from "./memory/chat.js";

export class DuoState {
  private session: DuoSession;
  private config: DuoConfig;
  private stateDir: string;
  private dashboard: DashboardServer | null = null;
  private messageCount = 0;
  private chatLogger: ChatLogger | null = null;

  constructor(projectRoot: string, config?: Partial<DuoConfig>) {
    const defaults: DuoConfig = {
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

  setDashboard(dashboard: DashboardServer): void {
    this.dashboard = dashboard;
  }

  private emitEvent(event: DuoEvent): void {
    if (this.dashboard) {
      this.dashboard.emitEvent(event);
    }
  }

  // ── Initialization ──

  async init(): Promise<void> {
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

  async save(): Promise<void> {
    this.session.updatedAt = now();
    await writeFile(
      join(this.stateDir, "session.json"),
      JSON.stringify(this.session, null, 2),
    );
  }

  async savePreferences(): Promise<void> {
    await writeFile(
      join(this.stateDir, "preferences.json"),
      JSON.stringify(this.session.preferences, null, 2),
    );
  }

  async saveDesign(): Promise<void> {
    if (this.session.design) {
      await writeFile(
        join(this.stateDir, "design.md"),
        formatDesignDoc(this.session.design),
      );
    }
  }

  // ── Phase Management ──

  getPhase(): SessionPhase {
    return this.session.phase;
  }

  /**
   * Check if a phase transition is allowed.
   * Returns null if OK, or an error message describing what's missing.
   */
  checkPhaseGate(targetPhase: SessionPhase): string | null {
    const tasks = this.session.taskBoard.tasks;

    switch (targetPhase) {
      case "planning": {
        if (!this.session.design) {
          return "Cannot advance to planning: design document not saved. Call duo_design_save first.";
        }
        break;
      }
      case "executing": {
        if (!this.session.design) {
          return "Cannot advance to executing: no design document. Complete design phase first.";
        }
        const humanTasks = tasks.filter((t) => t.assignee === "human");
        const aiTasks = tasks.filter((t) => t.assignee === "ai");
        if (tasks.length === 0) {
          return "Cannot advance to executing: task board is empty. Call duo_task_add_bulk to add tasks first.";
        }
        if (humanTasks.length === 0) {
          return "Cannot advance to executing: no tasks assigned to human. Assign at least one task to the human.";
        }
        if (aiTasks.length === 0) {
          return "Cannot advance to executing: no tasks assigned to AI.";
        }
        if (!this.session.taskBoardApproved) {
          return "Cannot advance to executing: task board not approved. Present the board to the human and call duo_approve_task_board after they confirm.";
        }
        break;
      }
      case "reviewing": {
        const aiDone = tasks.filter(
          (t) => t.assignee === "ai" && (t.status === "done" || t.status === "review"),
        );
        if (aiDone.length === 0) {
          return "Cannot advance to reviewing: no AI tasks are complete yet.";
        }
        break;
      }
      case "integrating": {
        const notDone = tasks.filter((t) => t.status !== "done");
        if (notDone.length > 0) {
          const ids = notDone.map((t) => `[${t.id}]`).join(", ");
          return `Cannot advance to integrating: tasks still pending: ${ids}.`;
        }
        const unreviewed = tasks.filter((t) => !t.reviewStatus);
        if (unreviewed.length > 0) {
          const ids = unreviewed.map((t) => `[${t.id}]`).join(", ");
          return `Cannot advance to integrating: tasks not reviewed: ${ids}. Call duo_review_submit for each.`;
        }
        break;
      }
    }
    return null;
  }

  async approveTaskBoard(): Promise<void> {
    this.session.taskBoardApproved = true;
    await this.save();
  }

  isTaskBoardApproved(): boolean {
    return this.session.taskBoardApproved ?? false;
  }

  async setPhase(phase: SessionPhase): Promise<void> {
    this.session.phase = phase;
    this.emitEvent({ type: "phase_changed", phase });
    await this.save();
  }

  // ── Design ──

  async setDesign(design: DesignDocument): Promise<void> {
    this.session.design = design;
    await this.saveDesign();
    await this.save();
  }

  getDesign(): DesignDocument | null {
    return this.session.design;
  }

  // ── Task Board ──

  getTasks(): Task[] {
    return this.session.taskBoard.tasks;
  }

  getTask(id: string): Task | undefined {
    return this.session.taskBoard.tasks.find((t) => t.id === id);
  }

  async addTask(
    id: string,
    description: string,
    assignee: TaskAssignee,
    files: string[] = [],
  ): Promise<Task> {
    const task: Task = {
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

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task ${id} not found`);
    const oldStatus = task.status;
    task.status = status;
    task.updatedAt = now();
    this.session.taskBoard.updatedAt = now();
    this.emitEvent({ type: "task_updated", taskId: id, changes: { status } });
    await this.save();
    return task;
  }

  async reassignTask(id: string, assignee: TaskAssignee): Promise<Task> {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task ${id} not found`);
    const from = task.assignee;
    task.assignee = assignee;
    task.updatedAt = now();
    this.session.taskBoard.updatedAt = now();
    this.emitEvent({ type: "task_reassigned", taskId: id, from, to: assignee });
    await this.save();
    return task;
  }

  async setReviewStatus(
    id: string,
    status: "pending" | "approved" | "changes_requested",
    notes?: string,
  ): Promise<Task> {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task ${id} not found`);
    task.reviewStatus = status;
    if (notes) task.reviewNotes = notes;
    task.updatedAt = now();
    const approved = status === "approved";
    this.emitEvent({ type: "review_completed", taskId: id, approved });
    await this.save();
    return task;
  }

  // ── Preferences ──

  getPreferences(): UserPreferences {
    return this.session.preferences;
  }

  async addPreference(
    taskType: string,
    assignee: TaskAssignee,
  ): Promise<void> {
    this.session.preferences.overrides[taskType] = assignee;
    await this.savePreferences();
    await this.save();
  }

  // ── Task Board Display ──

  formatTaskBoard(): string {
    const tasks = this.session.taskBoard.tasks;
    if (tasks.length === 0) return "📋 Task board is empty";

    const statusIcons: Record<TaskStatus, string> = {
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

  async addSubagent(info: SubagentInfo): Promise<void> {
    if (!this.session.subagents) {
      this.session.subagents = [];
    }
    this.session.subagents.push(info);
    await this.save();
  }

  getSubagents(): SubagentInfo[] {
    return this.session.subagents ?? [];
  }

  // ── Checkpoints ──

  async checkpoint(context?: string): Promise<string> {
    this.messageCount++;
    return writeCheckpoint(this.stateDir, {
      phase: this.session.phase,
      tasks: this.session.taskBoard.tasks,
      design: this.session.design,
      subagents: this.session.subagents ?? [],
      context,
    });
  }

  getMessageCount(): number {
    return this.messageCount;
  }

  // ── Chat Logging ──

  async logChat(
    from: MessageSource,
    type: "message" | "tool" | "event",
    content: string,
    taskId?: string,
  ): Promise<void> {
    if (this.chatLogger) {
      await this.chatLogger.log({ from, type, content, taskId });
    }
  }

  getChatLogger(): ChatLogger | null {
    return this.chatLogger;
  }

  // ── State Directory ──

  getStateDir(): string {
    return this.stateDir;
  }

  // ── Session Info ──

  getSession(): DuoSession {
    return this.session;
  }

  async clear(): Promise<void> {
    const { rm } = await import("node:fs/promises");
    await rm(this.stateDir, { recursive: true, force: true });
  }
}

// ── Helpers ──

function now(): string {
  return new Date().toISOString();
}

function formatDesignDoc(design: DesignDocument): string {
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
