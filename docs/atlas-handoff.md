# Duo Atlas — Agent Handoff

> Copy this note into the next agent’s task context. Continue execution; do not restart discovery.

## Mission

Continue replacing the deprecated Duo MCP Server with Duo Atlas on `main` in `shyn48/duo`.

Product direction:

- Go core/local service for repository state, graph/evidence computation, review ranking and policy.
- React + Vite browser frontend.
- Jev/TypeSafe is a later typed judgment provider; the first usable baseline is deterministic and evidence-backed.
- Primary wedge: **rank which changed files, symbols or edges a human should review first, and explain why**.

Required workflow for every slice:

1. design;
2. plan;
3. write tests first and observe RED;
4. implement the smallest vertical slice;
5. run unit/build/API/browser verification;
6. review against design and acceptance criteria;
7. fix every finding;
8. repeat review until no actionable findings remain;
9. update the vault board;
10. commit and push to `main` before starting the next slice.

Never force-push, rewrite history, delete branches, or restore the old MCP product into the working tree.

## Repositories and history

- Remote: `https://github.com/shyn48/duo.git`
- Checkout: `/root/duo-atlas-repo`
- Branch: `main`
- Old product head: `f761603043b07663135497e5cc272cd73aebc439`
- Legacy preservation tag already pushed: `duo-legacy-v0.6.0`
- The old product was removed from the working tree through staged deletions, but the cutover is **not committed or pushed yet**.
- The old MCP code remains recoverable from the tag/history. Do not resurrect it.

Start by inspecting:

```bash
cd /root/duo-atlas-repo
git status --short --branch
git log -3 --oneline
git tag --list 'duo-*'
```

## What is complete

### Planning and documentation

- `docs/atlas-design.md` — Slice 1 architecture and HTTP/domain contracts.
- `docs/atlas-plan.md` — slice sequence and review gates.
- Vault PRD: `Side-Projects/Duo/Duo Atlas — PRD v0.1.md`.
- Vault design: `Side-Projects/Duo/Duo Atlas — Design v0.1.md`.
- Vault plan: `Side-Projects/Duo/Duo Atlas — Execution Plan v0.1.md`.
- Vault board: `Side-Projects/Duo/Duo Atlas — Execution Board.md`.

### Go Slice 1 implementation currently in working tree

- `go.mod` — Go 1.18 module.
- `internal/model/model.go` — JSON/domain types for repository, turn, nodes, edges, evidence, verification, candidates, review targets and decisions.
- `internal/review/review.go` — `JudgmentProvider` seam and deterministic ranking provider.
- `internal/review/review_test.go` — ranking and non-mutation tests.
- `internal/snapshot/fixture.go` — checked-in fixture-shaped snapshot for `vpay-backend` and an agent turn.
- `internal/httpapi/server.go` — `GET /api/health`, `GET /api/snapshot`, `POST /api/review-decisions`.
- `internal/httpapi/server_test.go` — API tests.
- `cmd/atlas/main.go` — local API server on `127.0.0.1:4173` by default.

### React/Vite frontend currently in working tree

- `web/package.json`, Vite/TypeScript configs and `web/index.html`.
- `web/src/types.ts` — typed API model.
- `web/src/api.ts` — snapshot and review-decision client.
- `web/src/review.ts` + `web/src/review.test.ts` — evidence selection/action helpers.
- `web/src/App.tsx` — change map, ranked “Review first” queue, evidence panel, signals, verification and Approve/Request revision actions.
- `web/src/styles.css` — dark developer-workbench visual system with responsive layout.
- `web/src/vite-env.d.ts` — Vite type declaration.

## Verified results

From `/root/duo-atlas-repo`:

```bash
go test ./...
go vet ./...
go build ./cmd/atlas
```

All pass.

From `/root/duo-atlas-repo/web`:

```bash
npm install
npm test
npm run build
npm run lint
```

All pass. `npm install` reported 0 vulnerabilities.

Live smoke checks passed:

- `http://127.0.0.1:4173/api/health` → HTTP 200, `{"status":"ok","version":"0.1.0"}`.
- `http://127.0.0.1:4173/api/snapshot` → HTTP 200 with ranked targets; Payments ranks first because of boundary crossings, fan-out, public contract impact and failed verification.
- `http://127.0.0.1:5173/` → HTTP 200 Vite app shell.

Background processes may still be running:

```bash
go run ./cmd/atlas -addr 127.0.0.1:4173
npm run dev -- --host 127.0.0.1   # from web/
```

Do not assume browser QA passed. The managed browser rejected private/internal URLs (`127.0.0.1` and `host.docker.internal`) before rendering, so desktop/narrow screenshot verification is still open. Use an allowed browser-accessible route or another verified local-browser method; do not mark it complete from curl alone.

## Immediate next steps

### 1. Finish cutover safely

The working tree contains staged deletions of the old product plus untracked Atlas files. Inspect the full staged/untracked diff. Ensure `web/node_modules/`, `web/dist/` and `/atlas` are ignored. Then stage all intended Atlas files and commit the cutover:

```bash
cd /root/duo-atlas-repo
git status --short --branch
git diff --cached --stat
git add -A
git diff --cached --check
git diff --cached --name-status
git commit -m "feat: replace Duo with Atlas review cockpit"
git push origin main
```

Before committing, make sure no secrets, caches or unrelated files are included. Verify after push:

```bash
git status --short --branch
git rev-list --left-right --count '@{u}...HEAD'
```

Expected divergence: `0 0`.

### 2. Run Slice 1 review pass

Review the actual code, not only the summary. Check:

- HTTP methods/statuses and malformed input handling;
- decision IDs and timestamps;
- CORS and local-only exposure assumptions;
- deterministic ranking explainability and stable tie ordering;
- frontend loading/error/empty states;
- evidence selection and target/node consistency;
- responsive overflow at desktop and narrow viewport;
- keyboard/focus states and button semantics;
- no browser-side ranking or fabricated evidence;
- no old Duo MCP references in the new default product path.

Put every finding into the vault board’s review ledger. Fix all findings, rerun tests/build/smoke/browser QA, then review again until the ledger is clean. Only then mark Slice 1 complete and push the fix/review commits.

### 3. Update the vault board after each state change

Update `Side-Projects/Duo/Duo Atlas — Execution Board.md`:

- current slice and exact commit;
- completed Slice 0/1 items;
- browser verification status honestly;
- review ledger findings and fixes;
- next gate.

Commit and push vault changes explicitly; do not stage unrelated ModelAI Health files.

## Important product boundaries

- This is a local-first developer tool, not a SaaS control plane yet.
- Fixture data is acceptable only for Slice 1. Slice 2 must ingest a real local repository while preserving the HTTP contract.
- Deterministic Go code owns graph/evidence/ranking inputs and thresholds.
- Jev must later return typed probabilities/confidence through a server-side Go provider; never put credentials in React.
- Jev’s ranking is a review aid, never automatic approval.
- Do not claim a real repository graph until Slice 2 exists.
- Do not claim browser verification until a real browser has rendered the app and screenshots/geometry have been inspected.
