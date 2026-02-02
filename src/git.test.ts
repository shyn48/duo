import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DuoGit } from "./git.js";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Task } from "./types.js";

const exec = promisify(execFile);

let testDir: string;
let git: DuoGit;

async function gitInit(dir: string) {
  await exec("git", ["init"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], {
    cwd: dir,
  });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
}

async function gitAdd(dir: string, file: string) {
  await exec("git", ["add", file], { cwd: dir });
}

async function gitCommit(dir: string, message: string) {
  await exec("git", ["commit", "-m", message], { cwd: dir });
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "duo-git-"));
  await gitInit(testDir);
  git = new DuoGit(testDir);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("DuoGit basics", () => {
  it("should detect git repo", async () => {
    expect(await git.isGitRepo()).toBe(true);
  });

  it("should detect non-git directory", async () => {
    const nonGit = await mkdtemp(join(tmpdir(), "duo-nogit-"));
    const nonGitInstance = new DuoGit(nonGit);
    expect(await nonGitInstance.isGitRepo()).toBe(false);
    await rm(nonGit, { recursive: true, force: true });
  });

  it("should get current branch", async () => {
    // Need at least one commit
    await writeFile(join(testDir, "init.txt"), "init");
    await gitAdd(testDir, "init.txt");
    await gitCommit(testDir, "initial");

    const branch = await git.getCurrentBranch();
    expect(["main", "master"]).toContain(branch);
  });
});

describe("Git status", () => {
  it("should detect modified files", async () => {
    // Create and commit a file
    await writeFile(join(testDir, "file.ts"), "original");
    await gitAdd(testDir, "file.ts");
    await gitCommit(testDir, "add file");

    // Modify it
    await writeFile(join(testDir, "file.ts"), "modified");

    const status = await git.getStatus();
    expect(status.modified).toContain("file.ts");
  });

  it("should detect untracked files", async () => {
    await writeFile(join(testDir, "new.ts"), "new file");

    const status = await git.getStatus();
    expect(status.untracked).toContain("new.ts");
  });

  it("should return empty status for clean repo", async () => {
    await writeFile(join(testDir, "file.ts"), "content");
    await gitAdd(testDir, "file.ts");
    await gitCommit(testDir, "clean");

    const status = await git.getStatus();
    expect(status.modified).toHaveLength(0);
    expect(status.added).toHaveLength(0);
    expect(status.deleted).toHaveLength(0);
    expect(status.untracked).toHaveLength(0);
  });
});

describe("Diff stats", () => {
  it("should get diff stats for modified files", async () => {
    await writeFile(join(testDir, "code.ts"), "line1\nline2\nline3\n");
    await gitAdd(testDir, "code.ts");
    await gitCommit(testDir, "initial");

    await writeFile(
      join(testDir, "code.ts"),
      "line1\nmodified\nline3\nnewline\n",
    );

    const diffs = await git.getDiffStats();
    expect(diffs).toHaveLength(1);
    expect(diffs[0].filePath).toBe("code.ts");
    expect(diffs[0].additions).toBeGreaterThan(0);
  });

  it("should return empty for no changes", async () => {
    await writeFile(join(testDir, "file.ts"), "content");
    await gitAdd(testDir, "file.ts");
    await gitCommit(testDir, "commit");

    const diffs = await git.getDiffStats();
    expect(diffs).toHaveLength(0);
  });
});

describe("Commit message generation", () => {
  it("should generate collaborative commit message", () => {
    const tasks: Task[] = [
      {
        id: "1",
        description: "Core auth logic",
        assignee: "human",
        status: "done",
        files: [],
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        description: "Type definitions",
        assignee: "ai",
        status: "done",
        files: [],
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "3",
        description: "Test suite",
        assignee: "ai",
        status: "done",
        files: [],
        createdAt: "",
        updatedAt: "",
      },
    ];

    const message = git.generateCommitMessage("Implement OTP auth", tasks);

    expect(message).toContain("feat: Implement OTP auth");
    expect(message).toContain("Human-authored:");
    expect(message).toContain("Core auth logic");
    expect(message).toContain("AI-authored (reviewed by human):");
    expect(message).toContain("Type definitions");
    expect(message).toContain("Test suite");
    expect(message).toContain("Co-authored-by: Duo AI");
  });

  it("should handle human-only tasks", () => {
    const tasks: Task[] = [
      {
        id: "1",
        description: "Everything",
        assignee: "human",
        status: "done",
        files: [],
        createdAt: "",
        updatedAt: "",
      },
    ];

    const message = git.generateCommitMessage("Solo task", tasks);
    expect(message).toContain("Human-authored:");
    expect(message).not.toContain("AI-authored");
  });
});

describe("Changes per task", () => {
  it("should map file changes to tasks", async () => {
    await mkdir(join(testDir, "src"), { recursive: true });
    await writeFile(join(testDir, "src/auth.ts"), "original");
    await writeFile(join(testDir, "src/types.ts"), "original");
    await gitAdd(testDir, ".");
    await gitCommit(testDir, "initial");

    // Modify both files
    await writeFile(join(testDir, "src/auth.ts"), "modified auth");
    await writeFile(join(testDir, "src/types.ts"), "modified types");

    const tasks: Task[] = [
      {
        id: "1",
        description: "Auth",
        assignee: "human",
        status: "in_progress",
        files: ["src/auth.ts"],
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        description: "Types",
        assignee: "ai",
        status: "in_progress",
        files: ["src/types.ts"],
        createdAt: "",
        updatedAt: "",
      },
    ];

    const changes = await git.getChangesPerTask(tasks);
    expect(changes.has("1")).toBe(true);
    expect(changes.has("2")).toBe(true);
    expect(changes.get("1")![0].filePath).toBe("src/auth.ts");
  });
});
