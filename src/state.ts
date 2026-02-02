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
  DEFAULT_CONFIG,
} from "./types.js";

export class DuoState {
  private session: DuoSession;
  private config: DuoConfig;
  private stateDir: string;

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
      startedAt: now(),
      updatedAt: now(),
    };
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
    }

    // Load preferences if they exist
    const prefsPath = join(this.stateDir, "preferences.json");
    if (existsSync(prefsPath)) {
      const data = await readFile(prefsPath, "utf-8");
      this.session.preferences = JSON.parse(data);
    }
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

  async setPhase(phase: SessionPhase): Promise<void> {
    this.session.phase = phase;
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
    await this.save();
    return task;
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task ${id} not found`);
    task.status = status;
    task.updatedAt = now();
    this.session.taskBoard.updatedAt = now();
    await this.save();
    return task;
  }

  async reassignTask(id: string, assignee: TaskAssignee): Promise<Task> {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task ${id} not found`);
    task.assignee = assignee;
    task.updatedAt = now();
    this.session.taskBoard.updatedAt = now();
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
