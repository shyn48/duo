/**
 * Task management tools — add, update, reassign, help
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStateInstanceAutoLoad } from "../resources.js";
import type { TaskAssignee, TaskStatus } from "../types.js";

export function registerTaskTools(server: McpServer) {
  // ── Add a task to the board ──
  server.tool(
    "duo_task_add",
    "Add a task to the Duo task board during the planning phase.",
    {
      id: z.string().describe("Short task identifier (e.g., '1', 'auth-logic', 'T3')"),
      description: z.string().describe("What this task involves"),
      assignee: z
        .enum(["human", "ai"])
        .describe("Who should do this task"),
      files: z
        .array(z.string())
        .describe("Files this task will touch")
        .default([]),
    },
    async ({ id, description, assignee, files }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      const task = await state.addTask(
        id,
        description,
        assignee as TaskAssignee,
        files,
      );
      const icon = task.assignee === "human" ? "🧑" : "🤖";

      return {
        content: [
          {
            type: "text" as const,
            text: `${icon} Task [${task.id}] added: ${task.description}`,
          },
        ],
      };
    },
  );

  // ── Bulk add tasks ──
  server.tool(
    "duo_task_add_bulk",
    "Add multiple tasks to the board at once during planning.",
    {
      tasks: z.array(
        z.object({
          id: z.string(),
          description: z.string(),
          assignee: z.enum(["human", "ai"]),
          files: z.array(z.string()).default([]),
        }),
      ).describe("Array of tasks to add"),
    },
    async ({ tasks: taskList }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      for (const t of taskList) {
        await state.addTask(t.id, t.description, t.assignee as TaskAssignee, t.files);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `✅ Added ${taskList.length} tasks`,
              "",
              state.formatTaskBoard(),
            ].join("\n"),
          },
        ],
      };
    },
  );

  // ── Update task status ──
  server.tool(
    "duo_task_update",
    "Update the status of a task (todo → in_progress → review → done).",
    {
      id: z.string().describe("Task identifier"),
      status: z
        .enum(["todo", "in_progress", "review", "done"])
        .describe("New status"),
    },
    async ({ id, status }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      try {
        const task = await state.updateTaskStatus(
          id,
          status as TaskStatus,
        );
        const statusIcons: Record<string, string> = {
          todo: "⬜",
          in_progress: "🔵",
          review: "🟡",
          done: "✅",
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `${statusIcons[status]} Task [${task.id}] → ${status}`,
            },
          ],
          _meta: {
            from: "system" as const,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(e as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Reassign a task ──
  server.tool(
    "duo_task_reassign",
    "Reassign a task between human and AI. Use when the human wants to swap tasks mid-flight.",
    {
      id: z.string().describe("Task identifier"),
      assignee: z
        .enum(["human", "ai"])
        .describe("New assignee"),
    },
    async ({ id, assignee }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      try {
        const task = await state.reassignTask(
          id,
          assignee as TaskAssignee,
        );
        const icon = assignee === "human" ? "🧑" : "🤖";

        return {
          content: [
            {
              type: "text" as const,
              text: `${icon} Task [${task.id}] reassigned to ${assignee}: ${task.description}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(e as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Show task board ──
  server.tool(
    "duo_task_board",
    "Display the current task board with status of all tasks.",
    {},
    async () => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      return {
        content: [
          { type: "text" as const, text: state.formatTaskBoard() },
        ],
      };
    },
  );

  // ── Help request ──
  server.tool(
    "duo_help_request",
    "Log a help request from the human. Use escalating help: hints → pseudocode → implementation.",
    {
      taskId: z.string().describe("Task the human needs help with"),
      question: z.string().describe("What specifically they're stuck on"),
      escalationLevel: z
        .enum(["hint", "pseudocode", "implementation"])
        .describe("Level of help to provide")
        .default("hint"),
    },
    async ({ taskId, question, escalationLevel }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      const task = state.getTask(taskId);
      if (!task) {
        return {
          content: [
            { type: "text" as const, text: `Task ${taskId} not found.` },
          ],
          isError: true,
        };
      }

      const levelMessages: Record<string, string> = {
        hint: `💡 Hint for task [${taskId}] "${task.description}":\nQuestion: ${question}\n\nProvide a conceptual hint without code. Point in the right direction.`,
        pseudocode: `📝 Pseudocode for task [${taskId}] "${task.description}":\nQuestion: ${question}\n\nProvide pseudocode or a pattern reference. Show the approach without full implementation.`,
        implementation: `💻 Implementation help for task [${taskId}] "${task.description}":\nQuestion: ${question}\n\nProvide actual code. The human explicitly asked for implementation help.`,
      };

      return {
        content: [
          { type: "text" as const, text: levelMessages[escalationLevel] },
        ],
        _meta: {
          from: "system" as const,
          timestamp: new Date().toISOString(),
        },
      };
    },
  );
}
