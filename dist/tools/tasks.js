/**
 * Task management tools — add, update, view, help
 *
 * v0.5.0: Consolidated tools
 * - Merged duo_task_add + duo_task_add_bulk → duo_task_add (accepts single or array)
 * - Merged duo_task_update + duo_task_reassign → duo_task_update (status and/or assignee)
 */
import { z } from "zod";
import { getStateInstanceAutoLoad } from "../resources.js";
const TaskSchema = z.object({
    id: z.string().describe("Short task identifier (e.g., '1', 'auth-logic', 'T3')"),
    description: z.string().describe("What this task involves"),
    assignee: z.enum(["human", "ai"]).describe("Who should do this task"),
    files: z.array(z.string()).default([]).describe("Files this task will touch"),
});
export function registerTaskTools(server) {
    // ── Add task(s) to the board ──
    server.tool("duo_task_add", "Add one or more tasks to the Duo task board during planning phase.", {
        // Accept either a single task or an array of tasks
        task: TaskSchema.optional().describe("Single task to add"),
        tasks: z.array(TaskSchema).optional().describe("Multiple tasks to add at once"),
    }, async ({ task, tasks }) => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return {
                content: [{ type: "text", text: "No active Duo session." }],
            };
        }
        // Normalize input: single task or array
        const taskList = tasks || (task ? [task] : []);
        if (taskList.length === 0) {
            return {
                content: [{ type: "text", text: "No tasks provided. Use 'task' for single or 'tasks' for multiple." }],
                isError: true,
            };
        }
        for (const t of taskList) {
            await state.addTask(t.id, t.description, t.assignee, t.files);
        }
        if (taskList.length === 1) {
            const t = taskList[0];
            const icon = t.assignee === "human" ? "🧑" : "🤖";
            return {
                content: [{ type: "text", text: `${icon} Task [${t.id}] added: ${t.description}` }],
            };
        }
        return {
            content: [{
                    type: "text",
                    text: `✅ Added ${taskList.length} tasks\n\n${state.formatTaskBoard()}`,
                }],
        };
    });
    // ── Update task (status and/or assignee) ──
    server.tool("duo_task_update", "Update a task's status and/or reassign it. Can change status, assignee, or both.", {
        id: z.string().describe("Task identifier"),
        status: z
            .enum(["todo", "in_progress", "review", "done"])
            .optional()
            .describe("New status (optional)"),
        assignee: z
            .enum(["human", "ai"])
            .optional()
            .describe("New assignee (optional)"),
    }, async ({ id, status, assignee }) => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return {
                content: [{ type: "text", text: "No active Duo session." }],
            };
        }
        if (!status && !assignee) {
            return {
                content: [{ type: "text", text: "Provide at least 'status' or 'assignee' to update." }],
                isError: true,
            };
        }
        try {
            const results = [];
            // Update status if provided
            if (status) {
                const task = await state.updateTaskStatus(id, status);
                // Auto-checkpoint when task is completed
                if (status === "done") {
                    await state.checkpoint(`Task ${id} completed`);
                }
                await state.logChat("system", "event", `Task [${id}] status → ${status}`, id);
                const statusIcons = {
                    todo: "⬜",
                    in_progress: "🔵",
                    review: "🟡",
                    done: "✅",
                };
                results.push(`${statusIcons[status]} Status → ${status}`);
            }
            // Update assignee if provided
            if (assignee) {
                const task = await state.reassignTask(id, assignee);
                await state.logChat("system", "event", `Task [${id}] reassigned to ${assignee}`, id);
                const icon = assignee === "human" ? "🧑" : "🤖";
                results.push(`${icon} Assignee → ${assignee}`);
            }
            return {
                content: [{
                        type: "text",
                        text: `Task [${id}] updated:\n${results.join("\n")}`,
                    }],
            };
        }
        catch (e) {
            return {
                content: [{ type: "text", text: `Error: ${e.message}` }],
                isError: true,
            };
        }
    });
    // ── Show task board ──
    server.tool("duo_task_board", "Display the current task board with status of all tasks.", {}, async () => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return {
                content: [{ type: "text", text: "No active Duo session." }],
            };
        }
        return {
            content: [{ type: "text", text: state.formatTaskBoard() }],
        };
    });
    // ── Help request ──
    server.tool("duo_help_request", "Log a help request from the human. Use escalating help: hints → pseudocode → implementation.", {
        taskId: z.string().describe("Task the human needs help with"),
        question: z.string().describe("What specifically they're stuck on"),
        level: z
            .enum(["hint", "pseudocode", "implementation"])
            .default("hint")
            .describe("Level of help: hint (conceptual), pseudocode (approach), implementation (code)"),
    }, async ({ taskId, question, level }) => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return {
                content: [{ type: "text", text: "No active Duo session." }],
            };
        }
        const task = state.getTask(taskId);
        if (!task) {
            return {
                content: [{ type: "text", text: `Task ${taskId} not found.` }],
                isError: true,
            };
        }
        const levelMessages = {
            hint: `💡 **Hint for task [${taskId}]** "${task.description}"\n\nQuestion: ${question}\n\n→ Provide a conceptual hint without code. Point in the right direction.`,
            pseudocode: `📝 **Pseudocode for task [${taskId}]** "${task.description}"\n\nQuestion: ${question}\n\n→ Provide pseudocode or a pattern reference. Show the approach without full implementation.`,
            implementation: `💻 **Implementation help for task [${taskId}]** "${task.description}"\n\nQuestion: ${question}\n\n→ Provide actual code. The human explicitly asked for implementation help.`,
        };
        return {
            content: [{ type: "text", text: levelMessages[level] }],
        };
    });
}
//# sourceMappingURL=tasks.js.map