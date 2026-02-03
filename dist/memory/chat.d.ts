/**
 * Chat History Logger — append-only JSONL log of session events
 */
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
export declare function ensureChatDir(stateDir: string): Promise<string>;
export declare class ChatLogger {
    private filePath;
    private chatDir;
    constructor(stateDir: string, sessionStartedAt: string);
    /**
     * Append a chat entry to the log file.
     */
    log(entry: Omit<ChatEntry, "timestamp">): Promise<void>;
    /**
     * Read the last N entries from the log.
     */
    getHistory(limit?: number): Promise<ChatEntry[]>;
    getFilePath(): string;
}
//# sourceMappingURL=chat.d.ts.map