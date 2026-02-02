/**
 * Session management tools — start, status, phase transitions
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DuoState } from "../state.js";
import { setStateInstance, getStateInstanceAutoLoad } from "../resources.js";
import type { SessionPhase } from "../types.js";

export function registerSessionTools(server: McpServer) {
  // ── Start a Duo session ──
  server.tool(
    "duo_session_start",
    "Start a new Duo collaborative coding session. Call this at the beginning of a task when using the Duo workflow.",
    { projectRoot: z.string().describe("Absolute path to the project root directory") },
    async ({ projectRoot }) => {
      const state = new DuoState(projectRoot);
      await state.init();

      // Only set to design if this is a fresh session (no existing state)
      const session = state.getSession();
      const isExisting = session.taskBoard.tasks.length > 0 || session.phase !== "idle";
      if (!isExisting) {
        await state.setPhase("design");
      }
      setStateInstance(state);

      const phase = state.getPhase();
      const tasks = state.getTasks();
      const msg = isExisting
        ? [
            "🔄 Duo session resumed!",
            "",
            `Project: ${projectRoot}`,
            `Phase: ${phase}`,
            `Tasks: ${tasks.length} (${tasks.filter(t => t.status === "done").length} done)`,
          ]
        : [
            "🎯 Duo session started!",
            "",
            `Project: ${projectRoot}`,
            "Phase: Design",
            "",
            "Let's begin the design discussion.",
            "Describe the task, and tell me if you have a design in mind.",
          ];

      return {
        content: [
          {
            type: "text" as const,
            text: msg.join("\n"),
          },
        ],
      };
    },
  );

  // ── Get session status ──
  server.tool(
    "duo_session_status",
    "Show the current Duo session status including phase, task board, and progress.",
    {},
    async () => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No active Duo session. Use duo_session_start to begin.",
            },
          ],
        };
      }

      const session = state.getSession();
      const board = state.formatTaskBoard();

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `📊 Duo Session Status`,
              `Phase: ${session.phase}`,
              `Started: ${session.startedAt}`,
              "",
              board,
            ].join("\n"),
          },
        ],
      };
    },
  );

  // ── Advance to next phase ──
  server.tool(
    "duo_phase_advance",
    "Move the Duo session to the next phase. Phases: design → planning → executing → reviewing → integrating → idle",
    {
      phase: z
        .enum(["design", "planning", "executing", "reviewing", "integrating", "idle"])
        .describe("The phase to transition to"),
    },
    async ({ phase }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      await state.setPhase(phase as SessionPhase);

      const phaseMessages: Record<string, string> = {
        design: "🎨 Design phase — Let's discuss the approach.",
        planning: "📋 Planning phase — Breaking down tasks and assigning work.",
        executing:
          "⚡ Execution phase — Time to code! I'll work on my tasks, you work on yours.",
        reviewing:
          "🔍 Review phase — Cross-reviewing each other's code.",
        integrating:
          "🔗 Integration phase — Merging, testing, and committing.",
        idle: "✅ Session complete!",
      };

      return {
        content: [
          {
            type: "text" as const,
            text: phaseMessages[phase] ?? `Phase set to: ${phase}`,
          },
        ],
      };
    },
  );

  // ── Save design document ──
  server.tool(
    "duo_design_save",
    "Save the agreed design document after the design discussion phase.",
    {
      taskDescription: z.string().describe("Brief description of the task"),
      agreedDesign: z.string().describe("The agreed-upon design/approach"),
      decisions: z
        .array(z.string())
        .describe("Key design decisions made")
        .default([]),
      deferredItems: z
        .array(z.string())
        .describe("Items deferred for later")
        .default([]),
    },
    async ({ taskDescription, agreedDesign, decisions, deferredItems }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      await state.setDesign({
        taskDescription,
        agreedDesign,
        decisions,
        deferredItems,
        createdAt: new Date().toISOString(),
      });

      return {
        content: [
          {
            type: "text" as const,
            text: [
              "📝 Design saved!",
              "",
              `Task: ${taskDescription}`,
              `Decisions: ${decisions.length}`,
              `Deferred: ${deferredItems.length}`,
              "",
              "Ready to move to planning phase.",
            ].join("\n"),
          },
        ],
      };
    },
  );

  // ── End session ──
  server.tool(
    "duo_session_end",
    "End the current Duo session and clean up state.",
    {
      keepState: z
        .boolean()
        .describe("Keep .duo state files for reference")
        .default(true),
    },
    async ({ keepState }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      const tasks = state.getTasks();
      const done = tasks.filter((t) => t.status === "done").length;

      if (!keepState) {
        await state.clear();
      }

      setStateInstance(null as unknown as DuoState);

      return {
        content: [
          {
            type: "text" as const,
            text: [
              "👋 Duo session ended!",
              "",
              `Tasks completed: ${done}/${tasks.length}`,
              keepState
                ? "State files preserved in .duo/"
                : "State files cleaned up.",
            ].join("\n"),
          },
        ],
      };
    },
  );
}
