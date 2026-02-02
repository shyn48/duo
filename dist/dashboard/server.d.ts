/**
 * Dashboard Server — HTTP + SSE server for Duo dashboard
 */
import type { DuoState } from "../state.js";
import type { DuoEvent } from "../types.js";
export declare class DashboardServer {
    private server;
    private clients;
    private state;
    private port;
    private eventLog;
    constructor(state: DuoState, port?: number);
    start(): Promise<string>;
    stop(): Promise<void>;
    private handleRequest;
    private handleSSE;
    private sendEvent;
    emitEvent(event: DuoEvent): void;
    isRunning(): boolean;
    getUrl(): string | null;
}
//# sourceMappingURL=server.d.ts.map