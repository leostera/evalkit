# RFD0004 - Interleaved Scenario Checkpoints

- Feature Name: `interleaved-scenario-checkpoints`
- Status: Draft
- Author: `leostera`
- Start Date: `2026-09-24`
- Updated: `2026-09-24`
- Discussion PR: `TBD`
- Tracking Issue: `TBD`

## Summary

This RFD proposes executable checkpoints between `user(...)` steps in an eval's authored `transcript`. A checkpoint can inspect a typed view of the just-completed AUT turn, the accumulated trajectory, and live candidate/evaluator workspaces; an expected-tool-call helper checks an observed AUT event rather than causing a tool call. Checkpoint outcomes, including references to matched events, are persisted alongside final scores. `policy: { failfast: true }` stops subsequent authored steps after a failed checkpoint while still closing the AUT and writing the report; the default is to record the failure and continue. Execution and infrastructure errors stop regardless of `failfast`. The first slice supports deterministic checks and tool-call expectations, not model-graded `judge(...)` execution.

## Motivation

Before this implementation, the local runner sent every `user(...)` message on the same session and only then closed the session and ran `predicate(...)` scorers. `agent(...)` and `judge(...)` are declared as transcript steps but currently fail at execution; `judgeScorer(...)` is also not executable. A post-session predicate can check the final trajectory and files, but it cannot verify a turn **before** the next prompt, inspect the workspace at an intermediate point, or stop further instructions after a failed assertion. A file's final state cannot prove that a previous intermediate state was correct.

For example, an eval may ask the AUT to write a file, verify its contents, then ask for a revision and verify it again. A tool-call assertion and a file-content assertion answer different questions: the former requires an observed `tool-call` event, whereas the latter checks the resulting workspace. Such workflows currently require an eval-specific runner around the AUT. Evalkit should support their sequencing and evidence without conflating authored instructions with the observed trajectory.

Workshop-style shared-Worker tasks also motivate intermediate checks, but this RFD **does not** provide a safe process-wide lifecycle guard or enforced cancellation. Those remain separate prerequisites before the stock CLI or dashboard can safely run tasks that require them.

## Goals

- Run checks between AUT turns without closing or restarting the session.
- Give checks an unambiguous typed view of the just-completed turn (assistant messages and observed tool calls/results), accumulated raw events, and live workspaces.
- Persist each checkpoint result, including assertion/score/error distinctions, step index, matching event reference when relevant, and skipped steps, so it is inspectable and contributes to the trial pass gate.
- Let the eval-level `policy.failfast` decide whether a **failed assertion** stops subsequent authored steps; preserve the default behavior of continuing.
- Distinguish expected AUT tool activity from runner-driven tool invocation and from the resulting file state.
- Keep final post-session scoring available without silently changing its `overall` calculation.

## Non-goals

- Executing `judge(...)` with a model or defining a judge provider in the first slice. An unavailable judge must not become an implicit passing check.
- Adding general branching, retries, loops, approval workflows, or arbitrary tool-result injection to transcripts.
- Replacing the AUT `start`/`send`/`close` contract or implementing tools on behalf of an adapter.
- Enforcing `policy.timeoutMs`, adding process-wide lifecycle hooks, guaranteed cancellation, or changing cell/trial concurrency. A checkpoint cannot make those missing safeguards safe by itself.
- Defining a Workshop-specific verification, cache policy, measurement format, or baseline comparison algorithm.

## Guide-level explanation

An authored `transcript` is a **scenario**: instructions and checks in order. The `trajectory` is the **observed** event stream produced during its execution, including AUT messages/tool events and runner step/check events. This proposal retains the existing `transcript` field to avoid renaming ordinary evals; it does not rename the authored field to `trajectory`.

The API below is implemented in this repository but has **not been released or published**. See the provider-free [interleaved scenario example](../../examples/interleaved-scenario/README.md) for a runnable passing case, an intentional failfast failure, and a report integration test. `check(...)` is a checkpoint-specific helper; the existing `predicate(...)` remains a post-session scorer in `scoring`.

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { check, defineEval, expectToolCall, user } from '@evalkit/core';

