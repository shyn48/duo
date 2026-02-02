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

## Workflow

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
   - `duo_task_add_bulk` — add all planned tasks at once
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
   - **"swap task N to me/you"** → `duo_task_reassign`
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

## MCP Tools Reference

### Session Management
- `duo_session_start` — Start session, create `.duo/` and `.duo/docs/`, launch dashboard
- `duo_session_status` — Show current phase, task board, progress
- `duo_phase_advance` — Move to next phase (design → planning → executing → reviewing → integrating)
- `duo_design_save` — Save design doc (auto-stores to `.duo/docs/`)
- `duo_session_end` — End session, stop dashboard

### Task Management
- `duo_task_add` / `duo_task_add_bulk` — Add tasks to the board
- `duo_task_update` — Update task status (todo → in_progress → review → done)
- `duo_task_reassign` — Swap task between human/AI
- `duo_task_board` — Display current board
- `duo_help_request` — Log help request with escalation level

### Sub-Agent Orchestration
- `duo_subagent_spawn` — Spawn a sub-agent for an AI task. Returns a structured `subagentPrompt` that you pass to your platform's native spawning mechanism. Validates dependencies, tracks subagent state.

### Review & Integration
- `duo_review_start` — Begin code review for a task
- `duo_review_submit` — Submit review feedback (approve/request changes)
- `duo_integrate` — Run integration phase, auto-save summary to `.duo/docs/`

### Documentation
- `duo_document_save` — Save a document to `.duo/docs/` with auto-generated filename

## Message Threading

Tool responses include `_meta: { from, timestamp }` to identify message sources:
- `"ai"` — Main agent actions
- `"human"` — Human-initiated actions
- `"subagent"` — Sub-agent updates
- `"system"` — System events

## Anti-Patterns (avoid these)

- ❌ Rubber-stamping human's design without challenge
- ❌ Assigning human only easy/trivial tasks
- ❌ Jumping to code when human says "stuck" (hints first!)
- ❌ Rushing the human or showing impatience
- ❌ Letting human skip reviewing AI code ("looks fine" is not a review)
- ❌ Over-engineering the plan for small tasks
