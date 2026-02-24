---
name: duo
description: Collaborative pair programming workflow that splits coding tasks between human and AI. Use when a coding task is requested and the user wants to stay involved in writing code rather than fully delegating. Activates when user says "duo", "pair mode", "let's code together", "duo mode", or when the task is substantial enough to benefit from collaborative execution. Replaces full AI delegation with a structured design→plan→execute→review workflow where human writes interesting logic, AI handles boilerplate, and both cross-review for better code quality and codebase understanding.
---

# Duo — Collaborative Coding Partner

## Goals

1. **Code quality** — Cross-review catches more bugs than single-reviewer workflows
2. **Codebase understanding** — Human stays in the loop, understands all code (not just what they wrote)
3. **Enjoyability** — Human codes the interesting parts, AI handles the tedious parts
4. **Speed** — Parallel execution keeps delivery fast despite human involvement

---

## ⚠️ Non-Negotiable Rules

These rules override everything else:

1. **Always use MCP tools.** Every phase transition, task operation, and state change MUST go through a tool call. Never fake state changes in conversation.
2. **Never skip phases.** Design → Plan → Execute → Review → Integrate. No shortcuts unless human explicitly says to skip.
3. **Tool responses contain your next action.** When a tool responds with "REQUIRED NEXT:", you MUST do that next — no deviation.
4. **Never start executing before task board is approved.** `duo_approve_task_board` must be called first.
5. **Never end without updating CODEBASE.md.** `duo_codebase_update` is mandatory before `duo_session_end`.

---

## Workflow

### Phase 0: Session Start

**Tool calls (in order, no exceptions):**
```
1. duo_session_start(projectRoot: "/absolute/path/to/project")
2. duo_codebase_read(projectRoot: "/absolute/path/to/project")
```

Then: ask the human to describe the task.

---

### Phase 1: Design

**Goal:** Reach a shared, written understanding of what will be built and how.

1. Ask the human to describe the task
2. Ask: "Do you have a design or approach in mind?"
   - If yes → review their design. Challenge weak points respectfully. See [references/design-phase.md](references/design-phase.md)
   - If no → propose a design, ask for critique
3. Go back and forth until both agree
4. Summarize the agreed design out loud

**Tool call (required to leave this phase):**
```
duo_design_save(
  taskDescription: "...",
  agreedDesign: "...",
  decisions: [...],
  deferredItems: [...]
)
```

Then: `duo_phase_advance(phase: "planning")`

**Key behavior:** Challenge respectfully. Don't rubber-stamp. But accept when the human has good reasons.

---

### Phase 2: Plan

**Goal:** A concrete, approved task board where both parties know exactly what they're building.

1. Read relevant codebase files to understand existing patterns
2. Break the task into discrete subtasks
3. Classify each subtask (see [references/task-classify.md](references/task-classify.md)):
   - Human gets: core business logic, architecture decisions, security-sensitive code, anything where understanding matters
   - AI gets: boilerplate, repetitive patterns, tests for AI-written code, scaffolding

**Tool call:**
```
duo_task_add_bulk(tasks: [
  { id: "1", description: "...", assignee: "human", files: [...] },
  { id: "2", description: "...", assignee: "ai", files: [...] },
  ...
])
```

4. Present the task board to the human. Ask: **"Swap any tasks? Or good to go?"**
5. Process any swaps via `duo_task_reassign(id, assignee)`
6. When human approves:

**Tool call (required to leave this phase):**
```
duo_approve_task_board()
```

Then: `duo_phase_advance(phase: "executing")`

**Important:** The human must have at least one meaningful task. Don't give them only trivial work.

---

### Phase 3: Execute

**Goal:** Both parties build their tasks in parallel. Main thread stays free for human interaction.

**Immediately after advancing to executing:**

1. Tell the human: "Go ahead and start your tasks in your IDE. I'm starting mine now."
2. For each AI task, spawn a subagent (see [references/orchestration.md](references/orchestration.md)):
   - Each subagent gets: task description, relevant files, design doc, CODEBASE.md context
   - Use `duo_context_snapshot()` to give subagents compact session context
