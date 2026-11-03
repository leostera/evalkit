---
title: Datasets
description: Give scenarios files and values, keep expected answers from the agent, and cache expensive inputs.
---

A dataset is named data that scenarios use: files placed in each run's workspace, a value given to the agent and scorers, or both. Define each one once, by convention in `datasets/`, and import it from the scenarios that need it. Nothing is discovered from `datasets/`, so a broken dataset only affects the scenarios that import it.

```ts
// datasets/help-center.dataset.ts
import { defineDataset } from '@leostera/evalkit';

export const helpCenter = defineDataset({
  id: 'help-center',
  files: 'datasets/help-center', // copied to help-center/ in the workspace
});

export const answers = defineDataset({
  id: 'answers',
  visibility: 'evaluator', // only scorers see it
  valueFile: 'datasets/answers.jsonl',
});
```

```ts
// scenarios/refund-policy.eval.ts
export default defineEval({
  id: 'refund-policy',
  agent: supportAgent,
  datasets: [helpCenter, answers],
  transcript: [user('How long do I have to ask for a refund?')],
  scoring: [matchesAnswer],
});
```

A scenario may use each dataset once, and dataset IDs are lowercase kebab-case.

## Static datasets

Static datasets declare their content in the definition. Give `files`, a value, or both:

| Field       | Content                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`     | A directory relative to the project root (`'datasets/repo'`), or a map from workspace path to content: a string, bytes, or `{ file: 'path/to/source' }`. |
| `value`     | Any JSON-convertible value, inline.                                                                                                                      |
| `valueFile` | A `.json` file, or a `.jsonl` file read as an array with one object per line (blank lines ignored). Errors name the file and line.                       |

```ts
defineDataset({
  id: 'notes',
  files: {
    'notes.md': '# Notes for the agent',
    'logo.png': { file: 'assets/logo.png' },
  },
  value: { customer: 'Ada', plan: 'pro' },
});
```

## Computed datasets

When inputs are expensive to build (fetched, generated, or read from a large source), give `onLoad` instead of the static fields. It returns `{ files?, value? }` and is called the first time a run needs the dataset in this process, never at import. Its result is cached: every scenario, matrix cell and run of one `evalkit run` shares one load, and `evalkit dev` reuses it until the project reloads. A failed load is not cached; the runs that needed it fail with the error in their reports, and the next run retries.

`onRun` derives each run's copy from the loaded content, for example to choose a case by the run's seed or the matrix cell's parameters:

```ts
export const tickets = defineDataset({
  id: 'tickets',
  async onLoad({ root, signal }) {
    const response = await fetch('https://example.com/tickets.json', {
      signal,
    });
    return { value: await response.json() };
  },
  onRun(loaded, { seed, parameters }) {
    const all = loaded.value as Array<{ id: string; text: string }>;
    const ticket = all[seed % all.length]!;
    return {
      value: { ...ticket, language: parameters.language ?? 'en' },
      files: { 'ticket.txt': ticket.text },
    };
  },
});
```

The run context has `evalId`, `runId`, `batch` (when the run is one of several repeats), a per-run `seed`, the cell's `parameters` (or `{}`), and an abort `signal`. Without `onRun`, every run gets the loaded content as is.

## Who sees what

Each run gets two separate workspaces:

- **Candidate** (`context.workspace.root` in the agent, `artifacts.candidate.root` in scorers): files the agent can read and change. Candidate datasets (the default) write their files here, and their values are `context.data[id]` in the agent.
- **Evaluator** (`context.evaluatorWorkspace.root`, `artifacts.evaluator.root`): private inputs for trusted scorers, such as expected answers. `visibility: 'evaluator'` datasets write their files here, and their values are only available to scorers.

Scorers see every dataset's value as `data[id]` on the scoring context.

These are directory conventions, **not** a security sandbox. A trusted adapter can read both; never pass evaluator paths or contents to a model. The CLI keeps both workspaces of a run that did not pass for debugging, so keep that directory private too. Workspaces live outside the project, but every run of a project shares one parent directory, so an agent that walks up from its workspace can still reach other runs and its own evaluator files. Real confinement is the adapter's job: run the agent in a container or an OS sandbox.

## Paths and mounts

A dataset's files go below a directory named after its ID: `help-center` writes `help-center/…` in the workspace. Set `mount` to choose another directory, or `mount: '.'` for the workspace root. Paths may not escape the mount, and two datasets in one scenario may not write the same file. `{ file }` sources and directories resolve from the project root, not from the dataset's file.

Each run's files are written fresh before the agent starts, so edits made in one run never become another run's starting state. The CLI uses `$TMPDIR/evalkit/<project>-<hash>/`<run-uuid>/{candidate,evaluator}/, outside the project, and keeps it after a run that did not pass. A low-level `runEval(...)` call without a persistent `workspaceRoot` uses an OS temporary workspace that is removed afterwards.

## Digests

Each run's manifest records, per dataset, its visibility, whether it is static or computed, and a SHA-256 digest of the content that run got (file paths and bytes, and the canonical JSON of its value). `evalkit compare` uses them to say which datasets changed between two commits, so a score change can be read against changed inputs.

## Reports and sharing

At run end, EvalKit copies **regular files** from the candidate workspace to `<run-id>/artifacts/candidate/`, leaving out the project's `artifacts.exclude` (dependencies, build output and VCS metadata by default). That snapshot is taken after the agent ran, not of the dataset as declared. Symbolic links and unsupported entries in the candidate tree fail the snapshot rather than being followed. What counts as noise depends on the scenario, so a scenario can add its own patterns with `workspace.ignore`. They are read like `.gitignore`: a pattern without `/` matches that name at any depth, later patterns win, and `!pattern` keeps a path. They come after the project's list, so a scenario whose evidence is build output can keep just that, even inside an ignored directory:

```ts
defineEval({
  id: 'build-docs',
  // …
  workspace: { ignore: ['!app/_build/doc/**', '*.log'] },
});
```

An ignored directory is only walked when a `!` pattern could keep something in it, so `node_modules` stays unread. The run manifest records the effective list as `workspaceIgnore`.

Evaluator files are never copied, but their contents can still leak if your adapter emits them in events or writes them into the candidate workspace.

The dashboard's dataset pages show how each dataset is defined, the shape of its value (never the value itself), and a file explorer for static datasets' files. `evalkit build` lists every static dataset's files but copies only candidate datasets' contents. Reports may contain prompts, answers, and user data; [review retention and sharing](/docs/manual/results/#privacy-and-retention) before archiving them.
