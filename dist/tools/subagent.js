/**
 * Subagent spawning tools — delegate AI tasks to sub-agents
 */
import { z } from "zod";
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
        contextParts.push("", "## Task Instructions", prompt, "", "## Constraints", "- Stay focused on the assigned task", "- Follow the design decisions above", "- Report completion status when done");
        const subagentPrompt = contextParts.join("\n");
        // Track the subagent in session state
        const spawnedAt = new Date().toISOString();
        await state.addSubagent({
            taskId,
            status: "pending",
            spawnedAt,
            prompt: subagentPrompt,
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
                        "Use the subagentPrompt from the structured response to spawn the sub-agent via your platform's mechanism.",
                    ]
                        .filter(Boolean)
                        .join("\n"),
                },
            ],
            structuredContent: result,
        };
    });
}
//# sourceMappingURL=subagent.js.map