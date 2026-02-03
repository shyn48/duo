import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdtemp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChatLogger, ensureChatDir } from "./chat.js";

let testDir: string;
let stateDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "duo-chat-test-"));
  stateDir = join(testDir, ".duo");
  await mkdir(stateDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("ensureChatDir", () => {
  it("should create .duo/chat/ if it doesn't exist", async () => {
    const dir = await ensureChatDir(stateDir);
    expect(existsSync(dir)).toBe(true);
    expect(dir).toContain("chat");
  });
});

describe("ChatLogger", () => {
  it("should create a log file on first write", async () => {
    await ensureChatDir(stateDir);
    const logger = new ChatLogger(stateDir, "2025-01-15T10:00:00.000Z");

    await logger.log({
      from: "system",
      type: "event",
      content: "Session started",
    });

    expect(existsSync(logger.getFilePath())).toBe(true);
  });

  it("should log entries and read them back", async () => {
    await ensureChatDir(stateDir);
    const logger = new ChatLogger(stateDir, "2025-01-15T10:00:00.000Z");

    await logger.log({
      from: "system",
      type: "event",
      content: "Session started",
    });
    await logger.log({
      from: "human",
      type: "message",
      content: "Let's build auth",
    });
    await logger.log({
      from: "ai",
      type: "tool",
      content: "Task added",
      taskId: "T1",
    });

    const history = await logger.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0].from).toBe("system");
    expect(history[0].content).toBe("Session started");
    expect(history[1].from).toBe("human");
    expect(history[2].taskId).toBe("T1");
  });

  it("should respect limit parameter", async () => {
    await ensureChatDir(stateDir);
    const logger = new ChatLogger(stateDir, "2025-01-15T10:00:00.000Z");

    for (let i = 0; i < 10; i++) {
      await logger.log({
        from: "system",
        type: "event",
        content: `Event ${i}`,
      });
    }

    const last3 = await logger.getHistory(3);
    expect(last3).toHaveLength(3);
    expect(last3[0].content).toBe("Event 7");
    expect(last3[2].content).toBe("Event 9");
  });

  it("should return empty array if no log file exists", async () => {
    const logger = new ChatLogger(stateDir, "2025-01-15T10:00:00.000Z");
    const history = await logger.getHistory();
    expect(history).toEqual([]);
  });

  it("should include timestamps in entries", async () => {
    await ensureChatDir(stateDir);
    const logger = new ChatLogger(stateDir, "2025-01-15T10:00:00.000Z");

    await logger.log({
      from: "ai",
      type: "message",
      content: "hello",
    });

    const [entry] = await logger.getHistory();
    expect(entry.timestamp).toBeDefined();
    // Should be a valid ISO string
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });
});
