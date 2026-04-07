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
      const design = state.getDesign();

      // Load latest checkpoint for resume context
      let checkpointSection: string[] = [];
      if (isExisting) {
        try {
          const { readLatestCheckpoint } = await import("../memory/checkpoint.js");
          const checkpoint = await readLatestCheckpoint(state.getStateDir());
          if (checkpoint) {
            checkpointSection = [
              "",
              `🔖 **Last checkpoint:** ${checkpoint.timestamp}`,
              checkpoint.context ? `   Context: ${checkpoint.context}` : "",
            ].filter(Boolean);
          }
        } catch {
          // Non-critical
        }
      }

      // Build design section for resumed sessions
      const designSection: string[] = [];
      if (isExisting && design) {
        const designPreview = design.agreedDesign.slice(0, 600);
        designSection.push(
          "",
          "📝 **Design (from this session):**",
          `Task: ${design.taskDescription}`,
          "",
          designPreview + (design.agreedDesign.length > 600 ? "\n... (see .duo/design.md for full)" : ""),
        );
        if (design.decisions.length > 0) {
          designSection.push(
            "",
            "Key decisions:",
            ...design.decisions.map((d) => `  - ${d}`),
          );
        }
      }

      // Build task board section for resumed sessions
      const taskBoardSection: string[] = [];
      if (isExisting && tasks.length > 0) {
        taskBoardSection.push("", state.formatTaskBoard());
      }

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

      // Build required-next guidance for resumed sessions
      const phaseNextSteps: Record<string, string> = {
        design: "REQUIRED NEXT: Continue design discussion, then call duo_design_save.",
        planning: "REQUIRED NEXT: Call duo_task_add_bulk with task breakdown, present board to human, then duo_approve_task_board.",
        executing: "REQUIRED NEXT: (1) Check sub-agent statuses via duo_subagent_read_result. (2) Stay available for human. (3) Continue from where you left off.",
        reviewing: "REQUIRED NEXT: Continue cross-review. Call duo_review_start / duo_review_submit for each pending task.",
        integrating: "REQUIRED NEXT: Run tests, fix failures, commit, then duo_codebase_update + duo_session_end.",
      };
      const resumeNextStep = phase !== "idle" ? phaseNextSteps[phase] ?? "" : "";

      const msg = isExisting
        ? [
            "🔄 Duo session resumed!",
            "",
            `Project: ${projectRoot}`,
            `Phase: ${phase}`,
            `Tasks: ${tasks.length} (${tasks.filter(t => t.status === "done").length} done)`,
            dashboardUrl ? `\n📊 Dashboard: ${dashboardUrl}` : "",
            ...checkpointSection,
            ...designSection,
            ...taskBoardSection,
            ...codebaseSection,
            resumeNextStep ? "" : "",
            resumeNextStep,
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

      // Phase gate check — block invalid transitions
      const gateError = state.checkPhaseGate(phase as SessionPhase);
      if (gateError) {
        return {
          content: [
            {
              type: "text" as const,
              text: ["🚫 Phase transition blocked:", "", gateError].join("\n"),
            },
          ],
          isError: true,
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

      const phaseInfo: Record<string, { message: string; next: string }> = {
        design: {
          message: "🎨 Design phase — Discussing approach.",
          next: "REQUIRED NEXT: Reach consensus on design, then call duo_design_save.",
        },
        planning: {
          message: "📋 Planning phase — Breaking down the task.",
          next: "REQUIRED NEXT: Call duo_task_add_bulk with the full task breakdown. Both human and AI must have tasks. Then present the board and wait for human approval before calling duo_approve_task_board.",
        },
        executing: {
          message: "⚡ Execution phase — Time to build!",
          next: "__EXECUTING_NEXT__", // replaced below with per-task spawn instructions
        },
        reviewing: {
          message: "🔍 Review phase — Cross-reviewing code.",
          next: "REQUIRED NEXT: For each task call duo_review_start then duo_review_submit. Human reviews AI code, AI reviews human code.",
        },
        integrating: {
          message: "🔗 Integration phase — Final steps.",
          next: "REQUIRED NEXT: (1) Run tests. (2) Fix failures. (3) Commit. (4) Call duo_codebase_update with session learnings. (5) Call duo_session_end.",
        },
        idle: {
          message: "✅ Session complete!",
          next: "Start a new session with duo_session_start when ready.",
        },
      };

      let info = phaseInfo[phase] ?? { message: `Phase: ${phase}`, next: "" };

      // For executing phase: generate per-task spawn instructions
      if (phase === "executing") {
        const tasks = state.getTasks();
        const aiTasks = tasks.filter((t) => t.assignee === "ai" && t.status === "todo");
        const spawnLines: string[] = [
          "REQUIRED NEXT — execute ALL steps in order:",
          "",
          "Step 1: Tell the human to start their tasks in their IDE.",
          "",
          "Step 2: Spawn a sub-agent for EACH AI task listed below.",
          "  For each, call duo_subagent_spawn(taskId, description, prompt, files).",
          "  Then immediately call sessions_spawn with the returned subagentPrompt.",
          "  Do not skip any AI task.",
          "",
        ];

        if (aiTasks.length === 0) {
          spawnLines.push("  (No AI tasks pending — all may already be spawned or done)");
        } else {
          spawnLines.push("  AI tasks to spawn NOW:");
          for (const t of aiTasks) {
            const fileHint = t.files.length > 0 ? ` [${t.files.join(", ")}]` : "";
            spawnLines.push(`    🤖 [${t.id}] ${t.description}${fileHint}`);
          }
        }

        spawnLines.push(
          "",
          "Step 3: After spawning all sub-agents, stay available for the human.",
          "  When a sub-agent completes, call duo_subagent_read_result(taskId) to retrieve its output.",
          "  Then call duo_subagent_mark_complete(taskId, ...) to update state.",
          "",
          "Step 4: Do NOT do AI task work inline. Sub-agents do AI tasks. You orchestrate.",
        );

        info = { message: info.message, next: spawnLines.join("\n") };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: [info.message, "", info.next].join("\n"),
          },
        ],
      };
    },
  );

  // ── Approve task board ──
  server.tool(
    "duo_approve_task_board",
    "Record that the human has approved the task board. REQUIRED before advancing to executing phase. Call this after the human confirms the task breakdown.",
    {},
    async () => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return { content: [{ type: "text" as const, text: "No active Duo session." }] };
      }

      const tasks = state.getTasks();
      if (tasks.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Cannot approve: task board is empty. Add tasks first with duo_task_add_bulk." }],
          isError: true,
        };
      }

      await state.approveTaskBoard();
      const human = tasks.filter((t) => t.assignee === "human").length;
      const ai = tasks.filter((t) => t.assignee === "ai").length;

      return {
        content: [{
          type: "text" as const,
          text: [
            "✅ Task board approved!",
            `🧑 Human: ${human} tasks  🤖 AI: ${ai} tasks`,
            "",
            "REQUIRED NEXT: Call duo_phase_advance with phase='executing' to begin.",
          ].join("\n"),
        }],
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
              "REQUIRED NEXT: Call duo_phase_advance with phase='planning', then call duo_task_add_bulk.",
            ].join("\n"),
          },
        ],
      };
    },
  );



  // ── Orient (re-sync after context loss) ──
  server.tool(
    "duo_orient",
    "Re-orient yourself after a context gap, compaction, or confusion. Returns full session state: phase, design, task board, last checkpoint, and required next step. Call this BEFORE responding whenever you feel lost or unsure of current state.",
    {},
    async () => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [{
            type: "text" as const,
            text: "No active Duo session. Use duo_session_start to begin.",
          }],
        };
      }

      const session = state.getSession();
      const tasks = state.getTasks();
      const design = state.getDesign();
      const done = tasks.filter((t) => t.status === "done").length;
      const inProgress = tasks.filter((t) => t.status === "in_progress");
      const pending = tasks.filter((t) => t.status === "todo");

      const lines: string[] = [
        "━━━ DUO ORIENTATION ━━━",
        `Phase: ${session.phase}`,
        `Project: ${session.projectRoot}`,
        `Progress: ${done}/${tasks.length} tasks done`,
        `Board approved: ${state.isTaskBoardApproved() ? "✅" : "❌"}`,
      ];

      // Design
      if (design) {
        lines.push("", "📝 DESIGN:", `  Task: ${design.taskDescription}`);
        const preview = design.agreedDesign.slice(0, 400);
        lines.push(`  Approach: ${preview}${design.agreedDesign.length > 400 ? "..." : ""}`);
        if (design.decisions.length > 0) {
          lines.push(`  Decisions:`);
          for (const d of design.decisions) lines.push(`    - ${d}`);
        }
      } else {
        lines.push("", "📝 DESIGN: not saved yet");
      }

      // Task board
      if (tasks.length > 0) {
        lines.push("", state.formatTaskBoard());
      } else {
        lines.push("", "📋 TASKS: none yet");
      }

      // In-progress / pending detail
      if (inProgress.length > 0) {
        lines.push("", "🔵 IN PROGRESS:");
        for (const t of inProgress) {
          lines.push(`  [${t.id}] ${t.description} → ${t.assignee}`);
        }
      }

      // Sub-agents
      const subagents = state.getSubagents();
      if (subagents.length > 0) {
        lines.push("", "🤖 SUB-AGENTS:");
        for (const s of subagents) {
          lines.push(`  [${s.taskId}] status=${s.status} spawned=${s.spawnedAt}`);
        }
      }

      // Latest checkpoint
      try {
        const { readLatestCheckpoint } = await import("../memory/checkpoint.js");
        const checkpoint = await readLatestCheckpoint(state.getStateDir());
        if (checkpoint) {
          lines.push("", `🔖 LAST CHECKPOINT: ${checkpoint.timestamp}`);
          if (checkpoint.context) lines.push(`   Context: ${checkpoint.context}`);
        }
      } catch {
        // Non-critical
      }

      // Required next step
      const phaseNextSteps: Record<string, string> = {
        design: "REQUIRED NEXT: Continue design discussion, then call duo_design_save.",
        planning: "REQUIRED NEXT: Call duo_task_add_bulk with task breakdown, present board to human, then duo_approve_task_board.",
        executing: "REQUIRED NEXT: (1) Check pending sub-agent results via duo_subagent_read_result. (2) Stay available for human. (3) Continue work from where you left off.",
        reviewing: "REQUIRED NEXT: Continue cross-review. Call duo_review_start / duo_review_submit for each pending task.",
        integrating: "REQUIRED NEXT: Run tests, fix failures, commit, then duo_codebase_update + duo_session_end.",
        idle: "No active session work. Use duo_session_start to begin.",
      };
      const nextStep = phaseNextSteps[session.phase] ?? "Proceed with current phase work.";
      lines.push("", `⏭️  ${nextStep}`);

      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
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
