---
project: Duo Atlas
product_line: Duo
status: discovery-and-product-definition
version: v0.1
owner: Shayan
first_user: solo developers using coding agents in local repositories
source_inspiration: https://github.com/unclebob/uml-viewer
source_revision: 70fffa0cf6c91c0afa3da1f6f63f912b53dfeb59
---

# Duo Atlas — Product Requirements Document v0.1

> **Working thesis:** when agents write most of the code, developers need a way to author, inspect and steer the system at the architecture-and-evidence level rather than pretending line-by-line authorship is still the centre of software development.

## 1. Product decision

Duo Atlas is the visual successor to Duo: a local-first engineering workbench for solo developers using Claude, Codex or similar coding agents in a local repository.

Duo's original promise was sustainable AI coding by keeping the human involved through pair/delegate/review modes and understanding checkpoints. Duo Atlas evolves the human checkpoint upward:

- from understanding lines of code;
- to understanding the system change;
- to owning architecture, constraints, evidence and approval.

Duo remains the workflow lineage and may continue to provide CLI/session primitives. Atlas is the visual surface where agent work becomes inspectable and steerable.

This is a discovery PRD, not an implementation commitment for every feature below. The first implementation gate is a small dogfood slice against a real repository and one agent adapter.

## 2. Problem

Agentic development has made code production cheaper while making review and ownership more expensive. A developer can receive a large, apparently coherent change without having a fast answer to:

- What did the agent actually change?
- Which parts of the system are now affected?
- Did it cross a boundary or introduce architectural drift?
- Which evidence supports the agent's completion claim?
- What should I inspect first?
- How do I correct the direction without manually rewriting the whole task?

Chat transcripts and raw diffs are necessary but insufficient. A diff is file-centric; the developer needs a system-centric view that connects changed code to dependencies, tests, contracts, agent actions and explicit architecture constraints.

## 3. Product promise

**Duo Atlas turns an agent turn into a navigable, evidence-backed change map.**

A developer should be able to move from agent completion to a confident review decision without reconstructing the entire task from chat history and scattered terminal output.

Atlas must make the following distinction visible:

- **Observed:** facts extracted from the repository, diff, tools and tests.
- **Inferred:** semantic judgments, risk scores or likely intent.
- **Proposed:** a future architecture or change plan that is not yet in code.
- **Decided:** the human's approval, revision request or rejection.

## 4. Target user and first workflow

### Primary user

A solo developer who delegates implementation to a coding agent but remains responsible for the quality and direction of the repository.

The user may work from an IDE, terminal or agent-specific UI. Atlas is not initially a team control plane, a general observability SaaS or a replacement for the coding agent.

### First workflow

> "I asked an agent to add a capability. Show me what changed, what it touches, whether it crossed a boundary, and what evidence I should trust before I approve it."

The initial dogfood repositories should include one TypeScript project and one Go project, so the graph model is not accidentally designed around a single language.

## 5. Product principles

1. **The repository is the source of truth.** The graph is generated from observed source and tool output; it is not hand-drawn architecture theatre.
2. **Change before inventory.** The default view is the current agent turn and its impact, not an unreadable map of the entire repository.
3. **Reality and proposals stay separate.** A proposed boundary must never look like an implemented one.
4. **Evidence beats prose.** Every meaningful warning should link to changed files, edges, tests, commands or constraints.
5. **Human control is explicit.** The agent may suggest and revise; approval, rejection and constraint changes belong to the developer.
6. **Semantic AI is bounded.** Jev supplies typed judgments and uncertainty. Deterministic code owns state transitions, thresholds and side effects.
7. **Local-first by default.** Source, diffs and agent traces remain local unless the user explicitly enables a remote integration.
8. **Progressive disclosure.** Start at system shape, then open a component, file, diff, symbol or evidence record.

## 6. Core experience

### 6.1 Agent turn capture

Atlas records a normalized turn envelope from an agent adapter:

- task/request text;
- agent identity and model metadata when available;
- start/end times;
- plan or reasoning summary when the adapter exposes one;
- files read, created, modified or deleted;
- commands/tools invoked and their outcomes;
- patches or commits produced;
- tests, typechecks, builds and lint commands;
- final agent status and completion claim.

The raw transcript may be retained locally, but the main UI should use a structured event timeline rather than forcing the developer to reread a transcript.

### 6.2 Change map

The default review surface shows:

- changed modules/symbols highlighted;
- incoming and outgoing dependencies;
- newly added, removed or redirected edges;
- affected public interfaces and routes where detectable;
- test coverage/evidence attached to changed areas;
- boundary crossings and architecture constraints;
- a compact risk and review-priority summary.

The graph must support semantic zoom and virtualization. Large repositories should not become a wall of lines.

### 6.3 Evidence drawer

Selecting a graph node, edge or warning opens an evidence drawer containing:

- source location and symbol identity;
- relevant diff hunks;
- direct dependents and dependencies;
- commands and test results that touch the area;
- agent actions that caused or affected it;
- linked constraints or prior decisions;
- freshness and confidence indicators.

The user can jump from the drawer to source or diff without losing the system context.

