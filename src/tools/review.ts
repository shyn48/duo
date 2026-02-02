/**
 * Review and integration tools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStateInstanceAutoLoad } from "../resources.js";

export function registerReviewTools(server: McpServer) {
  // ── Start review for a task ──
  server.tool(
    "duo_review_start",
    "Begin the review process for a completed task. Sets the task to review status.",
    {
      taskId: z.string().describe("Task to review"),
    },
    async ({ taskId }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      try {
        await state.updateTaskStatus(taskId, "review");
        await state.setReviewStatus(taskId, "pending");
        const task = state.getTask(taskId);

        const reviewer = task!.assignee === "human" ? "AI" : "Human";

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `🔍 Review started for task [${taskId}]: ${task!.description}`,
                `Reviewer: ${reviewer}`,
                "",
                task!.assignee === "ai"
                  ? "Human: please review the AI-written code. Check for correctness, patterns, and that you understand the changes."
                  : "AI: reviewing human-written code. Will check for bugs, edge cases, and patterns.",
              ].join("\n"),
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

  // ── Submit review feedback ──
  server.tool(
    "duo_review_submit",
    "Submit review feedback for a task.",
    {
      taskId: z.string().describe("Task being reviewed"),
      approved: z.boolean().describe("Whether the code is approved"),
      feedback: z
        .string()
        .describe("Review feedback — what's good, what needs changes")
        .default(""),
    },
    async ({ taskId, approved, feedback }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      try {
        const status = approved ? "approved" : "changes_requested";
        await state.setReviewStatus(taskId, status, feedback);

        if (approved) {
          await state.updateTaskStatus(taskId, "done");
        }

        const icon = approved ? "✅" : "🔄";
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `${icon} Review for task [${taskId}]: ${approved ? "Approved!" : "Changes requested"}`,
                feedback ? `\nFeedback: ${feedback}` : "",
              ].join(""),
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

  // ── Integration ──
  server.tool(
    "duo_integrate",
    "Run integration phase: check all tasks are done, summarize the session.",
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

      const tasks = state.getTasks();
      const pending = tasks.filter((t) => t.status !== "done");

      if (pending.length > 0) {
        const pendingList = pending
          .map((t) => `  - [${t.id}] ${t.description} (${t.status})`)
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: [
                "⚠️ Not all tasks are complete:",
                pendingList,
                "",
                "Complete or close pending tasks before integrating.",
              ].join("\n"),
            },
          ],
        };
      }

      const humanTasks = tasks.filter((t) => t.assignee === "human");
      const aiTasks = tasks.filter((t) => t.assignee === "ai");

      await state.setPhase("integrating");

      return {
        content: [
          {
            type: "text" as const,
            text: [
              "🔗 Integration phase!",
              "",
              `All ${tasks.length} tasks complete:`,
              `  🧑 Human: ${humanTasks.length} tasks`,
              `  🤖 AI: ${aiTasks.length} tasks`,
              "",
              "Next steps:",
              "1. Run the test suite",
              "2. Fix any failures collaboratively",
              "3. Commit with a descriptive message",
              "",
              "Run tests and report results.",
            ].join("\n"),
          },
        ],
      };
    },
  );
}
