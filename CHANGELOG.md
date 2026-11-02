# Changelog

All notable changes to `@leostera/evalkit`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Before 1.0, a minor version may include breaking changes; they are marked **Breaking**.

## [0.9.0] - 2026-11-02

A run is one execution now: `repeat` starts several as a batch, and `evalkit upgrade` converts older results. Also attachments, typed checkpoint lookups, Markdown replies, one definition of `tokens`, and a share server that can live below a path on your own site and show a single repository.

### Breaking: runs without trials

A **run** is now one execution of a scenario: one agent session in one sandbox, scored. The level above it, a run of trials, is gone ([RFD0008](https://github.com/leostera/evalkit/blob/main/docs/rfds/RFD0008-runs-without-trials.md)). Most runs had a single trial, so their pages had one row to click through, and Runs and Trials listed the same thing twice.

- **`repeat` replaces `policy.trials`.** `repeat: 3` on a scenario, `-n, --repeat 3` (was `--trials`) and `execution.repeat` (was `execution.trials`) start three ordinary runs that share a **batch**: `batch: { id, index, size }` in their manifests. A config or scenario that still sets the old option fails with a message naming the new one.
- **Statuses.** A finished run is `passed`, `failed` (it finished, but a score or checkpoint did not pass), `errored` (it could not finish) or `cancelled`. Old `completed` became `passed` or `failed`, and old `failed` became `errored`.
- **Report schema version 6.** A run's directory holds `manifest.json`, `catalog.json`, `trajectory.jsonl`, `scoring.json`, `summary.json` and `artifacts/` directly, with no `trials/`. The summary is the old trial summary. Readers accept version 6 only; `evalkit upgrade` converts older results.
- **API.** `runEval` resolves to `RunResult[]`, one per run. `readTrialManifest`, `readTrialSummary`, `readTrialScoring` and `readTrialEvents` are `readRunManifest`, `readRunSummary`, `readRunScoring` and `readRunEvents(root, runId)`. `trialWorkspacePath` is `runWorkspacePath`, `maxTrialBytes` is `maxRunBytes`, and the schemas are `RunManifestSchema`, `RunSummarySchema`, `RunScoringSchema`, `BatchSchema` and `RunDatasetSchema`. The adapter, scoring and dataset contexts have an optional `batch` instead of `trialId` and `trialIndex`, as does a computed `user()` message. `runMatrix` resolves to `{ cells, runs, passed, failed, cancelled }` and `onResult(cell, runs)`. The `evalkit:trial:` URI kind and the `trial-started` and `trial-completed` events (now `run-started` and `run-completed`) are gone; `AggregateScoring` and `TrialResult` are removed.
- **Counting.** The CLI summary, JUnit (one testcase per run, `#2` for a batch's second), `evalkit compare` (a cell is compared by its latest batch's pass rate), the scoreboard and Compare count runs.
- **Dashboard.** A run's page is the old trial page: its trajectory beside what it ran (scenario, agent, parameters, commit, batch) and how it scored. The Trials page is gone; a batch shows as `2/3` beside a run's ID in the Runs list, which filters the list to it (`/runs?batch=<id>`). Run and trial links from before 0.9 still lead to the same run, or to the batch for a run of several trials.
- **Snapshots and the share server.** `evalkit build` and `evalkit share` write snapshot format version 2 (`runs/<id>/detail.json`, `events.json`, `workspace/` and so on). The share server converts uploads from older CLIs as they arrive, and `POST /api/v1/upgrade` converts the runs it already stores.

### Migrating from 0.8

1. Rename `policy: { trials: n }` to `repeat: n`, `execution.trials` to `execution.repeat`, and `--trials` to `--repeat` in scripts and CI.
2. Run `bun run evalkit upgrade` in each eval project (`--dry-run` first to see what it would change). An old run of one trial keeps its ID; an old run of several becomes runs with the trials' IDs, in a batch with the old run's ID. Either way, old run and trial links keep working. It only reads the config, is safe to interrupt and run again, and leaves runs that are still running for later.
3. In code, handle `runEval`'s array of runs, the new statuses and the renamed readers above; `status === 'passed'` replaces `status === 'completed' && scoring.passed`.
4. If you host a share server, redeploy it, then call `POST /api/v1/upgrade` until `remaining` is 0. Until a stored run is converted it is not shown.

### Added

- **Selecting a slice in one line.** `-m` and `-s` combine: `evalkit run -m models -s testing -a model=luna -a toolchain=riot` runs the testing suite's scenarios on Luna with Riot. `-s` alone narrows the config's matrix the same way, eval IDs (as arguments or `-e`) narrow further, and selections that cannot be met are errors. `--select` has a short form, `-a` (for axis), and takes comma-separated values: `-a model=luna,kimi`.
- **Built-in metric names are typed.** `BuiltInMetricName` is `'agent time' | 'tokens' | 'tool calls'`, `MetricResult.name` suggests them, and `metric('tokens', ...)` is a type error. The docs define each one precisely.
- `Usage.cachedInputTokens`: how many of a turn's input tokens came from a prompt cache, shown on the run page. `turnTokens(usage)` computes what a turn counts toward `tokens`.
- **Typed checkpoint lookups.** `checkpoint(rule)` on the scoring context returns a checkpoint's latest result by the rule itself, not its name, with the predicate's evidence type: `checkpoint(builds)?.evidence?.stdout`. Renaming the check cannot break it, and a rule outside the transcript throws instead of reading as "not run".
- **Attachments.** Adapters get `attach(name, content)` in `start()`, and scorers and checkpoints on their context, to save files such as the agent's raw log with the run's results. They survive when a passing run's sandbox is removed, show on the run page and its new **Attachments** page, and are included by `build` and `share`. Names are checked relative paths; a file over 5 MB keeps its last bytes, and a run's attachments are capped at 20 MB (`artifacts.attachments` sets both).
- **Agent replies render as Markdown** on the run page: headings, lists, code blocks, tables, task lists and links, with single newlines kept. "Source" shows the exact text. Raw HTML is shown as text, links open in a new tab without a referrer, and images are never loaded, only linked.
- `evalkit upgrade [--dry-run]` and `POST /api/v1/upgrade` on the share server; see above.
- **A share server below a path, for one repository.** `basePath` (`BASE_PATH` in the Worker's `vars`, `--base-path` for `share serve`) serves everything below a path such as `/evals`, so the server can be routed into a site's own domain. `repo` (`REPO`, `--repo`) shows only that repository: pages are `/evals/` and `/evals/-/<sha>/runs/…`, there is no list of repositories, and uploads for any other repository are rejected. Set `share.url` to the full address, e.g. `https://example.com/evals`.

### Changed

- **`tokens` has one definition:** each turn's `inputTokens + outputTokens`, with cached input counted as input, and `totalTokens` only when a turn reports neither. Before, a reported `totalTokens` took precedence.
- `-s` with a config matrix records its runs under that matrix's ID, as `-m` does, instead of `default`.
- **Missing metrics are "not measured", never zero.** Runs from before a metric existed, or that recorded nothing for it, stay out of its means, and the dashboard shows how many contributed: "1 of 2 runs" on the scoreboard and in Compare cells, and "not measured" on a run page or when none did.

### Fixed

- **Agent-written files are never rendered.** The local dashboard served candidate workspace and dataset files with a type from their extension, so an `.html` file an agent wrote would open as a page on the dashboard's origin. They are now served as bytes with `nosniff` and a sandboxing CSP, as the share server already did.

## [0.8.0] - 2026-10-31

Shell commands in trajectories read like a terminal, and each scenario can choose what its snapshots leave out.

### Added

- **Per-scenario snapshot ignores.** `defineEval({ workspace: { ignore: [...] } })` adds gitignore-style patterns after the project's `artifacts.exclude`, so each scenario decides what in its workspace is noise. Later patterns win, and `!pattern` keeps a path even inside an ignored directory: `['!_build/doc/**']` saves generated docs and drops the rest of `_build`. Ignored directories are walked only when a `!` pattern could keep something in them. Each trial manifest records the effective list as `workspaceIgnore`.
- **Shell commands as terminals.** On the trial page, a tool call that ran a shell command shows as a small terminal: the command, its output (the last lines first, where errors are, with earlier ones a click away) and stderr in red, with the exit code beside the tool name. Any tool whose arguments have a `command`, `cmd` or `script` qualifies.

## [0.7.0] - 2026-10-31

Metrics, computed prompts, comparing runs by parameter, smaller results, and a clearer command line. This release has breaking changes; see [Migrating from 0.6](#migrating-from-06).

### Migrating from 0.6

1. **Environment variables are flags.** Replace `PORT=n evalkit dev` with `evalkit dev -p n`, `EVALKIT_NO_OPEN=1` with `--no-open`, `EVALKIT_LOG_LEVEL=info` with `--log-level info`, and `EVALKIT_SHARE_URL=…` with `share --server …` / `compare --server …` (or `share.url` in the config).
2. **`{{randomSeed}}`** in a user message becomes a function: `user(({ seed }) => `Pick number ${seed}.`)`.
3. **Snapshots and sandboxes.** Trial snapshots no longer include `node_modules`, `.git`, build output and the like, and `_evalkit-sandbox/` keeps only trials that did not pass. If a scorer or your tooling read those, set `artifacts.exclude` or `keepSandboxes: 'all'`.

### Added

- **API reference** on the website: every export with its signature, kept complete by a test. The results guide now says plainly where scores live (`scoring.json`, not the manifests).
- **Compare by parameter.** A scenario page pivots its runs by matrix parameters: one down, optionally one across, showing the pass rate, mean score or any metric. Works in shared snapshots too.
- **Prompts computed per trial.** `user()` takes a function of `{ parameters, data, seed, trialIndex }`, so one scenario can vary its prompt by matrix axis or candidate dataset: `user(({ parameters }) => `Set up OCaml with ${parameters.toolchain}.`)`. `data` holds only candidate datasets. The trajectory records the message each trial was sent.
- **Metrics.** `metric(name, run, { unit, better })` in a scenario's `metrics` records a number for every trial (tokens, retries, mistakes, web searches) without affecting pass or fail. EvalKit also records **agent time**, **tokens** (when the agent reports usage) and **tool calls** for every trial. Metrics are saved in `scoring.json`, shown on trial pages, averaged on run pages, and get a column each on the scoreboard.
- **Scoreboard means.** The scoreboard shows the mean score and each metric's mean over the last 10 runs, coloured green to red when a metric says which direction is better, and its numeric columns sort.
- **Scorers see checkpoint results.** The scoring context has `checkpoints`: the results so far for inline checkpoints, all of them for final scorers. A checkpoint can inspect live state before the session closes and pass what it saw to final scorers in `evidence`.

### Changed

- **Smaller results.** Candidate snapshots leave out dependencies, build output and VCS metadata (`.git`, `node_modules`, `.venv`, `__pycache__`, `_build`, `_opam`, `target`); set `artifacts.exclude` to change the list. Sandboxes in `_evalkit-sandbox/` are kept only for trials that did not pass; set `keepSandboxes: 'all' | 'none'` to change that. `evalkit tidy` removes the sandboxes this setting would not keep, freeing space used by earlier versions.
- `evalkit dev` and `evalkit share serve` use the next free port when their default (4317, 4318) is taken, and print the one they chose, so several projects can run at once.
- **A clearer command line.** Every command and flag has a description in `--help`, with examples; common flags have short forms (`-c`, `-e`, `-s`, `-m`, `-n`, `-j`, `-v`, `-p`, `-o`, `-b`, `-d`); `--opt=value` works; a mistyped command suggests the right one (`Did you mean run?`); and `evalkit help <command>` works.
- **Breaking:** settings that were environment variables are flags: `dev --port <n>` (`-p`, used exactly) replaces `PORT`, `dev --no-open` replaces `EVALKIT_NO_OPEN=1`, `--log-level <level>` on `run`, `dev` and `build` replaces `EVALKIT_LOG_LEVEL`, and `share --server <url>` / `compare --server <url>` replace `EVALKIT_SHARE_URL`. `EVALKIT_SOURCE_*` (commit provenance outside GitHub and GitLab CI) and `EVALKIT_RUNTIME` stay environment variables.
- **Breaking:** the `{{randomSeed}}` placeholder in user messages is removed; use `user(({ seed }) => `... ${seed} ...`)`.

### Fixed

- A symbolic link or special file in the candidate workspace no longer fails the trial's snapshot; it is skipped, never followed.
- `evalkit dev` honours `sandboxDir` for runs started from the dashboard.
- `evalkit new` accepts any directory, such as `./ocaml.ai` or a nested path; the package name is made npm-safe (`ocaml-ai`).
- `run --dry-run` lists the scenarios a matrix will run instead of `"evals": []`.
- An empty scenario file reports `scenarios/x.eval.ts is empty` instead of a missing default export.

## [0.6.1] - 2026-10-30

Readable trajectories on the trial page.

### Added

- **Readable trajectories.** The trial page shows the trajectory as a conversation grouped by turn: the user's message, tool calls paired with their results (arguments and results expand), replies as text, and each checkpoint as one verdict with its duration. Lifecycle events are folded away; **All events** lists every raw event, each expandable to its JSON. Turns show latency and token usage when the agent reports them.
- The runner records each user step's message on its `transcript-step-started` event (`message`), so trajectories include what the agent was asked.

## [0.6.0] - 2026-10-30

Scenarios, datasets and CI reporting ([RFD0007](docs/rfds/RFD0007-scenarios-datasets-and-ci-reporting.md)). This release has breaking changes; see [Migrating from 0.5](#migrating-from-05) below.

### Added

- **Datasets.** `defineDataset({ ... })` declares named data that scenarios use: files placed in each trial's workspace, a value for the agent (`context.data[id]`) and scorers (`data[id]`), or both. Static datasets give `files` (a directory or a map of paths), `value` or `valueFile` (`.json`, or `.jsonl` as an array). Computed datasets give `onLoad`, called once per process and cached, and optionally `onRun` to derive each trial's copy. `visibility: 'evaluator'` keeps a dataset from the agent. Each trial records a digest of every dataset it used.
- **Directory suites.** Each directory directly below `scenarios/` is a suite, with no registry. `discovery.suites: false` turns this off.
- **Simpler agents.** `send()` may return the turn's result (a reply string, or `{ reply, toolCalls, usage }`) instead of emitting events. Lifecycle events are optional, `close()` is optional, `runtimes` defaults to in-process, and `identity.name` defaults to `identity.id`.
- **Scoring helpers.** The scoring context has `output` (the final assistant message) and `data`. `predicate(name, run, { passAt })` passes numeric scores at a threshold. A scorer may return `skip(reason)`: it is recorded, neither passes nor fails, and is left out of averages.
- **Plain values at the boundary.** Event content, turn results, metadata, evidence and dataset values accept ordinary objects and are converted to JSON once, with errors naming the bad field (`data.accounts[3].created: bigint is not JSON`). `toJson` is exported.
- **Isolated loading.** An eval file that throws when imported becomes a load error for that file only. `run` fails when it selects a broken file unless `--skip-broken`; `--dry-run`, `build`, `dev`, `tidy` and `share` warn and continue, and the dashboard shows the error.
- **CI output.** `evalkit run` shows live progress, quieter result lines and one final summary. `--junit <file>` writes a JUnit report with one test case per scenario and matrix cell. Ctrl+C cancels cleanly: trials stop, runs are saved as `cancelled`, and a second Ctrl+C exits at once.
- **`evalkit compare`** compares a commit's results with a base (`--base <ref>` from the share server, or `--base-dir <dir>`): regressed, fixed, new, removed and unchanged scenarios, score changes per suite, and changed datasets. `--markdown <file>` writes a merge request comment, `--json` prints JSON, `--fail-on regression` or `--fail-on score-drop=0.05` gates CI, and `--require-base` fails without a base.
- **Dashboard.**
  - Two groups. **Evals** has a colour-coded Scoreboard (latest result, score, last ten runs and pass rate per scenario and matrix cell), and Runs, Trials and Workspaces, which share one set of filters kept in the URL. **Library** has Agents, Judges, Scenarios and Datasets, each with a page showing how it is defined, the file and line it is defined at, and which scenarios use it.
  - The header shows the repository and commit being viewed.
  - Run, trial and workspace pages have stable URLs and breadcrumbs; trials show the trajectory first.
  - A file explorer browses trial workspaces and static dataset files.
  - Runs show their commit and a **dirty** label; cancelled runs have their own status.
  - Wide matrices stay readable: only parameters that differ get columns, and long filters have a search.
- **Node.** The CLI runs on Node 22.18 or later as well as Bun. The bin prefers Bun when it is installed; `EVALKIT_RUNTIME` picks one.
- The published type declarations are readable per entry point, and the EvalKit skills ship in the package under `dist/skills`.

### Changed

- **Breaking:** scenarios live in `scenarios/` instead of `evals/`, and `evalkit new` scaffolds `scenarios/` and `datasets/`.
- **Breaking:** `fixtures` and its helpers (`directory`, `file`, `inlineFile`, `dynamic`) are removed; use datasets.
- **Breaking:** report schema version 5 records datasets, the owning process and skipped scores. Readers still accept versions 2 to 4. A run left `running` by a process that is gone is shown as cancelled (interrupted). `share` never uploads cancelled runs.
- **Breaking:** dashboard URLs changed with no redirects: `/scoreboard`, `/runs`, `/trials`, `/workspaces`, `/runs/:id/trials/:id[/workspace]` and `/library/{agents,judges,scenarios,datasets}/:id`. Old links (`/suites`, `/evals`, `/scenarios`, `/agents`, `?trial=`) land on the scoreboard.
- `execution.maxCells` limits matrix expansion only; a plain selection of scenarios is never refused for its size.

### Migrating from 0.5

1. **Move `evals/` to `scenarios/`.** EvalKit stops with a hint if it finds `evals/` and no `scenarios/`. To keep the old directory, set `testDir: 'evals'` in `evalkit.config.ts`.
2. **Suites.** If your registry only existed to group scenarios into suites, delete it and put each suite's files in a directory (`scenarios/billing/*.eval.ts` is suite `billing`). Directory names must be lowercase kebab-case. Keep an explicit registry if you need full control; it ignores directories.
3. **Fixtures become datasets.** Move `fixtures/` to `datasets/`, define each one with `defineDataset`, and pass `datasets: [...]` instead of `fixtures: [...]`:

   | 0.5                                        | 0.6                                                                           |
   | ------------------------------------------ | ----------------------------------------------------------------------------- |
   | `directory('fixtures/repo')`               | `defineDataset({ id: 'repo', files: 'datasets/repo' })`                       |
   | `file(src, { dst, visibility })`           | `defineDataset({ id, visibility, files: { [dst]: { file: src } } })`          |
   | `inlineFile('notes.md', text, visibility)` | `defineDataset({ id, visibility, files: { 'notes.md': text } })`              |
   | `dynamic(async (context) => files)`        | `defineDataset({ id, onLoad: () => ({}), onRun: (_, trial) => ({ files }) })` |

   Dataset files are placed below a directory named after the dataset (`repo/…` in the workspace). Set `mount: '.'` to place them at the workspace root as fixtures did, or update the paths your agent and scorers read.

4. **Expected answers.** Data your scorers need (labels, expected values) that lived in `metadata` or module constants can move to an evaluator dataset's `value` and be read as `data[id]` on the scoring context.
5. **Agents (optional).** Adapters can drop the `started`, `turn-started`, `turn-completed` and `completed` events and return the reply from `send()`. Existing adapters keep working.
6. **Scorers (optional).** Replace searching the trajectory for the last assistant message with `output`, wrapping numeric scores in thresholds with `passAt`, and fake "not applicable" passes with `skip(reason)`. Drop `JSON.parse(JSON.stringify(x)) as JsonValue` casts.
7. **CI.** Add `--junit evalkit-junit.xml` to `evalkit run` and publish it as a test report. To gate merge requests, run `evalkit compare --base main --fail-on regression`.
8. **Bookmarks.** Update saved dashboard links to the new URLs above.

## [0.5.0] - 2026-10-28

### Added

- `share.headers` in `evalkit.config.ts`: extra headers for every request to the share server, for an auth proxy such as Cloudflare Access in front of it. It can be an object or a function (sync or async), is called once per `evalkit share`, and its values are never printed.
- `evalkit share` checks the server before uploading, in a new Server step.

### Fixed

- `evalkit share` no longer follows redirects or treats an HTML page as a successful upload. A redirect (for example to a login page), a 401 or 403, or a non-JSON answer stops sharing with an error naming the cause, instead of `JSON Parse error: Unrecognized token '<'` for every run.

## [0.4.0] - 2026-10-28

Commit provenance and team sharing ([RFD0006](docs/rfds/RFD0006-commit-provenance-and-share-server.md)).

### Added

- Every run records where it came from in `manifest.json` (report schema version 4): the repository, the eval project's path inside it, the commit, the branch, whether there were uncommitted changes, and the CI job. It is read from `EVALKIT_SOURCE_*` variables, then GitLab or GitHub CI, then git. `evalkit run` prints it.
- Each run saves the eval catalog it ran with as `catalog.json`.
- `evalkit share` uploads the current commit's finished runs to your team's share server and prints their URL. Runs made with uncommitted changes need `--allow-dirty` and are labelled. `--all` includes other commits, and `--no-workspace` leaves out candidate file contents. Uploads retry on server errors, and uploading a run twice does nothing.
- `share: { url }` in `evalkit.config.ts`, or `EVALKIT_SHARE_URL`, names the server.
- The share server: a small Worker serving a JSON API and the dashboard. Files are stored in R2 and an index of repositories, commits and runs in a SQLite Durable Object, which `POST /api/v1/reindex` can rebuild. It is exported as `@leostera/evalkit/share/worker`, a `wrangler.jsonc` template is in the docs, and it logs structured `share.*` events. It has no authentication: run it on a private network.
- `evalkit share serve` runs the same server locally with Bun, storing everything in `_evalkit-share/`.
- The dashboard on a share server lists repositories at `/`, opens `/<repo>` at its latest commit, resolves branches and short SHAs to full commits, and has a version picker to switch between commits.

### Changed

- **Breaking:** generated projects no longer add script aliases (`evals`, `matrix`, `matrix:plan`, `dashboard`, `dashboard:build`). Run every command as `bun run evalkit <command>`, for example `bun run evalkit run` or `bun run evalkit dev`. Existing projects keep their scripts. The example projects dropped their aliases too.
- `evalkit build` and `evalkit share` use the same per-run snapshot writer.
- Generated projects ignore `_evalkit-share/`.

## [0.3.0] - 2026-10-28

### Added

- `evalkit tidy` archives runs of evals that are no longer in the project, including evals that only exist in a matrix, by writing `archived.json`. It restores runs when their eval comes back and never deletes reports. Archived runs are hidden in the dashboard ("Show archived") and left out of `evalkit build`.
- `evalkit build` asks whether to run the evals first, and runs them without asking when there are no results. `--run` and `--no-run` skip the question. Without a terminal, it keeps existing results.
- `evalkit build` and `evalkit dev` show timed steps, live progress, output size, and a log of each run launched from the dashboard. `EVALKIT_LOG_LEVEL` restores the runner's info logs.
- Dashboard: suite and eval rows link to their agent and to their runs. The runs filter has a search and a button to clear every filter.

### Changed

- **Breaking:** static snapshots use clean path URLs instead of hash routing: one page per route with a relative `<base href>`, so reloads work at any mount path without rewrite rules.
- Reports from older EvalKit versions (schema version below 2) are skipped and counted instead of breaking the run list.
- A busy `evalkit dev` port gives an actionable error.

## [0.2.0] - 2026-10-28

### Added

- `evalkit dev` starts the local dashboard and run launcher.
- `evalkit build [--out dir]` writes a read-only static dashboard snapshot to `_evalkit-dashboard/`. It holds the UI, report JSON and candidate files, never evaluator workspaces, and it refuses to overwrite a directory it didn't create.
- The dashboard's Vite dev server proxies `/v1` to a running `evalkit dev`, for working on the UI.

### Changed

- **Breaking:** one `evalkit run` command: `evalkit run [ids]`, `--suite <id>` or `--matrix <id>`. It replaces `run-evals`, `run-suite` and `run-matrix`, and `evalkit dev` replaces `serve-dashboard`. The old commands were removed with no aliases.
- Skills and manual: corrected step kinds, judge adapters and `piAgent` tool limits, and added guidance on tool-assisted agents and baseline ablations.

## [0.1.0] - 2026-10-28

### Added

- Dashboard rebuilt on Cloudflare's Kumo components and Tailwind 4, keeping routes, deep links and URL filters. It has a collapsible sidebar, dense sortable tables, status badges that keep errored distinct from failed, and a trial panel with checkpoints, scores and events.
- `@evalkit/core/canonical-json` exposes canonical parameter JSON without Effect, so the browser bundle no longer includes the Effect schemas.

### Changed

- The website moved to `sites/evalkit.leostera.dev`, with a redesigned homepage.
- `@cloudflare` packages resolve from public npm.

## [0.0.2] - 2026-10-05

### Added

- Constrained matrix planning, with eligible cells shown in the dashboard.
- Historical parameter facets in the Runs workspace.

### Changed

- **Breaking:** the npm package moved to `@leostera/evalkit`. Replace the `@leostera-js/evalkit` dependency and update imports, including `/runner`. Eval definitions and local reports are unchanged.
- Dashboard workflow refinements.

[0.9.0]: https://github.com/leostera/evalkit/compare/2c62b85...main
[0.8.0]: https://github.com/leostera/evalkit/compare/7e8c3e5...2c62b85
[0.7.0]: https://github.com/leostera/evalkit/compare/1ca784e...7e8c3e5
[0.6.1]: https://github.com/leostera/evalkit/compare/91c2c86...1ca784e
[0.6.0]: https://github.com/leostera/evalkit/compare/99008d5...91c2c86
[0.5.0]: https://github.com/leostera/evalkit/compare/49ad689...99008d5
[0.4.0]: https://github.com/leostera/evalkit/compare/175bfcd...49ad689
[0.3.0]: https://github.com/leostera/evalkit/compare/d45b221...175bfcd
[0.2.0]: https://github.com/leostera/evalkit/compare/49471c3...d45b221
[0.1.0]: https://github.com/leostera/evalkit/compare/b03233b...49471c3
[0.0.2]: https://github.com/leostera/evalkit/compare/f13f20b...b03233b
