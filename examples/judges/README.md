# Judges

Three ways to grade an agent, all provider-free:

- **`chat/`**: a chat assistant graded by a `choices` judge (Correctness: A, B or C, passing at B) and a `criteria` judge (Tone: three weighted criteria), next to a predicate that checks for a docs link.
- **`apps/`**: a coding agent that builds a versioned notes service, checked by one predicate that reads the service's store once and reports three declared checks, each with what it saw as `evidence`. It attaches what it read, next to its verdict.

```sh
bun run evalkit run          # tiny, small and large agent models, all judged by judge-large
bun run evalkit run --dry-run  # what each scorer checks, and its pass mark
bun run evalkit dev          # open a failed run and expand a verdict
```

`agents/rules-judge.ts` is the project's judge (`judge` in `evalkit.config.ts`). A real judge agent sends EvalKit's prompt to a model; this one answers with fixed rules, so the example runs without credentials. It reports the model the matrix cell chose (`judgeModel`), and EvalKit records it with each verdict, apart from the agent's own model and tokens.

The `small` and `tiny` agent models fail on purpose. `small` recommends purging the whole cache and loses a note's first save; the run pages show why, in the judge's words or each check's evidence. `tiny` builds nothing, so no check is reached, and the cause is said once.
