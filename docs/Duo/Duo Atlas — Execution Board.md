---
project: Duo Atlas
status: active implementation
repository: https://github.com/shyn48/duo
local_checkout: /Users/shayanbalaee/code-stuff/Personal Projects/duo-atlas
branch: main
updated: 2026-09-22
---

# Duo Atlas — Execution Board

> **Operating rule:** design → plan → implement one vertical slice → review pass → fix every finding → review again until clean → next slice.

## Current state

- **Current slice:** Slice 3 — agent turn evidence, ready to start
- **Checkout:** `/Users/shayanbalaee/code-stuff/Personal Projects/duo-atlas`
- **Remote:** `https://github.com/shyn48/duo.git`
- **Branch:** `main`
- **Old product head:** `f761603043b07663135497e5cc272cd73aebc439`
- **Legacy tag:** `duo-legacy-v0.6.0` pushed before cutover
- **Cutover commit:** `527a068` — Atlas replaced the deprecated MCP product and was pushed to `main`
- **Slice 1 review commits:** `f4216ef` + final frontend follow-up `f6a8740`, both pushed to `main`
- **Slice 2 ingestion commits:** `508ff82` + final TypeScript lexer follow-up `346db2f`, both pushed to `main`
- **Verified upstream divergence after each code push:** `0 0`
- **Next gate:** define the smallest normalized agent-turn event envelope, ingest one local agent fixture, and link tool/patch/check evidence to the real repository graph

## Completed evidence

### Design and planning

- [x] Audit deprecated Duo MCP repository
- [x] Confirm Go core + React/Vite web stack
- [x] Define Jev review-prioritization wedge
- [x] Write `docs/atlas-design.md`
- [x] Write `docs/atlas-plan.md`
- [x] Write `docs/atlas-handoff.md`

### Slice 1 implementation

- [x] Go module, domain types and fixture snapshot
- [x] Deterministic ranking provider with evidence-linked signals
- [x] Go HTTP API: health, snapshot, review decision
- [x] React/Vite change map and ranked review queue
- [x] Evidence drawer and Approve/Request revision actions
- [x] Unit/API/frontend tests
- [x] Go `test`, `vet`, `build` pass
- [x] Web `npm test`, `npm run build`, `npm run lint` pass
- [x] API smoke checks including local decision POST and unsafe-origin/content-type rejection pass
- [x] Real browser desktop verification
- [x] Real Chrome narrow geometry verification at the `<=620px` layout breakpoint
- [x] Review pass 1
- [x] Fix review findings
- [x] Review pass 2 and final follow-up re-review until clean
- [x] Commit and push Slice 1 (`f4216ef`, `f6a8740`)

### Slice 2 implementation

- [x] `-repo` local repository selection with `.` default
- [x] Git root, HEAD revision, working-tree diff and clean latest-commit fallback
- [x] NUL-safe Git path parsing, rename/delete/root/merge commit handling
- [x] Git-ignored/generated source filtering and bounded regular-file reads
- [x] Go and TypeScript local dependency projection with baseline variants
- [x] File-backed nodes, evidence and deterministic review candidates
- [x] Unknown verification rendered as not run; boundary/contract signals explicitly unassessed
- [x] Dense file graph rendering and file-aware UI labels
- [x] Integration/regression tests and real self-ingestion browser verification
- [x] Review/fix/re-review until clean
- [x] Commit and push Slice 2 (`508ff82`, `346db2f`)

## Slice 0 — Cutover, design and plan

- [x] Audit deprecated Duo MCP repository
- [x] Confirm Go core + React/Vite web stack
- [x] Define Jev review-prioritization wedge
- [x] Write design and execution plan
- [x] Preserve old product at `duo-legacy-v0.6.0`
- [x] Commit staged deletion + Atlas replacement to `main` (`527a068`)
- [x] Push and verify upstream divergence `0 0`

## Slice 2 — Real local repository ingestion

- [x] Git revision/status/diff ingestion
- [x] TypeScript and Go file-level dependency edges
- [x] Replace fixture-only runtime data while preserving API contract and fixture tests
- [x] Integration tests and browser verification
- [x] Review/fix loop
- [x] Push to `main` (`508ff82`, `346db2f`)

## Slice 3 — Agent turn evidence

- [ ] Normalized agent adapter envelope
- [ ] Local agent event fixture
- [ ] Timeline, tools, patches, checks and evidence freshness
- [ ] Review/fix loop
- [ ] Push to `main`

## Slice 4 — Jev review prioritization

