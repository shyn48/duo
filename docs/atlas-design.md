# Duo Atlas — Slice 1 Design

**Status:** Agreed for implementation
**Date:** 2026-09-21
**Product source:** `Duo Atlas — PRD v0.1`
**Replaces:** Duo MCP Server v0.6.0 at `f761603`

## Product slice

The first end-to-end slice answers one useful question:

> **Which changed parts of this agent turn should the developer review first, and why?**

The browser shows a ranked review queue beside a compact architecture change map. Selecting a target opens the evidence behind the ranking: changed files, graph impact, verification results, and the signals that were supplied to the judgment layer.

The first slice is deliberately useful without an external AI call. A deterministic baseline produces a stable ranking; the same interface accepts a Jev judgment provider later. This makes the product testable and keeps Jev from becoming an opaque dependency.

## Architecture

```text
local repository / fixture snapshot
          │
          ▼
      Go core
  snapshot + evidence + policy
          │ JSON HTTP API
          ▼
   React + Vite web UI
  change map + review queue
          │
          ▼
  human review decision
```

### Go core

Go is the only owner of repository state, graph state, evidence, ranking inputs, HTTP contracts, and review decisions.

Initial packages:

- `internal/model` — stable JSON/domain types;
- `internal/review` — deterministic review-priority baseline and provider seam;
- `internal/snapshot` — fixture loading in Slice 1, repository ingestion in Slice 2;
- `internal/httpapi` — health, snapshot, review queue, and decision endpoints;
- `cmd/atlas` — local server entrypoint.

The server must be runnable from a repository root and must not require a database for the first slice. A later durable store can be added after the event/snapshot model is proven.

### Web frontend

React + Vite owns presentation and interaction only. It receives a normalized snapshot and ranked targets from Go. It must not reconstruct risk or invent graph relationships in the browser.

Initial UI regions:

- repository and agent-turn header;
- review-priority queue with rank, target, reason and confidence;
- change map with changed/related nodes;
- evidence drawer for the selected target;
- verification summary;
- Approve and Request revision actions.

### HTTP contract

Slice 1 endpoints:

- `GET /api/health` → `{ "status": "ok", "version": "..." }`;
- `GET /api/snapshot` → `{ snapshot, reviewTargets }`;
- `POST /api/review-decisions` → records an explicit `approve`, `revise`, or `reject` decision in memory and returns it.

The contract is versioned in Go tests and consumed by the frontend through one typed client module.

## Domain model

A `Snapshot` contains:

- repository identity and source revision;
- one `AgentTurn` with task text, status, and changed file count;
- `Node`s representing modules/components;
- `Edge`s representing observed relationships;
- `Evidence` records for diffs, commands, tests and constraints;
- verification summary;
- explicit observed/inferred/proposed/decided labels where applicable.

A `ReviewTarget` contains:

- stable target ID and target kind;
- rank and score;
- human-readable reason;
- confidence and judgment source (`deterministic` or `jev`);
- signal values used to produce the ranking;
- evidence IDs and graph node IDs.

A review target is a recommendation, never permission to approve.

## Ranking seam

```go
type JudgmentProvider interface {
    RankReviewTargets(ctx context.Context, input ReviewState) ([]ReviewTarget, error)
}
```

The deterministic implementation is the Slice 1 default. It uses explicit, inspectable signals:

- changed files and diff size;
- dependency fan-out;
- boundary crossings;
- public-contract impact;
- verification status;
- ownership and historical failure signals when present.

The Jev implementation will call TypeSafe’s HTTP endpoint from Go:

- `POST https://api.typesafe.ai/v1/systemone`;
- model `jev-latest`;
- a `score` question for review priority, or `choice` questions for bounded categories;
- returned probabilities/confidence persisted with the target;
- deterministic policy decides when low confidence escalates.

No API key is sent to the browser. If Jev is unavailable, the deterministic result remains visible and is labeled as such.

## Snapshot strategy

Slice 1 uses a checked-in fixture so the full browser path can be tested without depending on a developer’s repository shape. The fixture is shaped exactly like a real snapshot and includes changed/related/unchanged nodes, evidence and a passing/failing verification mix.

Slice 2 replaces fixture loading with a real local repository adapter. It will first ingest Git status/diff and file-level dependencies, then add symbol-level parsing for TypeScript and Go. The HTTP contract must not change merely because the source adapter improves.

## Review gates

Every slice must pass:

1. Go unit tests, including a red-first test for each new behavior;
2. Go formatting and static checks;
3. web typecheck/build/tests;
4. API smoke test against a running Go server;
5. real browser verification at desktop and narrow viewport;
6. visual inspection of saved screenshots;
7. review pass recorded in the vault board;
8. all review findings fixed and re-reviewed before the next slice.

## Cutover rule

The old MCP server is deprecated. Replace it with a normal commit on `main` that removes the old TypeScript/MCP product and adds Atlas. Do not force-push, rewrite history, or delete branches. The old implementation remains available in Git history but is no longer the working tree product.

## Deferred

- authentication and team accounts;
- cloud persistence;
- full language-server indexing;
- autonomous agent control;
- automatic approval;
- complete Jev calibration/evaluation UI;
- desktop shell;
- mutation testing as a required dependency.