async function candidateText(
  root: string,
  file: string,
): Promise<string | undefined> {
  try {
    return await readFile(join(root, file), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error; // unexpected I/O failure is not an assertion failure
  }
}

export default defineEval({
  id: 'write-and-revise',
  agent: myAgent,
  transcript: [
    user('Say hello, then wait.'),
    check('reply is at least ten characters', ({ turn }) => {
      const text = turn.lastAssistantText;
      return text !== undefined && text.length >= 10;
    }),
    user('Write 2112 into number.txt.'),
    expectToolCall({
      name: 'write_file',
      arguments: { path: 'number.txt', contents: '2112' },
    }),
    check(
      'first file version',
      async ({ artifacts }) =>
        (await candidateText(artifacts.candidate.root, 'number.txt')) ===
        '2112',
    ),
    user('Change number.txt to 2113.'),
    check(
      'revised file version',
      async ({ artifacts }) =>
        (await candidateText(artifacts.candidate.root, 'number.txt')) ===
        '2113',
    ),
  ],
  scoring: [],
  policy: { failfast: true },
});
```

`send()` must resolve after the AUT completes the turn. Each following check runs while the same session and workspace still exist, before the next `user(...)`. `candidateText` treats a missing file as a failed assertion (`false`), while unexpected I/O errors still throw and halt independently of `failfast`. `turn` also exposes typed `assistantMessages` and `toolCalls` projections, with raw `turn.events` for unusual checks. `turn.lastAssistantText` is `undefined` when the last assistant message in that turn is absent or non-string; it is not inferred from `send()`'s return value. The current `AutSession.send()` returns `void`, so this proposal does not claim to capture an application's separate domain output (such as `{ status, ticketId }`). `expectToolCall(...)` searches only the just-completed turn's **AUT** tool-call events. It cannot execute `write_file` or prove the file was actually written; the subsequent file check does that. A caller that does not emit tool events cannot pass a tool-call assertion merely by creating a file.

`check` returns a boolean assertion as shorthand (`true` becomes value 1, `false` becomes 0) or the same finite `0..1` score value/object as a predicate; only value 1 passes by default, unless `passed` is explicit. Reports preserve the difference between an assertion failure, a valid partial numeric score, a thrown evaluator error, and a skipped check; none may silently become a passing assertion. A check may attach an explanation and JSON evidence. End-of-run scorers still live in `scoring`. In the first slice, a reader should use checkpoint records to see **which intermediate assertion failed**, and the run/trial pass counts to gate the whole eval.

With `failfast: true`, a false result at the first file check records the failure, marks the remaining authored steps as skipped, and proceeds directly to session close and report finalization. It does **not** send the revision request. With `failfast: false` or no `failfast` field, it records the failure and continues to the revision request, but the trial cannot pass overall. A throwing check is a check execution error, **not** a false assertion: execution stops regardless of `failfast`.

Future model-backed inline judges could occupy the same checkpoint position:

```ts
// Future work: judge(...) is currently declared but not executable.
// user('Say hello.'),
// judge('The assistant says hello back.'),
```

Such a judge needs an explicit execution/provider contract and a persisted score/error; this RFD does not claim that adding it to a transcript makes it runnable.

## Reference-level explanation

### Architecture and boundaries

- `@evalkit/core` defines checkpoint step values, `check(...)`, `expectToolCall(...)`, `policy.failfast`, typed checkpoint context/results, and versioned report/event schemas. A definition does no work when constructed.
- `@evalkit/runner` interprets all transcript steps in order, tracks turn event boundaries, executes checkpoint callbacks, persists their outcomes, applies failfast, and always attempts session close, artifact capture, cleanup, and finalization. Runner and AUT events remain distinguishable by `source`.
- AUT adapters continue to emit `message`, `tool-call`, and `tool-result` events through `onEvent`; the runner does not synthesize an AUT tool call from a file or from a transcript expectation. No provider-specific data is required in core.
- CLI, dashboard, and any future executor consume the **same** runner checkpoint semantics. Their report readers and display must show failed/skipped checks and use the combined pass gate, not just the post-session scorer list.

### Data model and interfaces

The intended shapes, subject to TypeScript naming review, are:

```ts
type CheckpointContext = ScoringContext & {
  turn: {
    userStepIndex: number;
    /** AUT events emitted during the most recent send, in receipt order. */
    events: readonly (AutEvent & { source: 'aut' })[];
    assistantMessages: readonly (Extract<AutEvent, { kind: 'message' }> & {
      role: 'assistant';
      source: 'aut';
    })[];
    toolCalls: readonly {
      eventIndex: number; // position in this trial's full trajectory
      id: string;
      name: string;
      arguments: JsonValue;
      resultObservation: 'observed' | 'absent' | 'ambiguous';
      result?: JsonValue; // only when a tool-result is unambiguously paired
    }[];
    /** Content of the last assistant message in this turn, if it is a string. */
    lastAssistantText?: string;
  };
};

type CheckStep = {
  kind: 'check';
  name: string;
  run(
    ctx: CheckpointContext,
  ): boolean | ScoreValue | Promise<boolean | ScoreValue>;
};

type ExpectToolCallStep = {
  kind: 'expect-tool-call';
  name: string; // default generated from the expected tool name
  expected: { name: string; arguments?: JsonValue };
};

type EvalPolicy = {
  trials?: number;
  timeoutMs?: number; // still not enforced by this RFD
  failfast?: boolean; // default false
};
```

`check(name, fn)` creates a `CheckStep`. `expectToolCall({ name, arguments?, ... })` creates an assertion step, not an action. The example uses `arguments`, matching today's `AutEvent` field rather than introducing `params`. A supplied `arguments` value must match a call's JSON arguments **exactly**, with object key order ignored and array order preserved; omitting it matches any arguments for that name. At least one matching call in the turn passes. Tool names are exact matches. No ordering constraint among multiple tool calls is inferred beyond their occurrence in the turn. An absent or malformed event is not a match; matching relies on the adapter's faithful event emission. A passing tool expectation records the matched tool-call ID and trajectory event index so a reader can inspect its actual arguments without duplicating them in the score. Multiple calls are retained individually. A `tool-result` can be associated by ID only when the call ID is unambiguous within the turn; otherwise the raw events remain available without a guessed pairing. Even an associated result does **not** prove successful tool execution: today's `AutEvent` has no normalized success/failure field. Matching a successful result requires a separately specified event contract, not a guess from the result payload.

The runner snapshots an event cursor immediately before `session.send()` and another after it resolves. The last completed user step and AUT events within those boundaries define `turn`. Successive checks after the same `user(...)` use the **same** turn view; checks do not advance that cursor. `trajectory.events` exposes the complete accumulated event stream, including runner events. The assistant/tool projections are derived only from the AUT events in that turn; they never invent an assistant reply from `send()` or treat a file write as an emitted tool event. Startup events and events from an earlier turn are not eligible for a current-turn tool expectation. Events emitted after `send()` resolves remain in the full trajectory but do not retroactively change completed checks; adapters must honor the existing `send()`-resolves-when-turn-finishes contract. A checkpoint before any `user(...)` is rejected during validation, rather than borrowing startup or previous-trial evidence.

`artifacts.candidate.root` and `artifacts.evaluator.root` are live trial workspaces at the time of the check, **not** the end-of-trial report snapshot. `context` carries the same trial identity, seed metadata, and selected parameters used by the adapter. Check callbacks are trusted eval code; the evaluator workspace must never be passed to the AUT/model.

### Lifecycle and failure semantics

The runner provisions fixtures and starts one session per trial as before. For each authored step:

1. Persist a step-start event with the zero-based authored step index.
2. For `user`, send the substituted message and wait for turn completion. For a checkpoint, evaluate against the current turn/workspace and persist a normalized result **before** deciding whether to send another message. Append a step-completed event when the step was interpreted, even if its assertion failed.
3. On a failed assertion, record its result and a `checkpoint-completed` event with `status: "failed"`. If `failfast` is true, mark remaining steps as skipped; otherwise proceed.
4. On a throwing/invalid check, adapter failure, or report persistence failure, record the error where possible and stop executing steps regardless of `failfast`.
5. Always attempt to close the opened session, handle eligible final scorers, snapshot candidate artifacts, clean up as appropriate, and finalize trial/run reporting. No step failure may intentionally bypass these attempts. Existing runner limitations around hangs and uninterruptible cleanup remain; they require a separate cancellation/lifecycle design.

An **assertion failure** is a scored outcome, not an execution failure. A failfast-stopped trial may retain execution `status: "completed"`, but its combined `scoring.passed` is `false`, and run `failed` counts include it. With `failfast: false`, later passing checks do not erase earlier failed ones. A checkpoint callback throwing or returning a non-finite/out-of-range value produces an explicit checkpoint **error**, not a score of zero; it halts the scenario and gives the trial execution `status: "failed"`. A failure in `send()`, fixture setup, or close remains an execution failure, independent of the policy. If no workspace/session was created, only the evidence successfully written before failure is available.

Because failfast can end a scenario before expected final files exist, post-session scorers with `supportsPartial: true` may run on a failfast-stopped trial; other final scorers are marked skipped. On full transcript completion, all existing final scorers run as before. An AUT execution error follows the existing partial-scoring rule. An error during final scoring never turns a failed checkpoint into a pass. The full transcript having no checks retains the existing final-scorer behavior.

### Effect, schemas, and logging

The runner should treat a false assertion as a **successful Effect containing a failed checkpoint result**; a thrown callback, invalid score/evidence, adapter failure, fixture failure, or report persistence failure belongs in a typed error channel. Normalize and decode checkpoint results with Effect Schema before persisting them; parse v2/v3 reports through a shared Schema boundary. Use `Effect.acquireUseRelease` for the AUT session and a scoped `Effect.acquireRelease` workspace so a failed check or writer append cannot bypass close/cleanup. Preserve primary errors when a release or logging operation also fails, and still attempt report finalization. The existing async report writer and final-scorer lifecycle can be bridged at explicit Effect boundaries; a complete migration of that legacy orchestration is separate work.

Annotate Effect logs with run ID, trial ID, eval ID, authored step index, checkpoint name, outcome, and error **type**. Do not log raw prompts, tool arguments, score evidence, or error payloads by default. Logs supplement, rather than replace, the durable trajectory and scoring records. This is observability, not a timeout, cancellation, or operation-wide egress safeguard.

### Reports and compatibility

Checkpoint results are recorded separately from final scorers within trial `scoring.json` and the trial summary. The proposed logical shape is:

```json
{
  "results": [],
  "checkpoints": [
    {
      "step": 2,
      "kind": "expect-tool-call",
      "name": "write_file",
      "status": "passed",
      "value": 1,
      "passed": true,
      "matchedToolCall": { "eventIndex": 7, "id": "example-call-id" },
      "durationMs": 1
    },
    {
      "step": 3,
      "kind": "check",
      "name": "first file version",
      "status": "failed",
      "value": 0,
      "passed": false,
      "durationMs": 2
    }
  ],
  "passed": false
}
```

This JSON is an **illustration of the proposed format**, not an actual run. A passing `expect-tool-call` record includes a `{ eventIndex, id }` reference to the matched call in `trajectory.jsonl`; it does not copy sensitive tool arguments into scoring by default. `results` remains the existing post-session scorer list; `overall`, when present, remains the mean of its **valid final-scorer values only**. Checkpoint scores do not silently change its denominator. Each checkpoint records its authored step index, kind, status (`passed`, `failed`, `error`, or `skipped`), duration if attempted, and optional normalized score/explanation/evidence/error or matching event reference. A valid value below 1 with an explicit `passed: true` remains a passing score, not an error; a thrown check never becomes a value of zero. Failed checks and errors make combined `scoring.passed` false; a skipped check is not counted as a pass. Remaining `user`/assertion steps after failfast have explicit skip events (and skipped checkpoint entries) rather than disappearing from reports. Run and trial pass counts use execution status **and** combined scoring, including checkpoints. The dashboard must not infer a pass solely from final-scorer results or an `overall` value.

Earlier v2 reports define only final `results` and no checkpoint events. Writers using this contract emit **v3** reports and new readers handle both v2 and v3; v2 files remain unchanged and readable, with no checkpoints implied. The new event and scoring fields must be validated at persistence boundaries. A shared, version-aware report reader/projection should serve the CLI, dashboard, and later CI consumers rather than requiring each to parse checkpoint JSON independently. Tests and dashboard routes must read both versions before v3 becomes the default for CLI/dashboard runs. No migration or rewrite of existing local reports is required. The existing `transcript: [user(...)]` and `scoring: [predicate(...)]` authoring API continues to work; `agent(...)` and `judge(...)` remain non-executable until independently specified, not silently reinterpreted as `check(...)`.

### Invariants

- An authored transcript describes actions and expectations; the recorded trajectory contains observations and runner outcomes. An expectation never fabricates an AUT event.
- A checkpoint evaluates after a completed `send()` and before the next authored `user(...)`, without ending the session.
- Turn-scoped matching never borrows events from another turn or trial. Derived views cannot claim a successful tool execution or application output not actually captured by the adapter.
- A failed assertion is never erased by later success; `failfast` affects further execution, not pass criteria.
- Execution, checkpoint errors, and valid low scores remain distinguishable in reports.
- `close()`, artifact capture, cleanup, and report finalization are attempted after failfast stops a transcript; failfast does not cancel those obligations.
- `scoring.overall` for existing final scorers does not change merely because checkpoints were added.
- Local and future remote runners interpret the same authored steps and report the same semantics.

### Security, privacy, and observability

Checkpoint code is trusted evaluator code with access to evaluator-only files. The AUT must receive only candidate-visible capabilities, as before. Checkpoint `evidence`, explanations, tool arguments, messages, and filenames may contain secrets; reports and dashboards must treat them as sensitive. Do not serialize raw workspace roots into reports. All recorded score evidence must be JSON-serializable and validated, with bounded payloads when limits are introduced. Step-indexed start, result, skip, and error events make intermediate state visible without presenting a tool expectation as an actual AUT action.

This feature lengthens the time a session and its resources remain live while checks run. It does **not** justify enabling shared-Worker tasks in the stock dashboard before a safe runner lifecycle guard and enforced cancellation exist.

### Rollout and validation

1. Define step/checkpoint types and validation in core; preserve existing eval definitions.
2. Extend one local runner path to track turn windows, execute deterministic checks, enforce `failfast`, and preserve close/capture/finalization on early stop.
3. Add exact observed-tool-call matching against emitted `AutEvent` values. Do not introduce tool execution in the runner.
4. Write/read v3 checkpoint scoring and event data while retaining v2 report reading; update CLI/dashboard views and pass gates together.
5. Add tests for one-turn and multi-turn checks, multiple checks after a turn, missing/non-string assistant messages, repeated and unmatched tool calls, matched event references, a tool result that does not imply success, exact JSON matching, file changes across prompts, `failfast` true/false, skipped steps, boolean vs numeric scores vs errors, session/send/close failures, partial final scoring, report writer errors, and v2/v3 reading.

Acceptance requires a provider-free eval to verify an intermediate file version, send a revision only when allowed by `failfast`, verify its final version, and leave a report whose step outcomes and overall pass/fail agree with the observed events. CLI and dashboard must show and gate the same result. No acceptance test may require model judge execution or claim shared-Worker safety.

## Drawbacks

- Keeping a session alive while arbitrary evaluator code runs adds latency and can expose more opportunities for hangs until separate timeout/cancellation work lands.
- Two scoring moments (checkpoints and final scorers) require explicit aggregation, partial-scoring rules, and clear UI distinctions.
- Turn attribution depends on adapters honoring the `send()` completion contract and emitting truthful tool events; incomplete adapter evidence can fail a check even if an external tool actually ran. Normalized projections are only as complete as the adapter's instrumentation.
- A report schema version increase and dual-version readers add maintenance and migration work.
- Failfast suppresses later observations; a run may provide less debugging evidence than an otherwise identical run with `failfast: false`.

## Rationale and alternatives

### Proposed design

Explicit ordered checkpoints fit the existing session protocol and incremental trajectory writer. The authored transcript controls when verification happens; the observed trajectory remains evidence rather than a script. Eval-level `failfast` expresses one consistent policy for all checkpoint kinds, while final scoring remains useful for full-trial judgments. Separate checkpoint records preserve the meaning of existing final-scorer results and `overall`. The linear scenario is intentionally limited; unusual branching can remain in project-owned orchestration or adapters rather than turning `transcript` into a general-purpose programming language. Such custom runners do not automatically inherit CLI/dashboard reporting or lifecycle guarantees.

### Simpler or narrower approach

Keep authoring `transcript` as user messages only and put every check in a final `predicate(...)`, or write a project-local `src/run.ts` that drives a custom AUT session and verifies between prompts. This avoids changing report schemas, but cannot capture intermediate file states after subsequent edits, cannot stop the stock runner's next prompt on a failed assertion, and leaves CLI/dashboard-launched runs with different behavior.

### Other alternatives considered

- **Overload `predicate(name, (message, context) => ...)` inside `transcript`:** convenient shorthand, but it gives the existing post-session `predicate(name, ({ trajectory, artifacts, context }) => ...)` two callback contracts depending on placement. Use `check(...)` for the checkpoint and keep `predicate(...)` for final scoring; both may share score normalization internally.
- **Use `trajectory: [...]` as the authored field:** mirrors an example's syntax, but confuses instructions with the append-only recorded trajectory and forces a rename of existing evals. Retain `transcript`; reconsider a `steps` alias in a separate API cleanup.
- **Treat `toolCall(...)` as an action:** conflates an assertion with runner-initiated tool activity. Use `expectToolCall(...)`; tool/result injection would need a separate explicit action and ownership contract.
- **Put checkpoints in `scoring` with `afterStep` indices:** minimizes new step variants but separates the ordering of actions and checks in source and makes multiple checks and failfast behavior harder to read.
- **Run final scorers after every user step:** repeats expensive work, loses explicit checkpoint scope, and may grade incomplete files inadvertently.

### Do nothing

Consumers needing intermediate verification keep custom orchestrators and private completion-event payloads. Final-state predicates remain useful, but cannot prove or gate the state between prompts; stock CLI/dashboard workflows cannot express these scenarios faithfully.

## Prior art

[RFD0001](./RFD0001-evalkit-core-execution-and-reporting.md) introduced the session protocol, transcript shorthands, normalized events, incremental trial reports, and partial-scoring concept. It explicitly deferred the meaning of `agent(...)` and inline `judge(...)`; this proposal resolves only deterministic checkpoint semantics rather than pretending the old declared judge step already works. The current implementation in `packages/core/src/index.ts`, `packages/runner/src/index.ts`, and `packages/core/src/schema.ts` is authoritative where the initial RFD's examples differ from today's code.

[RFD0003](./RFD0003-canonical-resource-identifiers-and-trial-navigation.md) established that the trial owns its timeline and scores rather than making the trajectory a separate navigated resource. This proposal retains that ownership: authored checks produce additional **trial** evidence, not a new top-level trajectory resource. RFD0003's older authored-URI examples have since been superseded by the current human-authored `id` contract; this proposal does not revisit identity.

[vitest-evals](https://github.com/getsentry/vitest-evals/blob/main/packages/vitest-evals/README.md) executes an explicit harness `run(input)` once and lets assertions and judges consume its normalized session and application-facing output. Its [architecture](https://github.com/getsentry/vitest-evals/blob/main/docs/architecture.md) offers typed message/tool projections, separate judge harnesses and usage, and a shared report-artifact reader. Evalkit adopts the lesson of reusable observed evidence and projections, **not** an inferred domain output or the assumption that Vitest's test lifecycle is available to CLI/dashboard runs.

[Inspect AI solvers](https://github.com/UKGovernmentBEIS/inspect_ai/blob/main/docs/solvers.qmd) compose ordered actions, support [intermediate scoring](https://github.com/UKGovernmentBEIS/inspect_ai/blob/main/docs/solvers.qmd#intermediate-scoring), and can end a task early. This is direct precedent for interleaving checks and further prompts. Evalkit chooses an explicit eval-level failfast policy rather than giving every checkpoint unrestricted control of shared task state.

[Pydantic Evals](https://github.com/pydantic/pydantic-ai/blob/main/docs/evals/core-concepts.md) separates assertions, numeric scores, execution failures, and experiment-wide analyses. Its [agentic evaluators](https://github.com/pydantic/pydantic-ai/blob/main/docs/evals/evaluators/agentic.md) make tool-order, duplicate-call, argument, failed-attempt, and instrumentation-coverage choices explicit. Its [per-case lifecycle hooks](https://github.com/pydantic/pydantic-ai/blob/main/docs/evals/how-to/lifecycle.md) are useful for cleanup but cannot alone protect a process-wide guard shared across trials. These lessons motivate the outcome taxonomy and narrow tool-match contract without expanding the first slice to every matching mode.

[DeepEval](https://github.com/confident-ai/deepeval/blob/main/README.md) applies deterministic and model-graded metrics to captured agent trajectories with explicit thresholds. Its broader metric catalog is not a prerequisite for Evalkit's first deterministic checkpoints; model-graded inline checks need a separately specified provider and cost contract.

## Unresolved questions

### Decisions in the first implementation

- Only final predicates declaring `supportsPartial: true` run after failfast; all others appear in `skippedScorers`.
- `expectToolCall` uses exact JSON argument equality, with no arguments constraint when omitted. Partial matching and proof of successful tool execution remain deferred.
- Turn projections are derived from AUT events captured during the preceding send, not from report text. A checkpoint gets a `checkpoint-completed` event with `passed` or `failed` status, or a `checkpoint-error` event; remaining authored steps get skip events.
- Checkpoint results live in `scoring.checkpoints`, separate from final `scoring.results`, and the dashboard shows them separately.

### Still open for review

- Whether a separate checkpoint-stop opt-in for final scorers should eventually supersede `supportsPartial`.
- Ordering/repeated-call selection and normalized successful-tool-result semantics, after adapter instrumentation is specified.

### Out of scope

- Model judge provider selection, rubric validation, and judge cost policy.
- Branching scenarios, tool-result injection, guaranteed termination, and external evaluator timeouts.
- Shared-Worker egress lifecycle, retry classification, and independent cell/trial concurrency controls.

## Future possibilities

A separately specified model-backed `judge(...)` could reuse the checkpoint result and failfast contract. It should configure its judge model separately from the AUT, consume the already recorded turn rather than rerunning the AUT, and record judge usage/cost independently when available. A future adapter contract could expose typed domain output separately from normalized session evidence; it must not infer that output from the last assistant text. Later proposals may add branches, explicit acceptance/verification actions, aggregate measurements, or enforced deadlines. These are not required to accept deterministic checkpoints and do not remove the need for a safe operation-wide lifecycle around shared resources.