- [ ] Go TypeSafe HTTP client
- [ ] Choice/Score request and response validation
- [ ] Raw probabilities/confidence + deterministic signals
- [ ] Fallback/escalation behavior
- [ ] Provider and judgment fixture tests
- [ ] Review/fix loop
- [ ] Push to `main`

## Slice 5 — Constraints and proposals

- [ ] Repository-local constraints
- [ ] Deterministic boundary checks
- [ ] Observed versus proposed architecture view
- [ ] Review/fix loop
- [ ] Push to `main`

## Slice 6 — Product hardening

- [ ] Local persistence and incremental indexing
- [ ] Accessibility, keyboard and performance pass
- [ ] Security/privacy review
- [ ] Install/run documentation
- [ ] Final browser/test verification
- [ ] Push to `main`

## Review ledger

Slice 1 is clean. Pass 1 findings were fixed in `f4216ef`; the final frontend re-review found two smaller presentation issues, both fixed in `f6a8740`. Backend and frontend independent re-reviews report no remaining actionable findings.

| ID | Severity | Finding | Fix | Re-review |
|---|---|---|---|---|
| S1-01 | Medium | Review decisions were held as one global frontend state and followed the user between targets | Store all server decisions and resolve the latest decision by target | Closed |
| S1-02 | Medium | Change map nodes/edges were hardcoded to the fixture and node selection could infer relationships from matching IDs | Render `snapshot.nodes`/`snapshot.edges`; map nodes only through explicit `ReviewTarget.nodeIds` | Closed |
| S1-03 | Medium | Local API accepted loose methods/JSON/targets and exposed permissive CORS/write boundaries | Enforce methods, strict bounded JSON, known targets, JSON content type, loopback origins and loopback listen addresses | Closed |
| S1-04 | Medium | Ranking/provider contract could depend on floating-point ties, provider slice mutation, and leaked internal candidates | Fixed-point score units + stable ID tie-break, deep-cloned provider input, `Candidates` excluded from JSON | Closed |
| S1-05 | Medium | UI presented non-server-owned or misleading state: global priority label, green failed verification, hardcoded turn/workflow progress | Render score, verification status, confidence and agent status from the API; keep unsupported workflow steps neutral | Closed |
| S1-06 | Medium | Loading/error/empty and in-flight decision states were incomplete | Add retry, empty graph/queue states, target-scoped decision errors and globally safe in-flight decision blocking | Closed |
| S1-07 | Medium | Layout could overflow at intermediate/narrow widths and the confidence chip could clip on very small phones | Stack workspace at `<=1240px`; compact layout at `<=930/620px`; stack evidence header and wrap confidence at `<=420px` | Closed |
| S1-08 | Low | Placeholder controls looked interactive and TypeScript/Vite build outputs were tracked | Disable inert controls; move build info under ignored `dist/` and delete generated config output | Closed |

Validation at the clean Slice 1 head includes `go test -race ./...`, `go vet ./...`, `go build ./cmd/atlas`, `npm test --prefix web` (7/7), `npm run build --prefix web`, `npm run lint --prefix web`, and `git diff --check`. API runtime probes returned 200/201 for valid requests, 403 for a foreign-origin write, and 415 for a non-JSON write. The real Vite browser path submitted a decision with HTTP 201 and no console errors. Chrome geometry showed no horizontal overflow at 1000px or its 500px narrow viewport (`scrollWidth === clientWidth` in both), and the `<=420px` confidence-chip follow-up was independently re-reviewed against the responsive CSS.

Slice 2 is also clean. `508ff82` added the real Git-backed repository adapter and dogfood path; `346db2f` closed the last review finding around `declare global { ... }` followed by a regex literal in TypeScript. Review fixes also covered merge/root commits, rename/delete baselines, NUL-safe filenames, ignored/generated sources, bounded/non-regular file handling, TypeScript regex/comment/string false positives, dense graph layout, and truthful file/policy labels. Go package imports are currently projected onto package source files; this is a deliberate file-level approximation until symbol-level indexing exists.

Slice 2 validation: `go test ./...`, `go test -race ./...`, `go vet ./...`, `go build ./cmd/atlas`, `npm test --prefix web` (9/9), `npm run build --prefix web`, `npm run lint --prefix web`, and `git diff --check` pass. From a clean checkout, Atlas ingested itself at revision `346db2fd1872`, reported the latest-commit turn and its two changed files plus related dependency nodes/edges, accepted a review decision with HTTP 201, and rendered the same evidence in the real browser with no console errors.

## Handoff

- [[Duo Atlas — Agent Handoff]] — copy-paste continuation instructions
- [[Duo Atlas — PRD v0.1]]
- [[Duo Atlas — Design v0.1]]
- [[Duo Atlas — Execution Plan v0.1]]
