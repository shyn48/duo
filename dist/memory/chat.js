/**
 * Chat History Logger — append-only JSONL log of session events
 */
import { appendFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
/**
 * Ensure the .duo/chat/ directory exists.
 */
export async function ensureChatDir(stateDir) {
    const chatDir = join(stateDir, "chat");
    if (!existsSync(chatDir)) {
        await mkdir(chatDir, { recursive: true });
    }
    return chatDir;
}
export class ChatLogger {
    filePath;
    chatDir;
    constructor(stateDir, sessionStartedAt) {
        this.chatDir = join(stateDir, "chat");
        // Use a filesystem-safe version of the startedAt timestamp
        const safeTimestamp = sessionStartedAt.replace(/[:.]/g, "-");
        this.filePath = join(this.chatDir, `session-${safeTimestamp}.jsonl`);
    }
    /**
     * Append a chat entry to the log file.
     */
    async log(entry) {
        // Ensure chat directory exists
        if (!existsSync(this.chatDir)) {
            await mkdir(this.chatDir, { recursive: true });
        }
        const full = {
            timestamp: new Date().toISOString(),
            ...entry,
        };
        await appendFile(this.filePath, JSON.stringify(full) + "\n");
    }
    /**
     * Read the last N entries from the log.
     */
    async getHistory(limit) {
        if (!existsSync(this.filePath))
            return [];
        const content = await readFile(this.filePath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        const entries = lines.map((line) => JSON.parse(line));
        if (limit !== undefined && limit > 0) {
            return entries.slice(-limit);
        }
        return entries;
    }
    getFilePath() {
        return this.filePath;
    }
}
//# sourceMappingURL=chat.js.map