### 6.4 Architecture constraints

The user can define lightweight, repository-local constraints such as:

- `domain` must not import `adapters`;
- payment code requires an explicit test result before approval;
- this directory is read-only for the current task;
- public API changes require contract tests;
- do not introduce a new persistence dependency in this module.

Constraints are versioned text plus machine-readable scope where possible. Deterministic checks enforce exact rules; Jev may classify ambiguous cases for review but must not silently enforce a subjective rule.

### 6.5 Proposal mode

A proposal is a clearly marked hypothetical change to structure or responsibility. It may contain:

- intended components or boundaries;
- nodes to move, add or split;
- expected dependency changes;
- constraints and non-goals;
- acceptance checks;
- estimated blast radius;
- an instruction for the coding agent.

The proposal view must show how it differs from the real repository and must never write code without an explicit human action.

### 6.6 Human actions

The primary actions are:

- **Approve:** accept the agent turn or proposal as reviewed.
- **Request revision:** send a bounded correction with selected graph context and constraints.
- **Reject:** reject the turn and record a reason.
- **Open source/diff:** inspect the evidence directly.
- **Create proposal:** explore a future architecture without changing the repository.
- **Re-run evidence:** repeat selected checks, never hide the original result.

Actions must be recorded with actor, timestamp, target and reason.

## 7. Jev judgment layer

Jev is a programmable judgment layer, not the architect, code generator or source of truth.

### Candidate judgments

- **Change-risk score:** rate a change from routine to high risk using deterministic state such as fan-out, boundary crossings, public API impact, test evidence and historical signals.
- **Review priority:** rank changed nodes or edges so the developer sees the most consequential areas first.
- **Dependency intent:** classify an edge as runtime dependency, test-only dependency, adapter integration, incidental dependency or suspicious edge.
- **Constraint fit:** judge whether a change appears consistent with a named architectural rule when deterministic matching is insufficient.
- **Completion evidence sufficiency:** assess whether the supplied evidence supports the agent's completion claim, with explicit missing-evidence outcomes.
- **Intent-to-context routing:** map the developer's request to candidate repository nodes, constraints and prior decisions.
- **Proposal plausibility:** compare a proposed grouping or responsibility split against the observed code and stated goals.
- **Escalation:** route high-impact or uncertain cases to human review or a slower reasoning agent.

### Responsibility boundary

Deterministic code owns:

- parsing and symbol identity;
- graph construction and dependency traversal;
- diff and event ordering;
- test/build/lint result ingestion;
- exact constraint checks;
- confidence thresholds and policy;
- persistence and side effects.

Jev owns narrow semantic judgments over that state and returns typed answers, probabilities and confidence. A general coding agent owns plan generation, code changes and revisions, but it acts only through visible, recorded workflow steps.

### MVP Jev slice

Start with two judgments:

1. review-priority ranking over changed nodes;
2. change-risk Score with a low-confidence escalation path.

Do not start by asking Jev to generate architecture diagrams or free-form review explanations.

### Primary product wedge: review prioritization

The first compelling Jev workflow is answering:

> **Which small number of files, symbols or edges should this human review first, and why?**

Given the structured state of an agent turn, Jev ranks changed review targets using signals such as diff size, dependency fan-out, boundary crossings, public-contract impact, test evidence, ownership and historical failure patterns. Each ranked item must retain the deterministic signals that were supplied to the judgment, the resulting probability/confidence, and links to the underlying evidence.

The ranking is a review aid, not an approval decision. Low-confidence or high-impact results are surfaced for human review rather than hidden behind a single score.

## 8. Functional requirements

### P0 — MVP

- **Repository ingestion:** index a local repository and produce stable symbol/module identities.
- **Language support:** TypeScript and Go adapters, with a language-neutral graph contract.
- **Dependency graph:** show observed project and external dependencies with source locations.
- **Agent adapter:** ingest one real coding-agent workflow through a replaceable adapter API.
- **Turn timeline:** display task, files, tools, checks, patch and status in chronological order.
- **Change map:** highlight changed nodes and compute direct impact.
- **Evidence drawer:** connect graph items to source, diff and verification output.
- **Constraints:** define and display repository-local architecture rules.
- **Review actions:** approve, request revision and reject with durable local records.
- **Proposal mode:** create a hypothetical architecture/change view without mutating source.
- **Jev judgments:** show review priority, risk, confidence and escalation state.
- **Local persistence:** reopen a repository and retain prior turns, decisions and proposals.

### P1 — After MVP validation

- Claude Code and Codex adapters if not both present in the first adapter.
- IDE links and command palette actions.
- Test-to-symbol coverage and failure history.
- Commit/PR review handoff.
- Saved architecture decisions and constraint templates.
- Incremental indexing and large-repository graph virtualization.
- Human labels for Jev evaluation and calibration.
- Shared review sessions for small teams.

### Explicit non-goals for v0.1

- Replacing the coding agent.
- Autonomous refactoring or autonomous approval.
- A complete UML notation editor.
- Supporting every programming language.
- A hosted multi-tenant observability platform.
- Rebuilding LangSmith or OpenTelemetry end to end.
- Treating Jev's confidence as proof of correctness.
- Making mutation testing a required runtime dependency.

