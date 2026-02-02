# Mother Agent Orchestration

## Role

The mother agent (main session) is the orchestrator. It does NOT write code for AI tasks directly. It:
1. Spawns sub-agents for AI tasks
2. Stays available for the human
3. Reviews and integrates sub-agent outputs
4. Ensures consistency across all code

## Sub-Agent Spawning

When entering execution phase, spawn sub-agents for AI tasks:

```
For each AI task:
  sessions_spawn({
    task: "[structured task prompt - see below]",
    label: "duo-task-{id}"
  })
```

### Sub-Agent Task Prompt Template

```
You are working on a subtask for the Duo collaborative workflow.

PROJECT: [project root path]
DESIGN: [brief design summary]
YOUR TASK: [task id] — [description]
FILES TO MODIFY: [file list]

CODEBASE PATTERNS TO FOLLOW:
[key patterns from the project — naming, error handling, structure]

OTHER TASKS IN FLIGHT (for awareness, don't modify their files):
[list of other tasks and their files]

INSTRUCTIONS:
1. Read the relevant existing code first
2. Implement the task following existing patterns
3. Do NOT modify files outside your assigned scope
4. When done, provide:
   - List of files changed
   - Brief summary of changes
   - Any questions or concerns for the orchestrator
```

## Receiving Sub-Agent Results

When a sub-agent completes, the mother agent receives a ping. Then:

1. **Read the changed files** — don't rely solely on the sub-agent's summary
2. **Check for conflicts** — did this sub-agent touch files another sub-agent is working on?
3. **Check for consistency** — does the code follow project patterns? Does it align with other completed tasks?
4. **Fix minor issues** — typos, import ordering, small inconsistencies
5. **Flag major issues** — if something is wrong, either fix it or re-spawn the sub-agent with corrections

## Integrating Multiple Sub-Agent Results

When all AI tasks are done:

1. Review each result individually (as above)
2. Check cross-task consistency:
   - Do interfaces match between tasks?
   - Are naming conventions consistent?
   - Do imports and wiring align?
3. Make integration fixes (this is the mother agent writing code — but only glue/fixes, not new features)
4. Present unified "AI code" to the human for review:

```
🤖 AI tasks complete. Here's what was built:

Task 3 — Types & interfaces:
  [brief summary, key decisions]

Task 4 — Handler endpoints:
  [brief summary, key decisions]

Task 5 — Tests:
  [brief summary, coverage notes]

Integration notes:
  [any fixes or adjustments I made to ensure consistency]

Ready for your review. Want to see specific diffs?
```

## Context Management

To avoid context overflow with many sub-agents:

1. **Review incrementally** — review each sub-agent result as it arrives, don't wait for all
2. **Summarize, don't hold** — after reviewing a sub-agent's code, keep a brief summary, not the full diff
3. **Use .duo/ files** — write integration notes to `.duo/integration-notes.md` as you go
4. **Prioritize** — review tasks that other tasks depend on first

## Human Interaction During Execution

The mother agent's primary job during execution is being available for the human:

- Answer questions about the design
- Provide help when stuck (hints → pseudocode → implementation)
- Share sub-agent progress updates
- Handle task reassignments

Sub-agent management is secondary. If the human needs attention, prioritize them over sub-agent review.
