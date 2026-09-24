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
- `www` — Astro website, built as Cloudflare Workers Static Assets (not deployed)
- `docs/rfds` — design records

## First vertical slice

The implemented first slice runs a single trial against an AUT defined by the eval author, streams normalized events into an append-only `trajectory.jsonl`, runs deterministic predicates, and writes a local report tree:

```text
_evalkit-results/<run-id>/
├── manifest.json
├── summary.json
└── trials/<trial-id>/
    ├── manifest.json
    ├── trajectory.jsonl
    ├── scoring.json
    └── summary.json
```

Artifact workspaces and concrete AUT transports remain in progress. The local CLI loads an explicit project registry or discovers `evals/*.eval.ts` with `evalkit run-evals`, writes reports to `_evalkit-results/`, and preserves candidate/evaluator workspaces under `_evalkit-sandbox/<trial-id>/` for local inspection.

## User manual

Start with the [getting-started guide](www/src/pages/docs/index.astro), then use the [Evalkit manual](www/src/content/manual.md) for details on adding agents, fixtures and evals, running suites and matrices, and inspecting or processing results. Agent-facing workflow skills live in [`.agents/skills/`](.agents/skills/), starting with [the Evalkit guide](.agents/skills/evalkit/SKILL.md).

## Development

```bash
bun install
bun run check
bun test
```