## 9. Conceptual data model

- **Repository:** local root, detected languages, indexing revision and configuration.
- **Node:** stable module/symbol identity, source locations and observed metadata.
- **Edge:** typed dependency with source evidence and freshness.
- **AgentTurn:** request, adapter, events, patch/commit and outcome.
- **Artifact:** diff, transcript, command output, test report or generated plan.
- **Evidence:** link between a graph item/claim and an artifact or deterministic result.
- **Constraint:** versioned rule, scope, status and enforcement mode.
- **Proposal:** hypothetical structure, expected edges, acceptance checks and status.
- **Judgment:** Jev primitive, input snapshot hash, typed answer, probabilities, confidence and policy outcome.
- **ReviewDecision:** approve/revise/reject, actor, reason, target and timestamp.

Every derived view should carry a source revision or snapshot identifier so stale judgments cannot silently apply to newer code.

## 10. Technical direction

- **Core logic:** Go for repository analysis, graph construction, agent-event ingestion, evidence computation, policy evaluation and the local service boundary. Keep the core lightweight and fast.
- **Frontend:** React with Vite for the web application; the first UI is a real browser surface, not a desktop-shell commitment.
- **Runtime:** local-first Go service launched from a repository and consumed by the React/Vite frontend; source and traces remain local unless the user enables a remote integration.
- **Analysis:** language adapters using Tree-sitter plus compiler/LSP information where available; avoid making one parser's namespace model the universal architecture model.
- **Graph contract:** explicit nodes, edges, source spans, evidence links and snapshot IDs.
- **Agent integration:** adapter boundary for CLI agents and future IDE integrations; do not couple the product to tmux or one vendor's transcript format.
- **Jev integration:** server-side or local backend call so API credentials never live in the browser; cache judgments by state/question/model snapshot where safe.
- **Privacy:** source and traces stay local by default; remote model calls must be visible and configurable.

## 11. Success hypotheses

These are validation targets, not established facts:

- A solo developer can identify the highest-impact changed area within 60 seconds of opening a completed agent turn.
- A developer can answer “what changed and why should I trust it?” without rereading the full transcript.
- At least 80% of changed nodes in a dogfood task have directly linked source, diff or verification evidence.
- Developers choose request-revision actions from graph context often enough that the map is more useful than a raw chat-only loop.
- Jev's ranking reduces the number of changed files a developer needs to inspect first without increasing missed high-impact changes.

Measure review time, inspected nodes, revision loops, false escalations, missed issues and user-reported cognitive load. Compare against the same tasks using the agent's native UI and raw git diff.

## 12. Dogfood plan

1. Build a repository snapshot and changed-node graph for one real Duo-adjacent project.
2. Capture one complete agent turn, including commands and verification output.
3. Render the change map and evidence drawer without Jev.
4. Add deterministic architecture constraints and proposal mode.
5. Add Jev review priority and risk judgments behind visible confidence gates.
6. Run the same seeded tasks with and without Atlas and record review outcomes.

The first gate is not visual polish. It is proving that a developer can make a faster, better-grounded review decision from the change map.

## 13. Open decisions

- Whether Atlas lives in the existing Duo repository initially or starts as a new repository with a Duo integration.
- Which agent adapter is first: Claude Code, Codex, or a generic command/event adapter.
- Whether a desktop shell is useful later, after the browser workflow is validated.
- Exact graph identity strategy across TypeScript and Go.
- Which architecture constraints are deterministic in v0.1 and which are Jev-assisted.
- Jev threshold and evaluation set for risk/priority judgments.
- Whether shared/team features belong in Atlas or remain a later control-plane product.

## 14. Research basis

- [Uncle Bob's UML viewer](https://github.com/unclebob/uml-viewer), inspected at commit `70fffa0cf6c91c0afa3da1f6f63f912b53dfeb59`.
  - `README.md`: dynamic drill-down, proposals, metrics, source extractors and companion-agent loop.
  - `src/uml_viewer/domain/policy.clj`: language-neutral policy and deterministic dependency-rule marking.
  - `src/uml_viewer/domain/hierarchy.clj`: real namespace views versus hypothetical proposals.
  - `src/uml_viewer/domain/mailbox.clj`: durable EDN command queues between viewer and agent.
  - `src/uml_viewer/application/overlay.clj`: deterministic CRAP/mutation evidence overlay.
  - `src/uml_viewer/adapters/sketch.clj`: project-specific companion session and interaction loop.
- [TypeSafe System One](https://docs.typesafe.ai/concepts/system-one.md)
- [How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)
- [TypeSafe confidence](https://docs.typesafe.ai/confidence.md)
- [TypeSafe citation checks](https://docs.typesafe.ai/cookbooks/citation_check.md)
- [[Product Notes]]
- [[Duo]]

## Next implementation gate

Build a throwaway vertical slice that can ingest one agent turn, render changed nodes and evidence, and record a human review decision. Do not begin with a full architecture graph or SaaS backend.
