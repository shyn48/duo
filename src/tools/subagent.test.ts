import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DuoState } from "../state.js";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

let testDir: string;
let state: DuoState;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "duo-subagent-test-"));
  state = new DuoState(testDir);
  await state.init();
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Subagent tracking", () => {
  it("should start with empty subagents array", () => {
    expect(state.getSubagents()).toEqual([]);
  });

  it("should add a subagent", async () => {
    await state.addSubagent({
      taskId: "T1",
      status: "pending",
      spawnedAt: new Date().toISOString(),
      prompt: "Do the thing",
    });

    const subagents = state.getSubagents();
    expect(subagents).toHaveLength(1);
    expect(subagents[0].taskId).toBe("T1");
    expect(subagents[0].status).toBe("pending");
  });

  it("should add multiple subagents", async () => {
    await state.addSubagent({
      taskId: "T1",
      status: "pending",
      spawnedAt: new Date().toISOString(),
      prompt: "Task 1",
    });
    await state.addSubagent({
      taskId: "T2",
      agentId: "agent-123",
      status: "running",
      spawnedAt: new Date().toISOString(),
      prompt: "Task 2",
    });

    const subagents = state.getSubagents();
    expect(subagents).toHaveLength(2);
    expect(subagents[1].agentId).toBe("agent-123");
  });

  it("should persist subagents across reload", async () => {
    await state.addSubagent({
      taskId: "T1",
      status: "pending",
      spawnedAt: new Date().toISOString(),
      prompt: "Persisted prompt",
    });

    const state2 = new DuoState(testDir);
    await state2.init();

    const subagents = state2.getSubagents();
    expect(subagents).toHaveLength(1);
    expect(subagents[0].prompt).toBe("Persisted prompt");
  });
});

describe("DuoSession subagents backward compat", () => {
  it("should handle old sessions without subagents field", async () => {
    // Write a session without subagents field
    const { writeFile, mkdir } = await import("node:fs/promises");
    const duoDir = join(testDir, ".duo-compat");
    const compatDir = await mkdtemp(join(tmpdir(), "duo-compat-test-"));
    const stateDir = join(compatDir, ".duo");
    await mkdir(stateDir, { recursive: true });

    const oldSession = {
      phase: "executing",
      projectRoot: compatDir,
      taskBoard: { tasks: [], createdAt: "2025-01-01", updatedAt: "2025-01-01" },
      design: null,
      preferences: { humanPrefers: [], aiPrefers: [], overrides: {} },
      startedAt: "2025-01-01",
      updatedAt: "2025-01-01",
      // Note: no `subagents` field
    };
    await writeFile(join(stateDir, "session.json"), JSON.stringify(oldSession));

    const compatState = new DuoState(compatDir);
    await compatState.init();

    // Should not crash, should have empty subagents
    expect(compatState.getSubagents()).toEqual([]);

    await rm(compatDir, { recursive: true, force: true });
  });
});
