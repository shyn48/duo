import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DuoWatcher } from "./watcher.js";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { DuoConfig, Task } from "./types.js";

const testConfig: DuoConfig = {
  stateDir: ".duo",
  watchFiles: true,
  gitIntegration: false,
  ignorePatterns: ["node_modules", ".git", "dist", ".duo", "*.log"],
};

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "duo-watch-"));
  await mkdir(join(testDir, "src"), { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("DuoWatcher", () => {
  it("should create watcher instance", () => {
    const watcher = new DuoWatcher(testDir, testConfig);
    expect(watcher).toBeDefined();
  });

  it("should start and stop without error", async () => {
    const watcher = new DuoWatcher(testDir, testConfig);
    await watcher.start();
    watcher.stop();
  });

  it("should detect file changes", async () => {
    const watcher = new DuoWatcher(testDir, testConfig);
    const changes: string[] = [];

    watcher.onChange((change) => {
      changes.push(change.relativePath);
    });

    await watcher.start();

    // Write a file
    await writeFile(join(testDir, "src", "test.ts"), "console.log('hi')");

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 800));

    watcher.stop();

    // Should have detected the change (path format may vary by OS)
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes.some((c) => c.includes("test.ts"))).toBe(true);
  });

  it("should ignore files matching ignore patterns", async () => {
    const watcher = new DuoWatcher(testDir, testConfig);
    const changes: string[] = [];

    watcher.onChange((change) => {
      changes.push(change.relativePath);
    });

    await watcher.start();

    // Write to an ignored location
    await mkdir(join(testDir, "node_modules"), { recursive: true });
    await writeFile(
      join(testDir, "node_modules", "test.js"),
      "ignored",
    );

    // Write a log file (should be ignored)
    await writeFile(join(testDir, "debug.log"), "ignored");

    await new Promise((r) => setTimeout(r, 800));

    watcher.stop();

    // None of the ignored files should appear
    expect(
      changes.filter(
        (c) => c.includes("node_modules") || c.endsWith(".log"),
      ),
    ).toHaveLength(0);
  });
});

describe("Task matching", () => {
  it("should match file to task by exact path", () => {
    const watcher = new DuoWatcher(testDir, testConfig);
    const tasks: Task[] = [
      {
        id: "1",
        description: "Auth logic",
        assignee: "human",
        status: "in_progress",
        files: ["src/auth.ts"],
        createdAt: "",
        updatedAt: "",
      },
    ];

    const match = watcher.matchTask(join(testDir, "src/auth.ts"), tasks);
    expect(match).toBeDefined();
    expect(match!.id).toBe("1");
  });

  it("should return undefined for unmatched file", () => {
    const watcher = new DuoWatcher(testDir, testConfig);
    const tasks: Task[] = [
      {
        id: "1",
        description: "Auth",
        assignee: "human",
        status: "todo",
        files: ["src/auth.ts"],
        createdAt: "",
        updatedAt: "",
      },
    ];

    const match = watcher.matchTask(
      join(testDir, "src/other.ts"),
      tasks,
    );
    expect(match).toBeUndefined();
  });

  it("should match by partial path", () => {
    const watcher = new DuoWatcher(testDir, testConfig);
    const tasks: Task[] = [
      {
        id: "1",
        description: "Handler work",
        assignee: "ai",
        status: "in_progress",
        files: ["handler/"],
        createdAt: "",
        updatedAt: "",
      },
    ];

    const match = watcher.matchTask(
      join(testDir, "handler/auth.go"),
      tasks,
    );
    expect(match).toBeDefined();
    expect(match!.id).toBe("1");
  });
});
