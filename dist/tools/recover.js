/**
 * Session recovery tool — restore from latest checkpoint
 */
import { getStateInstanceAutoLoad } from "../resources.js";
import { listCheckpoints, readLatestCheckpoint, } from "../memory/checkpoint.js";
export function registerRecoverTools(server) {
    server.tool("duo_recover_session", "Recover a Duo session from the most recent memory checkpoint. Auto-detects checkpoints in .duo/memory/. Use this after a crash or context loss.", {}, async () => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No active Duo session. Use duo_session_start to begin.",
                    },
                ],
            };
        }
        const stateDir = state.getStateDir();
        const files = await listCheckpoints(stateDir);
        if (files.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No checkpoints found in .duo/memory/. Nothing to recover.",
                    },
                ],
            };
        }
        const checkpoint = await readLatestCheckpoint(stateDir);
        if (!checkpoint) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Failed to read latest checkpoint.",
                    },
                ],
                isError: true,
            };
        }
        // Restore session state
        await state.setPhase(checkpoint.phase);
        if (checkpoint.design) {
            await state.setDesign(checkpoint.design);
        }
        // Restore tasks — clear existing and re-add from checkpoint
        const currentTasks = state.getTasks();
        const checkpointTaskIds = new Set(checkpoint.tasks.map((t) => t.id));
        // Add any tasks from checkpoint that don't exist yet
        for (const task of checkpoint.tasks) {
            const existing = state.getTask(task.id);
            if (!existing) {
                await state.addTask(task.id, task.description, task.assignee, task.files);
            }
            // Restore status if different
            const current = state.getTask(task.id);
            if (current && current.status !== task.status) {
                await state.updateTaskStatus(task.id, task.status);
            }
        }
        // Restore subagents
        const existingSubagents = state.getSubagents();
        for (const sub of checkpoint.subagents) {
            const alreadyTracked = existingSubagents.some((s) => s.taskId === sub.taskId && s.spawnedAt === sub.spawnedAt);
            if (!alreadyTracked) {
                await state.addSubagent(sub);
            }
        }
        // Log recovery
        await state.logChat("system", "event", `Session recovered from checkpoint at ${checkpoint.timestamp}`);
        const totalTasks = checkpoint.tasks.length;
        const doneTasks = checkpoint.tasks.filter((t) => t.status === "done").length;
        return {
            content: [
                {
                    type: "text",
                    text: [
                        `🔄 Session recovered!`,
                        "",
                        `Phase: ${checkpoint.phase}`,
                        `Tasks: ${doneTasks}/${totalTasks} completed`,
                        `Checkpoints available: ${files.length}`,
                        `Last checkpoint: ${checkpoint.timestamp}`,
                        checkpoint.context ? `Context: ${checkpoint.context}` : "",
                        "",
                        checkpoint.decisions.length > 0
                            ? `Key decisions: ${checkpoint.decisions.join(", ")}`
                            : "",
                        checkpoint.filesModified.length > 0
                            ? `Files modified: ${checkpoint.filesModified.join(", ")}`
                            : "",
                    ]
                        .filter(Boolean)
                        .join("\n"),
                },
            ],
        };
    });
}
//# sourceMappingURL=recover.js.map