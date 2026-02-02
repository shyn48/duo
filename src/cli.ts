#!/usr/bin/env node

/**
 * Duo CLI — Command-line interface for the Duo MCP server
 *
 * Usage:
 *   duo-mcp                    Start the MCP server (stdio transport)
 *   duo-mcp --help             Show help
 *   duo-mcp --version          Show version
 *   duo-mcp inspect            List available tools and resources
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
    );
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function showHelp(): void {
  console.log(`
duo-mcp v${getVersion()} — Collaborative Pair Programming MCP Server

USAGE:
  duo-mcp                Start the MCP server (stdio transport)
  duo-mcp inspect        List available tools and resources
  duo-mcp --help         Show this help message
  duo-mcp --version      Show version

MCP CONFIGURATION:

  Claude Code (~/.claude/claude_desktop_config.json):
    {
      "mcpServers": {
        "duo": {
          "command": "duo-mcp"
        }
      }
    }

  OpenClaw (openclaw.json):
    Add duo as an MCP server in your agent configuration.

  Cursor (.cursor/mcp.json):
    {
      "mcpServers": {
        "duo": {
          "command": "duo-mcp"
        }
      }
    }

TOOLS (14):
  Session:  duo_session_start, duo_session_status, duo_phase_advance,
            duo_design_save, duo_session_end
  Tasks:    duo_task_add, duo_task_add_bulk, duo_task_update,
            duo_task_reassign, duo_task_board, duo_help_request
  Review:   duo_review_start, duo_review_submit, duo_integrate

RESOURCES (3):
  duo://task-board    Current task board
  duo://design        Agreed design document
  duo://progress      Session progress summary

WORKFLOW:
  1. Design   — Collaborative design discussion
  2. Plan     — AI generates task breakdown, human approves
  3. Execute  — Parallel coding (human + AI sub-agents)
  4. Review   — Cross-review each other's code
  5. Integrate — Merge, test, commit

Learn more: https://github.com/shyn48/jarvis/tree/main/projects/duo
`);
}

function showInspect(): void {
  console.log(`
📋 Duo MCP Server — Available Tools & Resources

TOOLS:
─────
Session Management:
  duo_session_start    Start a new Duo collaborative coding session
  duo_session_status   Show current session status and task board
  duo_phase_advance    Move to next workflow phase
  duo_design_save      Save agreed design document
  duo_session_end      End session and show summary

Task Management:
  duo_task_add         Add a single task to the board
  duo_task_add_bulk    Add multiple tasks at once
  duo_task_update      Update task status (todo → in_progress → review → done)
  duo_task_reassign    Swap task between human and AI
  duo_task_board       Display current task board
  duo_help_request     Request help with escalation (hint → pseudocode → code)

Review & Integration:
  duo_review_start     Begin cross-review for a completed task
  duo_review_submit    Submit review feedback (approve or request changes)
  duo_integrate        Run integration checks and prepare for commit

RESOURCES:
──────────
  duo://task-board     Current task board state
  duo://design         Agreed design document
  duo://progress       Session progress summary (tasks, assignees, completion)
`);
}

// ── Main ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  showHelp();
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(getVersion());
  process.exit(0);
}

if (args.includes("inspect")) {
  showInspect();
  process.exit(0);
}

// Default: start MCP server
import("./index.js");
