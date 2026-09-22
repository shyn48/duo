# Duo Atlas — Execution Plan

## Operating rule

Work in vertical slices. For each slice:

1. design the smallest end-to-end behavior;
2. write tests first and watch them fail;
3. implement the smallest working path;
4. run unit/build/browser verification;
5. perform a review pass against the design and acceptance criteria;
6. fix every review item;
7. repeat the review until no actionable findings remain;
8. only then start the next slice.

## Slice board

### Slice 0 — Cutover, design and plan

- [x] Audit deprecated Duo MCP repository and current revision.
- [x] Agree Go core + React/Vite web stack.
- [x] Define review-prioritization wedge and Jev provider seam.
- [x] Write `docs/atlas-design.md`.
- [x] Write this execution plan.
- [ ] Replace old product in the working tree with Atlas scaffold.

### Slice 1 — Ranked review queue vertical tracer bullet

- [ ] Add Go module, domain types and fixture snapshot.
- [ ] Add deterministic ranking provider with evidence-linked signals.
- [ ] Add HTTP health/snapshot/review-decision endpoints.
- [ ] Add React/Vite app with change map, ranked queue and evidence drawer.
- [ ] Add approve/request-revision interaction.
- [ ] Add unit/API/frontend tests.
- [ ] Run desktop and narrow browser verification.
- [ ] Review pass 1.
- [ ] Fix all review items.
- [ ] Review pass 2 until clean.
- [ ] Commit and push to `main`.

### Slice 2 — Real local repository ingestion

- [ ] Read repository root and Git revision from configuration/CLI.
- [ ] Ingest changed files and diff metadata.
- [ ] Ingest file-level dependency edges for TypeScript and Go.
- [ ] Replace fixture-only data while preserving the HTTP contract.
- [ ] Add fixture and real-repository integration tests.
- [ ] Browser review of a real Duo Atlas checkout.
- [ ] Review/fix loop until clean.
- [ ] Commit and push to `main`.

### Slice 3 — Agent turn evidence

- [ ] Define normalized agent adapter envelope.
- [ ] Ingest one local agent transcript/event fixture.
- [ ] Link tools, patches, checks and completion claims to graph targets.
- [ ] Display the agent timeline and evidence freshness.
- [ ] Review/fix loop until clean.
- [ ] Commit and push to `main`.

### Slice 4 — Jev review prioritization

- [ ] Implement Go TypeSafe HTTP client with server-side credential handling.
- [ ] Add Choice/Score request contract and response validation.
- [ ] Preserve raw probabilities/confidence and deterministic input signals.
- [ ] Add fallback behavior when Jev is unavailable or uncertain.
- [ ] Add recorded judgment fixtures and provider tests.
- [ ] Review/fix loop until clean.
- [ ] Commit and push to `main`.

### Slice 5 — Architecture constraints and proposals

- [ ] Add repository-local constraints.
- [ ] Add deterministic boundary checks.
- [ ] Add proposal view separate from observed repository state.
- [ ] Add constraint/proposal evidence to review targets.
- [ ] Review/fix loop until clean.
- [ ] Commit and push to `main`.

### Slice 6 — Product hardening

- [ ] Persistent local snapshots and decisions.
- [ ] Incremental indexing.
- [ ] Accessibility and keyboard navigation pass.
- [ ] Large-repository rendering/performance pass.
- [ ] Security/privacy review.
- [ ] Release documentation and install/run path.
- [ ] Final browser and test verification.
- [ ] Commit and push to `main`.

## Review ledger

No implementation review has run yet. Record every finding here with severity, file/route, fix commit and re-review result. Do not mark a slice complete while this ledger contains an open actionable item.
