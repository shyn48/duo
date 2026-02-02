/**
 * Dashboard Server — HTTP + SSE server for Duo dashboard
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DuoState } from "../state.js";
import type { DuoEvent } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DashboardServer {
  private server: ReturnType<typeof createServer> | null = null;
  private clients: Set<ServerResponse> = new Set();
  private state: DuoState;
  private port: number;
  private eventLog: Array<{ timestamp: string; event: DuoEvent }> = [];

  constructor(state: DuoState, port = 3456) {
    this.state = state;
    this.port = port;
  }

  async start(): Promise<string> {
    if (this.server) {
      return `http://localhost:${this.port}`;
    }

    this.server = createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, "127.0.0.1", () => {
        const url = `http://localhost:${this.port}`;
        console.log(`📊 Dashboard running at ${url}`);
        resolve(url);
      });
      this.server!.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;

    // Close all SSE connections
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      this.server!.close(() => resolve());
      this.server = null;
    });
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = req.url ?? "/";

    // SSE endpoint
    if (url === "/events") {
      this.handleSSE(req, res);
      return;
    }

    // API endpoint - current state
    if (url === "/api/state") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const session = this.state.getSession();
      const design = this.state.getDesign();
      res.end(
        JSON.stringify({
          session,
          design,
          eventLog: this.eventLog.slice(-50), // Last 50 events
        }),
      );
      return;
    }

    // Serve index.html
    if (url === "/" || url === "/index.html") {
      try {
        const html = await readFile(join(__dirname, "index.html"), "utf-8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
      } catch (err) {
        res.writeHead(500);
        res.end("Error loading dashboard");
      }
      return;
    }

    // 404
    res.writeHead(404);
    res.end("Not Found");
  }

  private handleSSE(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    this.clients.add(res);

    // Send initial state
    const session = this.state.getSession();
    this.sendEvent(res, "state", {
      session,
      design: this.state.getDesign(),
      eventLog: this.eventLog.slice(-50),
    });

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30000);

    req.on("close", () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  }

  private sendEvent(client: ServerResponse, event: string, data: any): void {
    client.write(`event: ${event}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // ── Public API for emitting events ──

  emitEvent(event: DuoEvent): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
    };

    this.eventLog.push(logEntry);

    // Keep only last 200 events in memory
    if (this.eventLog.length > 200) {
      this.eventLog = this.eventLog.slice(-200);
    }

    // Broadcast to all connected clients
    const session = this.state.getSession();
    const payload = {
      event: logEntry,
      session,
      design: this.state.getDesign(),
    };

    for (const client of this.clients) {
      this.sendEvent(client, "update", payload);
    }
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  getUrl(): string | null {
    return this.server ? `http://localhost:${this.port}` : null;
  }
}
