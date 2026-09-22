# Duo Atlas — Agent Handoff

> Continue execution from this state. Do not restart product discovery or restore the deprecated MCP implementation.

## Mission

Duo Atlas is replacing the old Duo MCP Server with a local-first developer workbench for understanding agent-authored system changes.

Current product direction:

- Go core/local service owns repository state, graph/evidence computation, review ranking, policy, and review decisions.
- React + Vite owns presentation and interaction.
- The primary wedge is: **rank which changed files, symbols, or edges a human should review first, and explain why**.
- Jev/TypeSafe remains a later typed judgment provider. The current baseline is deterministic and evidence-backed.

For every slice: design → RED tests → smallest vertical implementation → unit/build/API/browser verification → review → fix every finding → re-review until clean → update docs/vault → commit and push `main`.

Never force-push, rewrite history, delete the legacy tag, or restore the old MCP product into the default working tree.

## Repository state

- Checkout: `/Users/shayanbalaee/code-stuff/Personal Projects/duo-atlas`
- Remote: `https://github.com/shyn48/duo.git`
- Branch: `main`
- Old product head: `f761603043b07663135497e5cc272cd73aebc439`
- Legacy preservation tag: `duo-legacy-v0.6.0`
- Atlas cutover: `527a068`
- Slice 1 review fixes: `f4216ef1b34aa63d38a53685d035b28de6844da7`
- Final Slice 1 frontend follow-up: `f6a874059fb02f6e9a1b3fa48a43cb156a03de0c`
- Slice 2 repository ingestion: `508ff82023196771d911b1ca5adbe744c387fd1c`
- Final Slice 2 TypeScript lexer follow-up: `346db2fd1872`
- Slice 1 and Slice 2 product commits are pushed to `origin/main`; divergence was verified as `0 0` after the latest code push.
- A newer documentation-only commit may exist after this handoff is committed. Treat `346db2f` as the clean Slice 2 product-code head.

Start with:

```bash
cd "/Users/shayanbalaee/code-stuff/Personal Projects/duo-atlas"
git status --short --branch
git log -5 --oneline
git rev-list --left-right --count '@{u}...HEAD'
```

## Slice 1 — complete and reviewed

The ranked review queue tracer bullet is complete:

- checked-in fixture-shaped snapshot;
- deterministic ranking provider behind the `JudgmentProvider` seam;
- `GET /api/health`;
- `GET /api/snapshot` returning `{ snapshot, reviewTargets, decisions }`;
- `POST /api/review-decisions`;
- dynamic graph from API nodes/edges;
- ranked human-review queue and linked evidence panel;
- approve/request-revision interaction;
- server-owned agent status, confidence, verification state, decisions, and target relationships;
- responsive desktop/narrow layout and explicit empty/error/retry states.

Internal ranking candidates remain Go-only and are not serialized to the browser.

### Review result

Pass 1 fixed the API boundary and malformed-input handling, local-only exposure assumptions, unique decision IDs, exact deterministic tie ordering, provider-input aliasing, leaked internal candidates, target-global decision state, hardcoded graph data, misleading verification/priority/status presentation, missing empty/retry states, inert controls, generated TypeScript build artifacts, and responsive overflow.

The final frontend re-review then found two smaller issues:

1. a confidence chip that could clip below 420px;
2. workflow progress that still implied Plan/Edit/Review state not owned by the server.

Both are fixed in `f6a8740`. Independent backend and frontend re-reviews report no remaining actionable Slice 1 findings. See `docs/Duo/Duo Atlas — Execution Board.md` for the full ledger.

### Verification

The clean Slice 1 tree passed:

```bash
go test -race ./...
go vet ./...
go build ./cmd/atlas
npm test --prefix web
npm run build --prefix web
npm run lint --prefix web
git diff --check
```

Frontend tests: 7/7 passing.

Runtime checks also passed:

- health and snapshot GETs return 200;
- a valid local review decision returns 201;
- foreign-origin writes return 403;
- non-JSON writes return 415;
- the actual Vite browser path posts a decision successfully with 201;
- attached-browser console had no errors;
- real Chrome geometry had no horizontal overflow at 1000px or its 500px narrow viewport;
- the `<=420px` confidence-chip fix was independently re-reviewed against the responsive CSS.

## Slice 2 — complete and dogfooding

Atlas now ingests a real local Git checkout instead of using fixture data at runtime. `cmd/atlas` accepts `-repo` and defaults to `.`, so running it from the Duo Atlas checkout makes Atlas inspect itself.

The repository adapter:

- resolves the Git root and HEAD revision;
- ingests working-tree changes, or the latest commit when the tree is clean;
- handles root commits, first-parent merge diffs, renames, deletions and baseline source variants;
- parses Git paths with NUL-safe output and ignores Git-ignored/generated sources;
- bounds source-file reads and skips non-regular files;
- projects local Go package imports and TypeScript relative imports into file-backed graph nodes/edges;
- creates diff evidence and deterministic file review candidates without changing the public HTTP contract;
- leaves verification `unknown` until checks are actually ingested;
- leaves architecture-boundary/public-contract signals unassessed instead of inventing them.

Go import edges are currently package dependencies projected onto package source files. They are useful for file-level review fan-out but are not symbol-precise dependency evidence yet.

The clean Slice 2 head passed `go test ./...`, `go test -race ./...`, `go vet ./...`, `go build ./cmd/atlas`, `npm test --prefix web` (9/9), `npm run build --prefix web`, `npm run lint --prefix web`, and `git diff --check`. Independent re-review closed the final TypeScript `declare global { ... } /regex/` false-dependency reproduction.

Dogfood proof from a clean checkout: Atlas reported repository `duo-atlas` at revision `346db2fd1872`, turn `Latest commit: fix: handle declare global after TypeScript blocks`, two changed files plus their related dependency nodes/edges, and accepted a review-decision POST with HTTP 201. The real browser rendered the same latest-commit evidence and `Not assessed` policy signals with no console errors.

## Current gate — Slice 3: agent turn evidence

Keep the real repository graph as the substrate. The next slice should:

1. define a normalized local agent-turn event/envelope;
2. ingest one recorded local agent transcript/event fixture;
3. link tool calls, patches, checks and completion claims to repository graph targets;
4. expose evidence freshness/source without mixing observed state with claims;
5. render the agent timeline against the existing review target/evidence model;
6. run the full review/fix/re-review loop before Jev integration.

## Product boundaries

- Local-first developer tool; no SaaS control plane yet.
- Go owns repository state, graph/evidence inputs, ranking signals, policy, and decisions.
- React renders the normalized API contract and must not invent graph relationships or ranking.
- Jev credentials must remain server-side when that provider is implemented.
- Jev ranking is review guidance, never automatic approval.
- Observed repository state and proposed architecture must remain distinct.
- Fixture data remains for deterministic tests; runtime repository state is Git-backed as of Slice 2.
- Persistent storage, incremental indexing, broad accessibility/performance hardening, and release packaging remain later slices.