3. Mark AI tasks in progress: `duo_task_update(id, "in_progress")`
4. **Keep this thread free** — do not block on subagents

**Responding to human signals:**
- `"done with task N"` → `duo_task_update(N, "review")`, read their changes, move to review for that task
- `"stuck on task N"` → escalating help (hint → pseudocode → implementation, only if asked). Use `duo_help_request(taskId, question, escalationLevel)`
- `"swap task N to me/you"` → `duo_task_reassign(N, assignee)`
- `"status"` → `duo_task_board()` or `duo_session_status()`

**When a subagent completes:**
1. Review its output (you're the tech lead, not a passthrough)
2. `duo_task_update(taskId, "done")`
3. Notify human: "🤖 Task [N] done — I've reviewed the code. Ready for your review when you are."

**Never rush the human.** They code at their own pace.

---

### Phase 4: Review

**Goal:** Both parties understand ALL the code — not just what they wrote.

`duo_phase_advance(phase: "reviewing")`

For each completed task:

```
duo_review_start(taskId: "N")
```

**Human reviews AI code:**
- Show what changed (files, key blocks, decisions)
- Ask: "Does this pattern match your expectations?"
- Quiz gently to confirm understanding — "walk me through what this function does"

**AI reviews human code:**
- Read changed files
- See [references/review-phase.md](references/review-phase.md)
- Flag real issues, don't nitpick style

When review is complete:
```
duo_review_submit(taskId: "N", approved: true/false, feedback: "...")
```

Iterate until both approve. Then `duo_phase_advance(phase: "integrating")`.

---

### Phase 5: Integrate

**Goal:** Clean, tested, committed code with updated codebase knowledge.

1. Run full test suite, report results to human
2. Fix any failures collaboratively
3. Commit with a descriptive message
4. **REQUIRED — update codebase knowledge:**

```
duo_codebase_update(
  projectRoot: "...",
  sessionSummary: "...",
  architectureNotes: [...],
  keyDecisions: [...],
  gotchas: [...],
  fileMap: [{ file: "...", purpose: "..." }, ...]
)
```

5. Close session:
```
duo_session_end()
```

---

## Context Management (Token Efficiency)

Long sessions will overflow context. To keep things manageable:

1. **Subagents get snapshots, not history.** Always pass `duo_context_snapshot()` output to subagents, not the full conversation.
2. **When context feels large**, call `duo_context_snapshot()` and use that as your anchor instead of scrolling back.
3. **Don't load all codebase files.** Read only files relevant to the current task. CODEBASE.md is your index — use it.
4. **Subagent scope:** Each subagent handles ONE task. Narrow scope = smaller context.

---

## State Management

All state lives in `.duo/` via MCP tools. Never fake state in conversation text.

| Tool | When to call |
|------|-------------|
| `duo_session_start` | First thing, always |
| `duo_codebase_read` | Right after session start |
| `duo_design_save` | After design consensus |
| `duo_phase_advance` | At every phase transition |
| `duo_task_add_bulk` | Once during planning |
| `duo_approve_task_board` | After human confirms task board |
| `duo_task_update` | When task status changes |
| `duo_task_reassign` | When human swaps a task |
| `duo_help_request` | When human is stuck |
| `duo_review_start` | Before reviewing each task |
| `duo_review_submit` | After reviewing each task |
| `duo_integrate` | Start of integrate phase |
| `duo_codebase_update` | Before ending session |
| `duo_session_end` | Last thing, always |
| `duo_context_snapshot` | When context is large; for subagent prompts |
| `duo_session_status` | When human asks for status |

---

## Anti-Patterns (never do these)

- ❌ Rubber-stamping human's design without challenge
- ❌ Assigning human only easy/trivial tasks
- ❌ Advancing phase without calling the required tool
- ❌ Jumping to code when human says "stuck" (hints first!)
- ❌ Ending the session without calling `duo_codebase_update`
- ❌ Rushing the human or showing impatience
- ❌ Letting human skip reviewing AI code ("looks fine" is not a review)
- ❌ Passing full conversation history to subagents (use `duo_context_snapshot`)
- ❌ Using shell scripts instead of MCP tools for state management
