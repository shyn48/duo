/**
 * Subagent spawning tools — delegate AI tasks to sub-agents
 */
import { z } from "zod";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getStateInstanceAutoLoad } from "../resources.js";
export function registerSubagentTools(server) {
    server.tool("duo_subagent_spawn", "Spawn a sub-agent for an AI-assigned task. Returns a structured prompt that the mother agent can use to spawn via whatever mechanism is available (OpenClaw sessions_spawn, Claude Code Task, etc.).", {
        taskId: z.string().describe("Task ID to assign to the sub-agent"),
        description: z.string().describe("Brief description of the sub-agent's job"),
        prompt: z.string().describe("Detailed instructions for the sub-agent"),
        files: z
            .array(z.string())
            .describe("Files the sub-agent should focus on")
            .default([]),
        dependencies: z
            .array(z.string())
            .describe("Task IDs that must complete before this sub-agent starts")
            .default([]),
        model: z
            .string()
            .describe("Preferred model for the sub-agent (platform-dependent)")
            .optional(),
        background: z
            .boolean()
            .describe("Whether the sub-agent should run in the background")
            .default(true),
    }, async ({ taskId, description, prompt, files, dependencies, model, background }) => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return {
                content: [
                    { type: "text", text: "No active Duo session." },
                ],
            };
        }
        // Validate the task exists
        const task = state.getTask(taskId);
        if (!task) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: Task ${taskId} not found on the task board.`,
                    },
                ],
                isError: true,
            };
        }
        // Check dependencies are done
        for (const depId of dependencies) {
            const dep = state.getTask(depId);
            if (!dep) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: Dependency task ${depId} not found.`,
                        },
                    ],
                    isError: true,
                };
            }
            if (dep.status !== "done") {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: Dependency task [${depId}] is not done yet (status: ${dep.status}). Wait for it to complete.`,
                        },
                    ],
                    isError: true,
                };
            }
        }
        // Update task status to in_progress
        await state.updateTaskStatus(taskId, "in_progress");
        // Build the subagent prompt with project context
        const design = state.getDesign();
        const session = state.getSession();
        const contextParts = [
            `# Sub-Agent Task: ${description}`,
            "",
            "## Project Context",
            `- Project root: ${session.projectRoot}`,
            `- Session phase: ${session.phase}`,
        ];
        if (design) {
            contextParts.push("", "## Design Summary", `Task: ${design.taskDescription}`, "", design.agreedDesign);
            if (design.decisions.length > 0) {
                contextParts.push("", "### Key Decisions", ...design.decisions.map((d) => `- ${d}`));
            }
        }
        if (files.length > 0) {
            contextParts.push("", "## Focus Files", ...files.map((f) => `- ${f}`));
        }
        const resultPath = join(session.projectRoot, ".duo", "subagent-results", `${taskId}.md`);
        contextParts.push("", "## Task Instructions", prompt, "", "## Constraints", "- Stay focused on the assigned task", "- Follow the design decisions above", "- Do NOT modify files outside your assigned scope", "", "## REQUIRED OUTPUT CONTRACT", `When you finish, you MUST write your results to: ${resultPath}`, "Use exactly this format:", "```", `taskId: ${taskId}`, "status: done", "filesChanged:", "  - path/to/file.go", "summary: |", "  Brief description of what was implemented.", "issues:", "  - Any concerns or questions for the orchestrator (or empty)", "completedAt: <ISO timestamp>", "```", "This file is the ONLY communication channel back to the mother agent.", "Do not rely on conversation text for handoff.");
        const subagentPrompt = contextParts.join("\n");
        // Log subagent spawn
        await state.logChat("system", "event", `Sub-agent spawned for task [${taskId}]: ${description}`, taskId);
        // Ensure subagent-results dir exists
        const resultsDir = join(session.projectRoot, ".duo", "subagent-results");
        if (!existsSync(resultsDir)) {
            await mkdir(resultsDir, { recursive: true });
        }
        // Track the subagent in session state
        const spawnedAt = new Date().toISOString();
        await state.addSubagent({
            taskId,
            status: "pending",
            spawnedAt,
            prompt: subagentPrompt,
            resultPath,
        });
        const result = {
            taskId,
            description,
            status: "spawned",
            background,
            model: model ?? "default",
            files,
            dependencies,
            subagentPrompt,
            message: `Sub-agent spawned for task [${taskId}]: ${description}`,
        };
        return {
            content: [
                {
                    type: "text",
                    text: [
                        `🤖 Sub-agent ready for task [${taskId}]: ${description}`,
                        "",
                        background ? "Mode: Background" : "Mode: Foreground",
                        model ? `Model: ${model}` : "",
                        files.length > 0 ? `Files: ${files.join(", ")}` : "",
                        dependencies.length > 0
                            ? `Dependencies: ${dependencies.join(", ")} (all complete)`
                            : "",
                        "",
                        `Result will be written to: .duo/subagent-results/${taskId}.md`,
                        "",
                        "REQUIRED NEXT: Spawn the sub-agent using the subagentPrompt below via sessions_spawn.",
                        "After it completes, call duo_subagent_read_result to retrieve and integrate its output.",
                    ]
                        .filter(Boolean)
                        .join("\n"),
                },
            ],
            structuredContent: result,
        };
    });
    // ── Read sub-agent result ──
    server.tool("duo_subagent_read_result", "Read the structured result written by a sub-agent after it finishes. Sub-agents write to .duo/subagent-results/{taskId}.md when done. Call this to retrieve and integrate their work.", {
        taskId: z.string().describe("Task ID to read results for"),
    }, async ({ taskId }) => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return { content: [{ type: "text", text: "No active Duo session." }] };
        }
        const session = state.getSession();
        const resultPath = join(session.projectRoot, ".duo", "subagent-results", `${taskId}.md`);
        if (!existsSync(resultPath)) {
            return {
                content: [{
                        type: "text",
                        text: [
                            `⏳ Sub-agent result for [${taskId}] not found yet.`,
                            `Expected at: ${resultPath}`,
                            "",
                            "The sub-agent hasn't completed yet, or hasn't written its result file.",
                            "Check again when the sub-agent finishes.",
                        ].join("\n"),
                    }],
            };
        }
        const raw = await readFile(resultPath, "utf-8");
        return {
            content: [{
                    type: "text",
                    text: [
                        `✅ Sub-agent result for [${taskId}]:`,
                        "",
                        raw,
                        "",
                        "REQUIRED NEXT: Review the result, then call duo_subagent_mark_complete to update session state.",
                    ].join("\n"),
                }],
        };
    });
    // ── Mark sub-agent complete ──
    server.tool("duo_subagent_mark_complete", "Mark a sub-agent task as complete after reviewing its result. Updates session state, records files changed, and auto-checkpoints. Call this after duo_subagent_read_result once you've reviewed the work.", {
        taskId: z.string().describe("Task ID to mark complete"),
        filesChanged: z.array(z.string()).describe("Files the sub-agent modified").default([]),
        summary: z.string().describe("Brief summary of what was done"),
        issues: z.array(z.string()).describe("Any issues or concerns found in the sub-agent output").default([]),
        status: z.enum(["completed", "failed", "partial"]).describe("Outcome of the sub-agent work").default("completed"),
    }, async ({ taskId, filesChanged, summary, issues, status }) => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return { content: [{ type: "text", text: "No active Duo session." }] };
        }
        const task = state.getTask(taskId);
        if (!task) {
            return {
                content: [{ type: "text", text: `Task [${taskId}] not found on board.` }],
                isError: true,
            };
        }
        // Update sub-agent tracking
        const subagents = state.getSubagents();
        const sub = subagents.find((s) => s.taskId === taskId);
        if (sub) {
            sub.status = status === "completed" ? "completed" : "failed";
            sub.completedAt = new Date().toISOString();
            sub.filesChanged = filesChanged;
            sub.summary = summary;
            sub.issues = issues;
        }
        // Update task status
        if (status === "completed") {
            await state.updateTaskStatus(taskId, "review");
        }
        else if (status === "failed") {
            await state.updateTaskStatus(taskId, "todo"); // Reset for re-spawn
        }
        // "partial" leaves status as-is for follow-up
        // Auto-checkpoint
        await state.checkpoint(`Sub-agent [${taskId}] ${status}: ${summary.slice(0, 80)}`);
        await state.logChat("system", "event", `Sub-agent [${taskId}] ${status} — ${filesChanged.length} files changed`, taskId);
        const issueWarning = issues.length > 0
            ? [`⚠️ Issues to review:`, ...issues.map((i) => `  - ${i}`)]
            : [];
        const nextStep = status === "completed"
            ? `REQUIRED NEXT: Review the actual code changes in: ${filesChanged.join(", ") || "(see sub-agent result)"}. Then continue with remaining tasks or advance to review phase.`
            : status === "failed"
                ? `REQUIRED NEXT: Task [${taskId}] reset to todo. Investigate the failure, then re-spawn with corrections.`
                : `REQUIRED NEXT: Task [${taskId}] is partial. Assess remaining work and decide: continue sub-agent or take over.`;
        return {
            content: [{
                    type: "text",
                    text: [
                        status === "completed" ? `✅ Sub-agent [${taskId}] marked complete` : `⚠️ Sub-agent [${taskId}] marked ${status}`,
                        `Summary: ${summary}`,
                        filesChanged.length > 0 ? `Files: ${filesChanged.join(", ")}` : "",
                        ...issueWarning,
                        "",
                        nextStep,
                    ].filter(Boolean).join("\n"),
                }],
        };
    });
}
//# sourceMappingURL=subagent.js.map