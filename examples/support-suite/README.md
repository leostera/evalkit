# Support suite

A provider-free suite of short, concrete scenarios for a support agent. It is
EvalKit's acceptance suite for [RFD0007](../../docs/rfds/RFD0007-scenarios-datasets-and-ci-reporting.md):
every scenario is one small file, and the agent, judges and datasets are
defined once and shared.

- `scenarios/{billing,shipping,account}/` are suites, from their directories;
  `scenarios/greeting.eval.ts` and `scenarios/unknown-question.eval.ts` have none.
- `datasets/support.dataset.ts` has a static dataset (the help-center articles,
  copied into each workspace), a computed one (customers, loaded once with
  `onLoad` and picked per trial with `onRun`), and an evaluator-only one (the
  escalation policy, which only the scorers see).
- `agents/support-agent.ts` returns its reply and tool calls from `send()`.
- `judges/support.ts` scores the final `output`, the recorded tool calls and
  dataset values; `cites()` returns `skip(...)` when no article applies.
- `evalkit.config.ts` runs everything in two tones, twice each.

```sh
bun run evalkit run --dry-run
bun run evalkit run --suite billing --junit _evalkit-results/junit.xml
bun run evalkit run
bun run evalkit dev
```
