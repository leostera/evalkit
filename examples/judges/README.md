# Judges

Three ways to grade an agent, all provider-free:

- **`chat/`**: a chat assistant graded by a `choices` judge (Correctness: A, B or C, passing at B) and a `criteria` judge (Tone: three weighted criteria), next to a predicate that checks for a docs link.
- **`apps/`**: a coding agent that builds a versioned notes service, checked by predicates that return what they saw as `evidence`, so a failure says which save went missing.

```sh
bun run evalkit run          # small and large agent models, both judged by judge-large
bun run evalkit run --dry-run  # what each scorer checks, and its pass mark
bun run evalkit dev          # open a failed run and expand a verdict
```

`agents/rules-judge.ts` is the project's judge (`judge` in `evalkit.config.ts`). A real judge agent sends EvalKit's prompt to a model; this one answers with fixed rules, so the example runs without credentials. It reports the model the matrix cell chose (`judgeModel`), and EvalKit records it with each verdict, apart from the agent's own model and tokens.

The `small` agent model fails on purpose: it recommends purging the whole cache and loses a note's first save. The run pages show why, in the judge's words or the predicate's evidence.
