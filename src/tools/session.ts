/**
 * Session management tools — start, status, phase transitions
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DuoState } from "../state.js";
import { setStateInstance, getStateInstanceAutoLoad } from "../resources.js";
import type { SessionPhase } from "../types.js";
import { DashboardServer } from "../dashboard/index.js";
import { exec } from "node:child_process";
import { ensureDocsDir, saveDocument } from "./document.js";
import { ensureMemoryDir } from "../memory/checkpoint.js";
import { ensureChatDir } from "../memory/chat.js";
import { saveSessionMetadata } from "./memory.js";
import { readCodebaseKnowledge, appendCodebaseKnowledge } from "./codebase.js";
import { readDiscoveries, clearDiscoveries, formatDiscoveries, discoveriesToCodebaseUpdates } from "./discovery.js";

let dashboardInstance: DashboardServer | null = null;

function openBrowser(url: string): void {
  const platform = process.platform;
  const command =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${command} ${url}`);
}

export function registerSessionTools(server: McpServer) {
  // ── Start session ──
  server.tool(
    "duo_session_start",
    "Start a new Duo collaborative coding session. Automatically loads codebase knowledge from prior sessions.",
    {
      projectRoot: z.string().describe("Absolute path to the project root directory"),
      dashboardPort: z
        .number()
        .default(3456)
        .describe("Port for the dashboard server (default: 3456)"),
      openDashboard: z
        .boolean()
        .default(true)
        .describe("Automatically open dashboard in browser"),
    },
    async ({ projectRoot, dashboardPort, openDashboard }) => {
      const state = new DuoState(projectRoot);
      await state.init();

      // Ensure .duo directories exist
      await ensureDocsDir(state.getStateDir());
      await ensureMemoryDir(state.getStateDir());
      await ensureChatDir(state.getStateDir());

      // Only set to design if this is a fresh session
      const session = state.getSession();
      const isExisting = session.taskBoard.tasks.length > 0 || session.phase !== "idle";
      if (!isExisting) {
        await state.setPhase("design");
      }
      setStateInstance(state);

      // 📚 Read codebase knowledge (creates template if new)
      const { content: codebaseKnowledge, isNew: isNewCodebase } = 
        await readCodebaseKnowledge(state.getStateDir());

      await state.logChat(
        "system",
        "event",
        isExisting ? "Session resumed" : "Session started",
      );

      // Start dashboard
      let dashboardUrl = "";
      try {
        dashboardInstance = new DashboardServer(state, dashboardPort);
        state.setDashboard(dashboardInstance);
        dashboardUrl = await dashboardInstance.start();
        if (openDashboard) {
          openBrowser(dashboardUrl);
        }
      } catch (err: any) {
        console.error(`Dashboard failed to start: ${err.message}`);
      }

      const phase = state.getPhase();
      const tasks = state.getTasks();
      
      // Build codebase context section (truncate if large)
      const maxCodebaseChars = 1500;
      const codebaseSection = isNewCodebase
        ? [
            "",
            "📚 **Codebase Knowledge:** New project! Created `.duo/CODEBASE.md`",
            "   Update it as you discover patterns, architecture, and gotchas.",
          ]
        : [
            "",
            "📚 **Codebase Knowledge** (from prior sessions):",
            "```markdown",
            codebaseKnowledge.length > maxCodebaseChars
              ? codebaseKnowledge.slice(0, maxCodebaseChars) + "\n... (see .duo/CODEBASE.md for full)"
              : codebaseKnowledge,
            "```",
          ];
      
      const msg = isExisting
        ? [
            "🔄 Duo session resumed!",
            "",
            `Project: ${projectRoot}`,
            `Phase: ${phase}`,
            `Tasks: ${tasks.length} (${tasks.filter(t => t.status === "done").length} done)`,
            dashboardUrl ? `\n📊 Dashboard: ${dashboardUrl}` : "",
            ...codebaseSection,
          ]
        : [
            "🎯 Duo session started!",
            "",
            `Project: ${projectRoot}`,
            "Phase: Design",
            dashboardUrl ? `\n📊 Dashboard: ${dashboardUrl}` : "",
            ...codebaseSection,
            "",
            "Let's begin the design discussion.",
            "Describe the task, and tell me if you have a design in mind.",
          ];

      return {
        content: [
          {
            type: "text" as const,
            text: msg.filter(Boolean).join("\n"),
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

      const dashboardUrl = dashboardInstance?.getUrl();
      const dashboardStatus = dashboardUrl
        ? `\n📊 Dashboard: ${dashboardUrl}`
        : "";

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `📊 Duo Session Status`,
              `Phase: ${session.phase}`,
              `Started: ${session.startedAt}`,
              dashboardStatus,
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

      // Auto-checkpoint on every phase transition
      try {
        await state.checkpoint(`Phase transition to ${phase}`);
      } catch {
        // Non-critical — don't fail the phase advance
      }

      // Log phase change
      await state.logChat("system", "event", `Phase advanced to ${phase}`);

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

      // Auto-save design to .duo/docs/
      const designContent = [
        `# ${taskDescription}`,
        "",
        agreedDesign,
        "",
        decisions.length > 0
          ? `## Decisions\n${decisions.map((d) => `- ${d}`).join("\n")}`
          : "",
        deferredItems.length > 0
          ? `## Deferred\n${deferredItems.map((d) => `- ${d}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      let docNote = "";
      try {
        const filename = await saveDocument(state.getStateDir(), {
          title: taskDescription,
          content: designContent,
          phase: state.getPhase(),
          category: "design",
        });
        docNote = `\nDoc: ${filename}`;
      } catch {
        // Non-critical — don't fail the design save
      }

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
              docNote,
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
    "End the current Duo session. Shows collected discoveries and prompts for CODEBASE.md updates.",
    {
      summary: z
        .string()
        .optional()
        .describe("Summary of what was accomplished (auto-generated if not provided)"),
      keyLearnings: z
        .array(z.string())
        .optional()
        .describe("Key insights or lessons from this session"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorizing this session (e.g., 'auth', 'api', 'refactor')"),
      codebaseUpdates: z
        .object({
          architecture: z.string().optional().describe("New architecture insights"),
          patterns: z.array(z.string()).optional().describe("Patterns discovered"),
          files: z.array(z.object({
            path: z.string(),
            purpose: z.string(),
          })).optional().describe("Important files and their purposes"),
          gotchas: z.array(z.string()).optional().describe("Gotchas or warnings discovered"),
          conventions: z.array(z.string()).optional().describe("Coding conventions observed"),
        })
        .optional()
        .describe("Updates to add to CODEBASE.md (or use includeDiscoveries to auto-include)"),
      includeDiscoveries: z
        .boolean()
        .optional()
        .default(true)
        .describe("Automatically include collected discoveries in CODEBASE.md"),
      keepState: z
        .boolean()
        .describe("Keep .duo state files for reference")
        .default(true),
    },
    async ({ summary, keyLearnings, tags, codebaseUpdates, includeDiscoveries, keepState }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [
            { type: "text" as const, text: "No active Duo session." },
          ],
        };
      }

      const session = state.getSession();
      const tasks = state.getTasks();
      const done = tasks.filter((t) => t.status === "done").length;

      // Read collected discoveries
      const discoveries = await readDiscoveries(state.getStateDir());
      const hasDiscoveries = discoveries.length > 0;

      // Auto-generate summary if not provided
      const autoSummary = summary || 
        `${session.design?.taskDescription || "Duo session"} — ${done}/${tasks.length} tasks completed`;

      // Archive session to .duo/sessions/
      let archivePath: string | null = null;
      try {
        archivePath = await saveSessionMetadata(
          state.getStateDir(),
          session,
          autoSummary,
          keyLearnings,
          tags,
        );
      } catch (e) {
        console.error("Failed to archive session:", e);
      }

      // 📚 Update CODEBASE.md
      let codebaseUpdated = false;
      
      // Merge explicit codebaseUpdates with discoveries (if includeDiscoveries is true)
      let finalUpdates = codebaseUpdates || {};
      if (includeDiscoveries && hasDiscoveries) {
        const discoveryUpdates = discoveriesToCodebaseUpdates(discoveries);
        // Merge: discoveries + explicit (explicit wins on conflict)
        finalUpdates = {
          architecture: finalUpdates.architecture || discoveryUpdates.architecture,
          patterns: [...(discoveryUpdates.patterns || []), ...(finalUpdates.patterns || [])],
          files: [...(discoveryUpdates.files || []), ...(finalUpdates.files || [])],
          gotchas: [...(discoveryUpdates.gotchas || []), ...(finalUpdates.gotchas || [])],
          conventions: [...(discoveryUpdates.conventions || []), ...(finalUpdates.conventions || [])],
        };
        // Clean up empty arrays
        if (finalUpdates.patterns?.length === 0) delete finalUpdates.patterns;
        if (finalUpdates.files?.length === 0) delete finalUpdates.files;
        if (finalUpdates.gotchas?.length === 0) delete finalUpdates.gotchas;
        if (finalUpdates.conventions?.length === 0) delete finalUpdates.conventions;
      }
      
      if (Object.keys(finalUpdates).length > 0) {
        try {
          await appendCodebaseKnowledge(state.getStateDir(), finalUpdates);
          codebaseUpdated = true;
        } catch (e) {
          console.error("Failed to update codebase knowledge:", e);
        }
      }

      // Clear discoveries for next session
      await clearDiscoveries(state.getStateDir());

      await state.logChat(
        "system",
        "event",
        `Session ended — ${done}/${tasks.length} tasks done, ${discoveries.length} discoveries`,
      );

      // Stop dashboard
      if (dashboardInstance) {
        await dashboardInstance.stop();
        dashboardInstance = null;
      }

      if (!keepState) {
        await state.clear();
      }

      setStateInstance(null as unknown as DuoState);

      // Build response with discovery summary
      const responseLines = [
        "👋 Duo session ended!",
        "",
        `Tasks completed: ${done}/${tasks.length}`,
      ];
      
      if (hasDiscoveries) {
        responseLines.push("");
        responseLines.push(`📝 Discoveries collected: ${discoveries.length}`);
        responseLines.push(formatDiscoveries(discoveries));
      }
      
      responseLines.push("");
      responseLines.push(archivePath
        ? `📁 Archived: ${archivePath}`
        : "⚠️ Archive failed");
      responseLines.push(codebaseUpdated
        ? `📚 CODEBASE.md updated with ${hasDiscoveries ? "discoveries + " : ""}knowledge`
        : (hasDiscoveries 
            ? "⚠️ Discoveries not saved (pass includeDiscoveries: true)"
            : "💡 Tip: Use duo_note_discovery during sessions to collect insights"));
      responseLines.push(keepState
        ? "State files preserved in .duo/"
        : "State files cleaned up.");

      return {
        content: [
          {
            type: "text" as const,
            text: responseLines.join("\n"),
          },
        ],
      };
    },
  );
}
