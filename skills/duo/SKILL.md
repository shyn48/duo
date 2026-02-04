---
name: duo
description: Collaborative pair programming workflow that splits coding tasks between human and AI. Use when a coding task is requested and the user wants to stay involved in writing code rather than fully delegating. Activates when user says "duo", "pair mode", "let's code together", "duo mode", or when the task is substantial enough to benefit from collaborative execution. Replaces full AI delegation with a structured design→plan→execute→review workflow where human writes interesting logic, AI handles boilerplate, and both cross-review for better code quality and codebase understanding.
---

# Duo — Collaborative Coding Partner

## ⚠️ CRITICAL: Context Loss Recovery (MANDATORY)

**Before doing ANYTHING else after detecting context loss, you MUST:**

1. **Detect context loss** — Signs include:
   - Summary at the top of your context (compaction happened)
   - Missing conversation history
   - Uncertain about current task/phase
   - Human says "recover", "context lost", or "compacted"

2. **Immediately call `duo_recover_session`** — Do NOT continue working, do NOT guess, do NOT ask the human what you were doing. Just call the tool.

3. **Review the restored state** — The tool returns phase, tasks, design, and subagent state. Summarize what you recovered.

4. **Only then continue** — Resume from where you left off.

**This is not optional.** Context recovery is the first action after any context loss event.

---

## Goals

1. **Code quality** — Cross-review catches more bugs than single-reviewer workflows
2. **Codebase understanding** — Human stays in the loop, understands all code (not just what they wrote)
3. **Enjoyability** — Human codes the interesting parts, AI handles the tedious parts
4. **Speed** — Parallel execution keeps delivery fast despite human involvement


## Large Codebase Context Management

Duo **automatically enforces context persistence** across sessions. You don't need to remember to do this — the tools do it for you.

### Automatic Context Loading (🔒 Enforced by Tools)

**On `duo_session_start`:**
- ✅ Automatically reads `.duo/CODEBASE.md` and includes it in the response
- ✅ Creates CODEBASE.md template if this is a new project
- ✅ You see codebase knowledge immediately — no extra tool calls needed

**On `duo_session_end`:**
- ✅ Auto-archives session to `.duo/sessions/` for future recall
- ✅ Accepts `codebaseUpdates` to append to CODEBASE.md

### At Session Start (What You Receive)

When you call `duo_session_start`, the response includes:
```
📚 **Codebase Knowledge** (from prior sessions):
# Codebase Knowledge
## Architecture
- Go backend with Echo framework...
## Gotchas & Warnings  
- ⚠️ go-redis must be v9.7.0...
```

**Your job:** Read this context. Use it in design discussions. Don't re-learn things that are documented.

> **Note:** For querying past sessions beyond what's in CODEBASE.md, use your platform's memory system (e.g., claude-mem for Claude Code).


### During Session (🔒 Use duo_discovery!)

**When you discover something important, note it IMMEDIATELY:**

```typescript
// Discovered a gotcha? Note it now!
duo_discovery({
  action: "add",
  type: "gotcha",
  content: "go-redis v9.15.0 doesn't exist, must use v9.7.0"
})

// Found an important file? Note it!
duo_discovery({
  action: "add",
  type: "file",
  content: "OAuth service implementation",
  filePath: "core-api/internal/service/google.go"
})

// Noticed a pattern? Note it!
duo_discovery({
  action: "add",
  type: "pattern",
  content: "Token refresh uses sliding window pattern"
})

// List all discoveries so far
duo_discovery({ action: "list" })
```

**Discovery types:**
- `pattern` — Recurring code patterns
- `gotcha` — Warnings, pitfalls, things that tripped you up
- `architecture` — High-level design insights
- `file` — Important files (include filePath)
- `convention` — Coding conventions observed

**Why note immediately?**
- You might forget by session end
- Context compaction might lose the insight
- Discoveries are stored in `.duo/discoveries.json` (survives compaction)


### At Session End

