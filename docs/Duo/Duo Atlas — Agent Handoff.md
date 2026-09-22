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
- Both Slice 1 code commits were pushed to `origin/main`; divergence was verified as `0 0` after each push.
- A newer documentation-only commit may exist after this handoff is committed. Treat `f6a8740` as the clean Slice 1 product-code head.

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

Do not claim Slice 1 is backed by a real repository graph: the data source is still the checked-in fixture by design.

## Current gate — Slice 2: real local repository ingestion

Do not change the public HTTP contract merely because the source adapter improves.

The next slice should:

1. define the smallest repository-ingestion behavior and RED integration tests;
2. accept/resolve the local repository root and current Git revision;
3. ingest Git status/diff metadata into the existing snapshot model;
4. add file-level dependency edges for Go and TypeScript;
5. replace fixture-only repository data while keeping fixture tests;
6. verify the same review UI against a real Duo Atlas checkout;
7. run the full review/fix/re-review loop before moving to agent-turn evidence.

Prefer a narrow first end-to-end path over a broad parser/indexer. Symbol-level parsing can follow file-level ingestion.

## Product boundaries

- Local-first developer tool; no SaaS control plane yet.
- Go owns repository state, graph/evidence inputs, ranking signals, policy, and decisions.
- React renders the normalized API contract and must not invent graph relationships or ranking.
- Jev credentials must remain server-side when that provider is implemented.
- Jev ranking is review guidance, never automatic approval.
- Observed repository state and proposed architecture must remain distinct.
- Fixture data was valid for Slice 1 only; Slice 2 is the real-repository transition.
- Persistent storage, incremental indexing, broad accessibility/performance hardening, and release packaging remain later slices.
