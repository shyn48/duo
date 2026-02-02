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

1. Initialize task state: run `scripts/task-board.sh init` in the project directory
2. Add all tasks: `scripts/task-board.sh add <id> <assignee> "<description>"`
3. Spawn subagent(s) for AI-assigned tasks via `sessions_spawn`. See [references/orchestration.md](references/orchestration.md) for:
   - Sub-agent task prompt template
   - How to review and integrate sub-agent results
   - Context management to avoid overflow
   - Main thread stays free for human interaction
4. Tell the human to start their tasks in their IDE
5. As sub-agents complete, review their code incrementally (don't wait for all to finish)
6. Respond to human signals:
   - **"done with task N"** → update board, read their changes, move to review
   - **"stuck on task N"** → help with escalating approach:
     1. Ask what specifically they're stuck on
     2. Give a conceptual hint (not code)
     3. Show pseudocode or a pattern reference
     4. Only if explicitly asked: provide implementation
     5. Ask if they want to keep the task or hand it off
   - **"swap task N to me/you"** → reassign: `scripts/task-board.sh assign <id> <assignee>`
   - **"status"** → run `scripts/task-board.sh show`
7. When subagent completes, review its output, then notify:
   "🤖 Task N done — I've reviewed the code. Ready for your review when you are."
8. When all AI tasks are done, integrate results into unified "AI code" before presenting to human

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
4. Final commit with descriptive message crediting the collaborative work

## State Management

Task state in `.duo/tasks.json`. Managed via `scripts/task-board.sh`:
- `init` — create .duo directory and empty board
- `add <id> <assignee> <description>` — add task (assignee: human|ai)
- `update <id> <status>` — set status (todo|in_progress|review|done)
- `assign <id> <assignee>` — reassign task
- `show` — display current board
- `clear` — remove .duo directory

## Anti-Patterns (avoid these)

- ❌ Rubber-stamping human's design without challenge
- ❌ Assigning human only easy/trivial tasks
- ❌ Jumping to code when human says "stuck" (hints first!)
- ❌ Rushing the human or showing impatience
- ❌ Letting human skip reviewing AI code ("looks fine" is not a review)
- ❌ Over-engineering the plan for small tasks
