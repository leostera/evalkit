# Evalkit

A Bun monorepo for defining, executing, and reporting agent evaluations.

Evalkit models an **Agent Under Test (AUT)** as a session that receives messages and emits normalized events. Evaluations declare a transcript, fixtures, and scoring; the runner drives the AUT and writes an inspectable report tree.

## Workspace layout

- `packages/core` — declarative eval, AUT, trajectory, scoring, and report contracts
- `packages/runner` — in-process runner and local report store
- `packages/agents` — future Cloudflare Agents SDK AUT adapter
- `packages/cli` — `evalkit` command-line interface
- `examples/starter` — runnable local eval project and CLI integration target
- `examples/agents-sdk` — future evaluated agent example
- `docs/rfds` — design records

## First vertical slice

The implemented first slice runs a single trial against an AUT defined by the eval author, streams normalized events into an append-only `trajectory.jsonl`, runs deterministic predicates, and writes a local report tree:

```text
evalkit-results/<run-id>/
├── manifest.json
├── summary.json
└── trials/<trial-id>/
    ├── manifest.json
    ├── trajectory.jsonl
    ├── scoring.json
    └── summary.json
```

Artifact workspaces and concrete AUT transports remain in progress. The local CLI discovers an explicit project registry with `evalkit run-evals` and writes reports to `evalkit-results/` by default.

## Development

```bash
bun install
bun run check
bun test
```
