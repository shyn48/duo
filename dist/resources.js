/**
 * Duo MCP Resources — Expose session state to clients
 */
import { DuoState } from "./state.js";
let stateInstance = null;
export function setStateInstance(state) {
    stateInstance = state;
}
/**
 * Get the state instance, auto-loading from disk if needed.
 * This supports stateless/per-call usage (e.g. mcporter --stdio)
 * by reading from .duo/session.json when the singleton isn't set.
 */
export async function getStateInstanceAutoLoad() {
    if (stateInstance)
        return stateInstance;
    // Try auto-loading from DUO_PROJECT_ROOT env var
    const projectRoot = process.env.DUO_PROJECT_ROOT;
    if (!projectRoot)
        return null;
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sessionPath = join(projectRoot, ".duo", "session.json");
    if (!existsSync(sessionPath))
        return null;
    const state = new DuoState(projectRoot);
    await state.init();
    stateInstance = state;
    return state;
}
/** Sync getter — returns null if not loaded yet (for backward compat) */
export function getStateInstance() {
    return stateInstance;
}
export function registerResources(server) {
    // Current task board
    server.resource("task-board", "duo://task-board", async (uri) => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: "No active Duo session. Use duo_session_start to begin.",
                    },
                ],
            };
        }
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "text/plain",
                    text: state.formatTaskBoard(),
                },
            ],
        };
    });
    // Design document
    server.resource("design", "duo://design", async (uri) => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: "No active Duo session.",
                    },
                ],
            };
        }
        const design = state.getDesign();
        if (!design) {
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: "No design document yet. Complete the design phase first.",
                    },
                ],
            };
        }
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "text/markdown",
                    text: `# Design: ${design.taskDescription}\n\n${design.agreedDesign}`,
                },
            ],
        };
    });
    // Session progress summary
    server.resource("progress", "duo://progress", async (uri) => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: "No active Duo session.",
                    },
                ],
            };
        }
        const session = state.getSession();
        const tasks = state.getTasks();
        const done = tasks.filter((t) => t.status === "done").length;
        const humanTasks = tasks.filter((t) => t.assignee === "human");
        const aiTasks = tasks.filter((t) => t.assignee === "ai");
        const summary = [
            `Phase: ${session.phase}`,
            `Tasks: ${done}/${tasks.length} complete`,
            `Human: ${humanTasks.filter((t) => t.status === "done").length}/${humanTasks.length} done`,
            `AI: ${aiTasks.filter((t) => t.status === "done").length}/${aiTasks.length} done`,
            `Started: ${session.startedAt}`,
        ].join("\n");
        return {
            contents: [{ uri: uri.href, mimeType: "text/plain", text: summary }],
        };
    });
}
//# sourceMappingURL=resources.js.map