/**
 * Snapshot and codebase update tools — context efficiency + session knowledge persistence
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStateInstanceAutoLoad } from "../resources.js";
import { appendCodebaseKnowledge } from "./codebase.js";

export function registerSnapshotTools(server: McpServer) {
  // ── Context snapshot ──
  server.tool(
    "duo_context_snapshot",
    "Get a compact snapshot of the current session state (~500 tokens). Use this when context is large, or to give subagents session context without passing full history.",
    {},
    async () => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [{ type: "text" as const, text: "No active Duo session. Use duo_session_start to begin." }],
        };
      }

      const session = state.getSession();
      const tasks = state.getTasks();
      const design = state.getDesign();
      const done = tasks.filter((t) => t.status === "done").length;
      const inProgress = tasks.filter((t) => t.status === "in_progress");
      const pending = tasks.filter((t) => t.status === "todo");

      const lines = [
        "━━━ DUO CONTEXT SNAPSHOT ━━━",
        `Phase: ${session.phase}`,
        `Project: ${session.projectRoot}`,
        `Progress: ${done}/${tasks.length} tasks done`,
        `Board approved: ${state.isTaskBoardApproved() ? "✅" : "❌"}`,
        "",
      ];

      if (design) {
        lines.push(`Design: ${design.taskDescription}`);
        const preview = design.agreedDesign.slice(0, 300);
        lines.push(`Approach: ${preview}${design.agreedDesign.length > 300 ? "..." : ""}`);
        if (design.decisions.length > 0) {
          lines.push(`Decisions: ${design.decisions.slice(0, 3).join(" | ")}`);
        }
        lines.push("");
      }

      if (inProgress.length > 0) {
        lines.push("In progress:");
        for (const t of inProgress) {
          lines.push(`  🔵 [${t.id}] ${t.description} → ${t.assignee}`);
        }
        lines.push("");
      }

      if (pending.length > 0) {
        lines.push("Pending:");
        for (const t of pending) {
          lines.push(`  ⬜ [${t.id}] ${t.description} → ${t.assignee}`);
        }
        lines.push("");
      }

      const doneTasks = tasks.filter((t) => t.status === "done");
      if (doneTasks.length > 0) {
        lines.push(`Done: ${doneTasks.map((t) => `[${t.id}]`).join(", ")}`);
      }

      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  // ── Codebase update ──
  server.tool(
    "duo_codebase_update",
    "Update CODEBASE.md with knowledge gained this session. REQUIRED at the end of every session before duo_session_end. Documents architecture, patterns, decisions, and gotchas for future sessions.",
    {
      sessionSummary: z.string().describe("What was built/changed this session (2-3 sentences)"),
      architectureNotes: z
        .array(z.string())
        .describe("Architecture facts — module responsibilities, key patterns, data flow")
        .default([]),
      keyDecisions: z
        .array(z.string())
        .describe("Decisions made and why — important for future context")
        .default([]),
      gotchas: z
        .array(z.string())
        .describe("Non-obvious things that will trip up future work — edge cases, footguns, constraints")
        .default([]),
      files: z
        .array(z.object({ path: z.string(), purpose: z.string() }))
        .describe("Key files changed and what they do")
        .default([]),
    },
    async ({ sessionSummary, architectureNotes, keyDecisions, gotchas, files }) => {
      const state = await getStateInstanceAutoLoad();
      if (!state) {
        return {
          content: [{ type: "text" as const, text: "No active Duo session." }],
        };
      }

      const stateDir = state.getStateDir();

      // Merge all gotchas (including key decisions as gotcha-style notes)
      const allGotchas = [...gotchas];
      if (keyDecisions.length > 0) {
        allGotchas.push(...keyDecisions.map((d) => `Decision: ${d}`));
      }

      const codebasePath = await appendCodebaseKnowledge(stateDir, {
        architecture: [sessionSummary, ...architectureNotes].join("\n"),
        files: files,
        gotchas: allGotchas,
      });

      return {
        content: [{
          type: "text" as const,
          text: [
            "📝 CODEBASE.md updated!",
            `File: ${codebasePath}`,
            "",
            `Architecture notes: ${architectureNotes.length}`,
            `Key decisions: ${keyDecisions.length}`,
            `Gotchas: ${gotchas.length}`,
            `Files documented: ${files.length}`,
            "",
            "CODEBASE.md will be loaded automatically in future Duo sessions.",
            "REQUIRED NEXT: Call duo_session_end to close the session.",
          ].join("\n"),
        }],
      };
    },
  );
}
