# Interleaved scenario example

A provider-free, zero-config EvalKit project demonstrating live checkpoints between turns. The in-process AUT emits real `tool-call`/`tool-result` events and writes `number.txt` to its **candidate** workspace. No provider credentials or model charges are involved.

From the repository root, install dependencies; then run from this directory:

```sh
bun run evalkit run write-revise   # verifies 2112, requests a revision, verifies 2113
bun run evalkit run judged-reply   # same judge runs inline and after session close
bun run evalkit run failfast-file  # intentional failed assertion; CLI exits nonzero
bun run evalkit dev                # inspect run checkpoints, skipped steps, and final scorers
bun run test       # provider-free integration test with isolated reports
```

`scenarios/write-revise.eval.ts` passes: `user(...)`, `predicate(...)`, and `expectToolCall(...)` run in order in one session. The expected tool call matches an **emitted** event, not an action executed by the runner. A live file check verifies what the tool actually wrote before the next prompt. The final `predicate(...)` runs after session close.

`scenarios/judged-reply.eval.ts` places the **same `judge(...)` descriptor** inline and in final `scoring`. Its `agent` is a separate local fake judge, not a model call, so the example runs without credentials. EvalKit builds the judge's prompt from the rubric, the conversation and the reply, checks its JSON verdict (asking once more if it cannot read it), and records the prompt, reply, model and usage apart from the agent's own. A real judge agent calls a model; EvalKit never borrows the agent under test's model or tools.

`scenarios/failfast-file.eval.ts` deliberately emits the expected `write_file` call but writes the wrong content; the tool result reports `{ ok: false }`. The call expectation still passes—it does not assert tool success—while the live file check fails. `policy.failfast` skips the revision and the final-file predicate, but a `supportsPartial` predicate runs and the report still fails overall. Run this eval separately because its CLI exit code is intentionally nonzero.

Each eval file declares its complete transcript, rules, and final scoring in place. The file-writing evals intentionally repeat the scenario so you can read either example without following a shared factory. Both evals are discovered from default exports without a config. Reports are local under `_evalkit-results/` (v3 manifests and checkpoint results); run workspaces stay in the system temp directory, outside the project. `src/run.test.ts` runs each eval in a temporary project report root and verifies evidence, skipped steps, and the combined pass gate. Checkpoints do **not** provide enforced timeouts, cancellation, or a process-wide egress guard.
