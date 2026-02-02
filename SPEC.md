# Duo — Collaborative Coding Partner

## Vision

A coding workflow that replaces full delegation to AI with genuine pair programming. The human stays involved in the interesting parts, AI handles the tedious parts, both review each other's work.

## Core Goals

1. **Code Quality** — Two reviewers catch more than one. Human spots business logic issues AI misses, AI spots patterns and edge cases human misses. The cross-review loop produces better code than either alone.
2. **Codebase Understanding** — Human stays in the loop. They write core logic, review all AI code, and make architecture decisions. No more "I don't know how my own codebase works."
3. **Enjoyability** — Engineers write the interesting parts (algorithms, design patterns, core logic) while AI handles boilerplate. Coding feels like craft again.
4. **Speed** — Parallel execution + AI handling repetitive work keeps delivery fast. Target: within 1.5x of full AI delegation, but with significantly better outcomes.

## Architecture

**Language:** TypeScript (aligns with MCP ecosystem, npm publishable)

### Layers

```
Layer 1: OpenClaw Skill (DONE - v0.1)
  └── Conversational workflow via SKILL.md + references + task-board script
  └── Validates the workflow feels right

Layer 2: MCP Server
  └── Formal tool definitions for any MCP-compatible agent
  └── File watcher for detecting human code changes
  └── Persistent task state management
  └── Git integration for progress tracking

Layer 3: Standalone CLI + Publishing
  └── CLI wrapper for non-MCP usage
  └── npm package
  └── ClawdHub skill publication
  └── Agent-agnostic (Claude Code, Codex, Cursor, OpenClaw)
```

## Workflow

### Phase 1: Design (Collaborative)
- Human describes the task
- AI asks if they have a design/approach in mind
- If yes → AI reviews, challenges weak points
- If no → AI proposes, human critiques
- Back and forth until consensus
- **Output:** Agreed design document

### Phase 2: Plan (AI-led, human-approved)
- AI analyzes codebase and design
- Generates task breakdown with suggested assignments
- Classification: interesting/creative → human, repetitive/mechanical → AI
- Human reviews, swaps assignments, confirms
- **Output:** Confirmed task board

### Phase 3: Execute (Parallel)
- AI spawns workers for its tasks
- Human codes in their IDE
- Main thread stays free for help requests
- Escalating help: hints → pseudocode → implementation (only if asked)
- **Output:** All tasks completed

### Phase 4: Review (Cross-review)
- Human reviews AI code (diffs + discussion)
- AI reviews human code (constructive feedback)
- Both iterate until approved
- **Key principle:** Human understands ALL code, not just what they wrote
- **Output:** Mutually approved code

### Phase 5: Integrate
- Merge, run tests, fix issues collaboratively
- Commit with descriptive message
- **Output:** Clean commit, passing tests

## Task Classification Heuristics

### 🧑 Human (interesting, creative, decision-heavy)
- Core business logic and algorithms
- Architecture and design pattern decisions
- Complex state management
- Security-sensitive code
- Performance-critical paths
- Data model and API contract design

### 🤖 AI (repetitive, mechanical, boilerplate)
- Type/struct/interface definitions
- Test scaffolding and standard cases
- Config, env vars, wiring
- Migrations, SQL boilerplate
- Route registration, handler glue
- Mock implementations
- Documentation updates
- Dependency management

### Configurable
- Human can override any assignment
- Per-project preferences remembered
- Some tasks are context-dependent (CSS, tests, queries)

## MCP Server Design (Layer 2)

### Tools

```typescript
// Phase 1
duo_design_start    // Begin design discussion for a task
duo_design_challenge // AI challenges human's design

// Phase 2
duo_plan_generate   // Generate task breakdown from design
duo_plan_confirm    // Human confirms/edits task assignments

// Phase 3
duo_execute_start   // Begin parallel execution
duo_task_status     // Show current task board
duo_task_update     // Update task status
duo_task_reassign   // Swap task assignment
duo_help_request    // Human asks for help on a task

// Phase 4
duo_review_start    // Begin cross-review phase
duo_review_submit   // Submit review feedback
duo_review_approve  // Approve reviewed code

// Phase 5
duo_integrate       // Merge, test, commit
```

### Resources

```typescript
duo://task-board     // Current task state
duo://design         // Agreed design document
duo://progress       // Overall progress summary
```

### State Management

```
.duo/
├── config.json      // Project-level preferences
├── tasks.json       // Current task board
├── design.md        // Agreed design for current task
└── history/         // Past sessions for learning preferences
```

### File Watcher
- Monitors working directory for file changes
- Maps changes to tasks (by file path)
- Auto-detects when human finishes a task
- Triggers review notification

### Git Integration
- Tracks commits per task
- Detects branch changes
- Generates collaborative commit messages
- Attributes work to human vs AI in commit metadata

## Known Limitations & Future Concerns

### Context Overflow Risk (IMPORTANT)
When the mother agent orchestrates multiple sub-agents, it accumulates:
- Design document
- Task board state
- Ongoing conversation with human
- Sub-agent results/diffs for review
- Merge/conflict resolution context

On large tasks (6+ sub-agents, big diffs), this could hit context limits and trigger compaction, losing important orchestration state.

**Mitigations to explore:**
- Sub-agent result summarization (tool that condenses diffs to key changes)
- Incremental review (review each sub-agent result as it arrives, don't hold all in memory)
- Context checkpointing (save orchestration state to .duo/ files, reload as needed)
- MCP tool for diff management (tool handles merge logic, returns only conflicts for mother to decide)

### Other Limitations (Skill-only orchestration)
- No real-time sub-agent progress (mother polls, no push notifications)
- No direct sub-agent-to-sub-agent communication (everything routes through mother)
- No automatic file conflict detection (mother does manual diff)
- No dependency enforcement (mother must manually sequence spawns)

## Success Metrics

- Human writes ≥30% of code (the interesting 30%)
- Human understands 100% of codebase changes (via review)
- Total delivery time ≤1.5x full AI delegation
- Fewer bugs caught in later stages (cross-review catches them early)
- Human reports higher satisfaction than full delegation

## Build Plan

| Batch | Scope | Status |
|-------|-------|--------|
| 1 | Update spec, refine Layer 1 skill | ✅ Done |
| 2 | Layer 2 MCP scaffolding + types + state + tools + resources | ✅ Done |
| 3 | Layer 2 orchestration + tests (24 state + 7 watcher + 11 git) | ✅ Done |
| 4 | Layer 2 file watcher + git integration | ✅ Done |
| 5 | Layer 3 CLI wrapper + README + packaging | ✅ Done |
