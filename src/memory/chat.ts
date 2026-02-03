/**
 * Chat History Logger — append-only JSONL log of session events
 */

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { MessageSource } from "../types.js";

export interface ChatEntry {
  timestamp: string;
  from: MessageSource;
  type: "message" | "tool" | "event";
  content: string;
  taskId?: string;
}

/**
 * Ensure the .duo/chat/ directory exists.
 */
export async function ensureChatDir(stateDir: string): Promise<string> {
  const chatDir = join(stateDir, "chat");
  if (!existsSync(chatDir)) {
    await mkdir(chatDir, { recursive: true });
  }
  return chatDir;
}

export class ChatLogger {
  private filePath: string;
  private chatDir: string;

  constructor(stateDir: string, sessionStartedAt: string) {
    this.chatDir = join(stateDir, "chat");
    // Use a filesystem-safe version of the startedAt timestamp
    const safeTimestamp = sessionStartedAt.replace(/[:.]/g, "-");
    this.filePath = join(this.chatDir, `session-${safeTimestamp}.jsonl`);
  }

  /**
   * Append a chat entry to the log file.
   */
  async log(entry: Omit<ChatEntry, "timestamp">): Promise<void> {
    // Ensure chat directory exists
    if (!existsSync(this.chatDir)) {
      await mkdir(this.chatDir, { recursive: true });
    }

    const full: ChatEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    await appendFile(this.filePath, JSON.stringify(full) + "\n");
  }

  /**
   * Read the last N entries from the log.
   */
  async getHistory(limit?: number): Promise<ChatEntry[]> {
    if (!existsSync(this.filePath)) return [];

    const content = await readFile(this.filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const entries = lines.map((line) => JSON.parse(line) as ChatEntry);

    if (limit !== undefined && limit > 0) {
      return entries.slice(-limit);
    }
    return entries;
  }

  getFilePath(): string {
    return this.filePath;
  }
}
