import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdtemp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeCheckpoint,
  readLatestCheckpoint,
  listCheckpoints,
  ensureMemoryDir,
} from "./checkpoint.js";
import type { SessionPhase, Task, DesignDocument } from "../types.js";

let testDir: string;
let stateDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "duo-checkpoint-test-"));
  stateDir = join(testDir, ".duo");
  await mkdir(stateDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("ensureMemoryDir", () => {
  it("should create .duo/memory/ if it doesn't exist", async () => {
    const dir = await ensureMemoryDir(stateDir);
    expect(existsSync(dir)).toBe(true);
    expect(dir).toContain("memory");
  });

  it("should be idempotent", async () => {
    await ensureMemoryDir(stateDir);
    const dir = await ensureMemoryDir(stateDir);
    expect(existsSync(dir)).toBe(true);
  });
});

describe("writeCheckpoint", () => {
  it("should write a checkpoint file", async () => {
    await ensureMemoryDir(stateDir);
    const filename = await writeCheckpoint(stateDir, {
      phase: "executing" as SessionPhase,
      tasks: [],
      design: null,
      subagents: [],
      context: "test checkpoint",
    });

    expect(filename).toMatch(/^checkpoint-.*\.jsonl$/);
    const files = await listCheckpoints(stateDir);
    expect(files).toHaveLength(1);
  });

  it("should include task files in filesModified", async () => {
    await ensureMemoryDir(stateDir);
    const tasks: Task[] = [
      {
        id: "T1",
        description: "Task one",
        assignee: "human",
        status: "done",
        files: ["src/a.ts", "src/b.ts"],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "T2",
        description: "Task two",
        assignee: "ai",
        status: "in_progress",
        files: ["src/b.ts", "src/c.ts"],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ];

    await writeCheckpoint(stateDir, {
      phase: "executing",
      tasks,
      design: null,
      subagents: [],
    });

    const cp = await readLatestCheckpoint(stateDir);
    expect(cp).not.toBeNull();
    expect(cp!.filesModified).toContain("src/a.ts");
    expect(cp!.filesModified).toContain("src/b.ts");
    expect(cp!.filesModified).toContain("src/c.ts");
    // Deduplicated
    expect(cp!.filesModified).toHaveLength(3);
  });

  it("should extract decisions from design", async () => {
    await ensureMemoryDir(stateDir);
    const design: DesignDocument = {
      taskDescription: "Build auth",
      agreedDesign: "Use JWT",
      decisions: ["Use JWT", "Session timeout 1h"],
      deferredItems: [],
      createdAt: "2025-01-01T00:00:00Z",
    };

    await writeCheckpoint(stateDir, {
      phase: "planning",
      tasks: [],
      design,
      subagents: [],
    });

    const cp = await readLatestCheckpoint(stateDir);
    expect(cp!.decisions).toEqual(["Use JWT", "Session timeout 1h"]);
  });
});

describe("listCheckpoints", () => {
  it("should return empty array when no checkpoints exist", async () => {
    const files = await listCheckpoints(stateDir);
    expect(files).toEqual([]);
  });

  it("should return checkpoints sorted newest first", async () => {
    await ensureMemoryDir(stateDir);
    await writeCheckpoint(stateDir, {
      phase: "design",
      tasks: [],
      design: null,
      subagents: [],
      context: "first",
    });

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));

    await writeCheckpoint(stateDir, {
      phase: "planning",
      tasks: [],
      design: null,
      subagents: [],
      context: "second",
    });

    const files = await listCheckpoints(stateDir);
    expect(files).toHaveLength(2);
    // Newest first
    const latest = await readLatestCheckpoint(stateDir);
    expect(latest!.context).toBe("second");
  });
});

describe("readLatestCheckpoint", () => {
  it("should return null when no checkpoints exist", async () => {
    const cp = await readLatestCheckpoint(stateDir);
    expect(cp).toBeNull();
  });

  it("should return the most recent checkpoint", async () => {
    await ensureMemoryDir(stateDir);
    await writeCheckpoint(stateDir, {
      phase: "executing",
      tasks: [],
      design: null,
      subagents: [],
      context: "latest",
    });

    const cp = await readLatestCheckpoint(stateDir);
    expect(cp).not.toBeNull();
    expect(cp!.phase).toBe("executing");
    expect(cp!.context).toBe("latest");
    expect(cp!.timestamp).toBeDefined();
  });
});