Collected discoveries are **automatically presented** and can be included in CODEBASE.md:

```
👋 Duo session ended!

Tasks completed: 10/14

📝 Discoveries collected: 3
⚠️ [gotcha] go-redis v9.15.0 doesn't exist, must use v9.7.0
🔄 [pattern] Token refresh uses sliding window pattern
📄 [file] OAuth service implementation (core-api/internal/service/google.go)

📚 CODEBASE.md updated with discoveries + knowledge
```

**By default, discoveries are auto-included.** You can also pass explicit updates:

```typescript
duo_session_end({
  summary: "Implemented OAuth flow with PKCE",
  keyLearnings: [
    "Google OAuth requires state parameter validation"
  ],
  tags: ["auth", "oauth"],
  includeDiscoveries: true,  // default: auto-include collected discoveries
  codebaseUpdates: {         // additional explicit updates
    architecture: "OAuth uses PKCE flow for mobile clients"
  }
})
```

### The Knowledge Graph

```
.duo/
├── CODEBASE.md         # 🔒 Auto-loaded on session start
├── sessions/           # Archived sessions with learnings
├── docs/               # Persistent documentation
├── memory/             # Checkpoints for recovery
└── chat/               # Full conversation history
```

**CODEBASE.md is the key file.** It accumulates knowledge across all sessions. Read it at start, update it at end.


Follow these phases in order. Do not skip phases unless the human explicitly asks.

### Phase 1: Design

1. Ask the human to describe the task
2. Ask if they have a design or approach in mind
3. If yes → review their design. See [references/design-phase.md](references/design-phase.md) for challenge patterns
4. If no → propose a design, ask for critique
5. Go back and forth until consensus
6. Summarize the agreed design before moving on

**Key behavior:** Challenge respectfully. Don't rubber-stamp. But accept when the human has good reasons.

### Phase 2: Plan

1. Analyze the codebase (read relevant files, understand existing patterns)
2. Break the task into discrete subtasks
3. Classify each subtask. See [references/task-classify.md](references/task-classify.md) for heuristics
4. Present the task board:

```
📋 Task Board — [Task Name]

🧑 YOU:
  1. [description] — files: [list]
  2. [description] — files: [list]

🤖 ME:
  3. [description] — files: [list]
  4. [description] — files: [list]

Swap any tasks? Or good to go?
```

5. Human reviews and can swap assignments
6. Confirm before execution begins

**Important:** Assign the human tasks where understanding the code matters most. They should walk away knowing the critical parts of the codebase, not just the easy parts.

### Phase 3: Execute

1. Start session and add tasks using Duo MCP tools:
   - `duo_session_start` — initialize session and dashboard
   - `duo_task_add` — add tasks (single or bulk with `tasks` array)
2. For each AI-assigned task, use `duo_subagent_spawn` to spawn a sub-agent:
   - Provide the task ID, description, prompt, and relevant files
   - The tool builds a structured prompt with design context and project info
   - Use the returned `subagentPrompt` to spawn via your platform's native mechanism (OpenClaw `sessions_spawn`, Claude Code `Task`, etc.)
   - See [references/orchestration.md](references/orchestration.md) for orchestration patterns
