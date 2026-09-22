# Duo

Duo is the pair-programming workflow/tool built so Shayan stays involved in code instead of becoming only an AI reviewer.

## Core Idea

Sustainable AI coding, not just faster output.

## Current Direction

- Mode selector: `pair`, `delegate`, `review`
- Understanding checkpoints
- Session resume and orientation
- Sub-agent result contracts
- Publication/polish path

## Evolved Direction

Duo is evolving from a workflow tool for staying involved while writing code into a visual workbench for owning agent-authored system changes. **Duo Atlas** is the discovery name for this direction: local-first, change-centric, evidence-backed review for solo developers using coding agents.

- [[Duo Atlas — PRD v0.1]] — product requirements and boundary
- [[Duo Atlas — Design v0.1]] — agreed Slice 1 architecture and contracts
- [[Duo Atlas — Execution Plan v0.1]] — slice sequence and review gates
- [[Duo Atlas — Execution Board]] — live implementation board and review ledger
- Current stage: Slice 2 complete and clean; Slice 3 ready to start
- Product code head: `346db2f` (real repository ingestion + final lexer review fix)
- Dogfood: Atlas now ingests its own checkout by default and falls back to the latest commit when the working tree is clean
- Next gate: ingest normalized agent-turn evidence and link tools, patches, checks and claims to graph targets

## Next Ideas

- npm publish
- ClawdHub publication
- File watcher integration
- Checkpoint compaction tool
- Better mode/checkpoint recovery UX
