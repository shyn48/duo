import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DuoState } from "./state.js";
import { rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

let testDir: string;
let state: DuoState;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "duo-test-"));
  state = new DuoState(testDir);
  await state.init();
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("DuoState initialization", () => {
  it("should create .duo directory", () => {
    expect(existsSync(join(testDir, ".duo"))).toBe(true);
  });

  it("should start in idle phase", () => {
    expect(state.getPhase()).toBe("idle");
  });

  it("should start with empty task board", () => {
    expect(state.getTasks()).toEqual([]);
  });

  it("should start with no design", () => {
    expect(state.getDesign()).toBeNull();
  });

  it("should persist and reload state", async () => {
    await state.setPhase("design");
    await state.addTask("1", "Test task", "human", ["file.ts"]);

    // Create new instance from same directory
    const state2 = new DuoState(testDir);
    await state2.init();

    expect(state2.getPhase()).toBe("design");
    expect(state2.getTasks()).toHaveLength(1);
    expect(state2.getTasks()[0].description).toBe("Test task");
  });
});

describe("Phase management", () => {
  it("should transition between phases", async () => {
    await state.setPhase("design");
    expect(state.getPhase()).toBe("design");

    await state.setPhase("planning");
    expect(state.getPhase()).toBe("planning");

    await state.setPhase("executing");
    expect(state.getPhase()).toBe("executing");
  });
});

describe("Task management", () => {
  it("should add a task", async () => {
    const task = await state.addTask("1", "Implement auth", "human", [
      "auth.go",
    ]);

    expect(task.id).toBe("1");
    expect(task.description).toBe("Implement auth");
    expect(task.assignee).toBe("human");
    expect(task.status).toBe("todo");
    expect(task.files).toEqual(["auth.go"]);
  });

  it("should add multiple tasks", async () => {
    await state.addTask("1", "Task one", "human");
    await state.addTask("2", "Task two", "ai");
    await state.addTask("3", "Task three", "human");

    expect(state.getTasks()).toHaveLength(3);
  });

  it("should get task by id", async () => {
    await state.addTask("auth", "Auth logic", "human");
    const task = state.getTask("auth");

    expect(task).toBeDefined();
    expect(task!.description).toBe("Auth logic");
  });

  it("should return undefined for missing task", () => {
    expect(state.getTask("nonexistent")).toBeUndefined();
  });

  it("should update task status", async () => {
    await state.addTask("1", "Task", "human");

    await state.updateTaskStatus("1", "in_progress");
    expect(state.getTask("1")!.status).toBe("in_progress");

    await state.updateTaskStatus("1", "review");
    expect(state.getTask("1")!.status).toBe("review");

    await state.updateTaskStatus("1", "done");
    expect(state.getTask("1")!.status).toBe("done");
  });

  it("should throw on updating nonexistent task", async () => {
    await expect(
      state.updateTaskStatus("nope", "done"),
    ).rejects.toThrow("Task nope not found");
  });

  it("should reassign task", async () => {
    await state.addTask("1", "Task", "human");

    await state.reassignTask("1", "ai");
    expect(state.getTask("1")!.assignee).toBe("ai");

    await state.reassignTask("1", "human");
    expect(state.getTask("1")!.assignee).toBe("human");
  });

  it("should throw on reassigning nonexistent task", async () => {
    await expect(state.reassignTask("nope", "ai")).rejects.toThrow(
      "Task nope not found",
    );
  });

  it("should set review status", async () => {
    await state.addTask("1", "Task", "ai");

    await state.setReviewStatus("1", "pending");
    expect(state.getTask("1")!.reviewStatus).toBe("pending");

    await state.setReviewStatus("1", "changes_requested", "Fix naming");
    expect(state.getTask("1")!.reviewStatus).toBe("changes_requested");
    expect(state.getTask("1")!.reviewNotes).toBe("Fix naming");

    await state.setReviewStatus("1", "approved");
    expect(state.getTask("1")!.reviewStatus).toBe("approved");
  });
});

describe("Design management", () => {
  it("should save and retrieve design", async () => {
    await state.setDesign({
      taskDescription: "Implement OTP auth",
      agreedDesign: "Use Twilio for SMS, TOTP for verification",
      decisions: ["Use Twilio", "6-digit codes"],
      deferredItems: ["Rate limiting"],
      createdAt: "2026-02-01T00:00:00Z",
    });

    const design = state.getDesign();
    expect(design).not.toBeNull();
    expect(design!.taskDescription).toBe("Implement OTP auth");
    expect(design!.decisions).toHaveLength(2);
  });

  it("should persist design to file", async () => {
    await state.setDesign({
      taskDescription: "Test task",
      agreedDesign: "Simple approach",
      decisions: [],
      deferredItems: [],
      createdAt: "2026-02-01T00:00:00Z",
    });

    const designFile = join(testDir, ".duo", "design.md");
    expect(existsSync(designFile)).toBe(true);

    const content = await readFile(designFile, "utf-8");
    expect(content).toContain("Test task");
    expect(content).toContain("Simple approach");
  });
});

describe("Preferences", () => {
  it("should add and retrieve preferences", async () => {
    await state.addPreference("tests", "human");
    await state.addPreference("config", "ai");

    const prefs = state.getPreferences();
    expect(prefs.overrides["tests"]).toBe("human");
    expect(prefs.overrides["config"]).toBe("ai");
  });

  it("should persist preferences", async () => {
    await state.addPreference("css", "ai");

    const state2 = new DuoState(testDir);
    await state2.init();

    expect(state2.getPreferences().overrides["css"]).toBe("ai");
  });
});

describe("Task board formatting", () => {
  it("should show empty board", () => {
    expect(state.formatTaskBoard()).toContain("empty");
  });

  it("should format tasks by assignee", async () => {
    await state.addTask("1", "Core logic", "human");
    await state.addTask("2", "Types", "ai");

    const board = state.formatTaskBoard();
    expect(board).toContain("HUMAN");
    expect(board).toContain("AI");
    expect(board).toContain("Core logic");
    expect(board).toContain("Types");
  });

  it("should show status icons", async () => {
    await state.addTask("1", "Done task", "human");
    await state.updateTaskStatus("1", "done");
    await state.addTask("2", "WIP task", "ai");
    await state.updateTaskStatus("2", "in_progress");

    const board = state.formatTaskBoard();
    expect(board).toContain("✅");
    expect(board).toContain("🔵");
  });

  it("should show progress count", async () => {
    await state.addTask("1", "T1", "human");
    await state.addTask("2", "T2", "ai");
    await state.updateTaskStatus("1", "done");

    const board = state.formatTaskBoard();
    expect(board).toContain("1/2");
  });
});

describe("Session cleanup", () => {
  it("should clear .duo directory", async () => {
    await state.addTask("1", "Task", "human");
    expect(existsSync(join(testDir, ".duo"))).toBe(true);

    await state.clear();
    expect(existsSync(join(testDir, ".duo"))).toBe(false);
  });
});
