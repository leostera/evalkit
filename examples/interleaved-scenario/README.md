# Interleaved scenario example

A provider-free, zero-config Evalkit project demonstrating live checkpoints between turns. The in-process AUT emits real `tool-call`/`tool-result` events and writes `number.txt` to its **candidate** workspace. No provider credentials or model charges are involved.

From the repository root, install dependencies; then run from this directory:

```sh
bun run pass       # write-revise: verifies 2112, requests a revision, verifies 2113
bun run failfast   # failfast-file: intentional failed assertion; CLI exits nonzero
bun run dashboard  # inspect trial checkpoints, skipped steps, and final scorers
bun run test       # provider-free integration test with isolated reports
```

`evals/write-revise.eval.ts` passes: `user(...)`, `check(...)`, and `expectToolCall(...)` run in order in one session. The expected tool call matches an **emitted** event, not an action executed by the runner. A live file check verifies what the tool actually wrote before the next prompt. The final `predicate(...)` runs after session close.

`evals/failfast-file.eval.ts` deliberately emits the expected `write_file` call but writes the wrong content; the tool result reports `{ ok: false }`. The call expectation still passes—it does not assert tool success—while the live file check fails. `policy.failfast` skips the revision and the final-file predicate, but a `supportsPartial` predicate runs and the report still fails overall. Run this eval separately because its CLI exit code is intentionally nonzero.

Each eval file declares its complete transcript, checks, and final scoring in place. They intentionally repeat the scenario so you can read either example without following a shared factory. Both evals are discovered from default exports without a config. Reports are local under `_evalkit-results/` (v3 manifests and checkpoint results); trial workspaces remain under `_evalkit-sandbox/`, both ignored by Git. `src/run.test.ts` runs each eval in a temporary project report root and verifies evidence, skipped steps, and the combined pass gate. Checkpoints do **not** provide enforced timeouts, cancellation, or a process-wide egress guard.