3. Tell the human to start their tasks in their IDE
4. As sub-agents complete, review their code incrementally (don't wait for all to finish)
5. Respond to human signals:
   - **"done with task N"** → `duo_task_update` to update status, read their changes, move to review
   - **"stuck on task N"** → help with escalating approach:
     1. Ask what specifically they're stuck on
     2. Give a conceptual hint (not code)
     3. Show pseudocode or a pattern reference
     4. Only if explicitly asked: provide implementation
     5. Ask if they want to keep the task or hand it off
   - **"swap task N to me/you"** → `duo_task_update` with new `assignee`
   - **"status"** → `duo_task_board`
6. When subagent completes, review its output, then notify:
   "🤖 Task N done — I've reviewed the code. Ready for your review when you are."
7. When all AI tasks are done, integrate results into unified "AI code" before presenting to human

**Never rush the human.** They code at their pace. Never take over unless asked.
**Review sub-agent code before showing to human.** You're the tech lead, not a passthrough.

### Phase 4: Review

Cross-review is critical. This is where code quality and understanding happen.

1. **Human reviews AI code:**
   - Show what changed (files, key code blocks, decisions made)
   - Ask specific questions: "Does this pattern match your expectations?"
   - Human must understand the AI code — quiz gently if needed
   
2. **AI reviews human code:**
   - Read changed files
   - See [references/review-phase.md](references/review-phase.md) for review patterns
   - Flag real issues, praise good solutions
   - Don't nitpick style

3. Iterate until both approve

**Key principle:** After review, the human should understand 100% of the changes — theirs AND the AI's. This is the "codebase understanding" goal in action.

### Phase 5: Integrate

1. Ensure all code is committed
2. Run full test suite, report results
3. If tests fail → figure out whose code caused it, fix collaboratively
4. Run `duo_integrate` — this auto-saves the integration summary to `.duo/docs/`
5. The tool returns `nextAction: "prompt_for_end"` — **ask the human** if they want to end the session or continue working
6. If ending: call `duo_session_end`

## MCP Tools Reference (v0.5.0)

### Session Management
- `duo_session_start` — Start session, create `.duo/` and `.duo/docs/`, launch dashboard
- `duo_session_status` — Show current phase, task board, progress
- `duo_phase_advance` — Move to next phase (design → planning → executing → reviewing → integrating)
- `duo_design_save` — Save design doc (auto-stores to `.duo/docs/`)
- `duo_session_end` — End session, stop dashboard, archive to `.duo/sessions/`

### Task Management
- `duo_task_add` — Add task(s) to the board. Use `task` for single or `tasks` for bulk array.
- `duo_task_update` — Update task status and/or assignee. Accepts `status` and/or `assignee`.
- `duo_task_board` — Display current board
- `duo_help_request` — Log help request with escalation level (hint → pseudocode → implementation)

### Sub-Agent Orchestration
- `duo_subagent_spawn` — Spawn a sub-agent for an AI task. Returns a structured `subagentPrompt` that you pass to your platform's native spawning mechanism. Validates dependencies, tracks subagent state.

### Review & Integration
- `duo_review_start` — Begin code review for a task
- `duo_review_submit` — Submit review feedback (approve/request changes)
- `duo_integrate` — Run integration phase, auto-save summary to `.duo/docs/`

### Documentation & Discovery
- `duo_document_save` — Save a document to `.duo/docs/` with auto-generated filename
- `duo_discovery` — Note codebase discoveries (action: "add") or list them (action: "list")

### Session Recovery

**After Context Compaction (MANDATORY):**
1. **Detect it:** Summary at top of context, missing conversation history, uncertain about state
2. **Immediately call `duo_recover_session`** — do NOT guess, do NOT ask the human
3. Then summarize what you recovered and continue

**Tools:**
- `duo_recover_session` — **MANDATORY after context loss.** Restores phase, tasks, design from latest checkpoint.

**Automatic Features:**
- Checkpoints saved on task completion + phase transitions
- Chat history logged to `.duo/chat/session-{startedAt}.jsonl`
- Sessions auto-archived on `duo_session_end`

> **Memory/Search:** For searching past sessions and context beyond what Duo provides, use your platform's memory system (e.g., claude-mem plugin for Claude Code).

## Anti-Patterns (avoid these)

- ❌ **Continuing after context loss without calling `duo_recover_session`** — This is the #1 mistake
- ❌ Rubber-stamping human's design without challenge
- ❌ Assigning human only easy/trivial tasks
- ❌ Jumping to code when human says "stuck" (hints first!)
- ❌ Rushing the human or showing impatience
- ❌ Letting human skip reviewing AI code ("looks fine" is not a review)
- ❌ Over-engineering the plan for small tasks
