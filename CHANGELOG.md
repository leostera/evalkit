# Changelog

All notable changes to `@leostera/evalkit`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Before 1.0, a minor version may include breaking changes; they are marked **Breaking**.

## [Unreleased]

### Added

- **Prompts computed per trial.** `user()` takes a function of `{ parameters, data, seed, trialIndex }`, so one scenario can vary its prompt by matrix axis or candidate dataset: `user(({ parameters }) => `Set up OCaml with ${parameters.toolchain}.`)`. `data` holds only candidate datasets. The trajectory records the message each trial was sent.

### Changed

- **Breaking:** the `{{randomSeed}}` placeholder in user messages is removed; use `user(({ seed }) => `... ${seed} ...`)`.

- `evalkit dev` and `evalkit share serve` use the next free port when their default (4317, 4318) is taken, and print the one they chose, so several projects can run at once.
- **A clearer command line.** Every command and flag has a description in `--help`, with examples; common flags have short forms (`-c`, `-e`, `-s`, `-m`, `-n`, `-j`, `-v`, `-p`, `-o`, `-b`, `-d`); `--opt=value` works; a mistyped command suggests the right one (`Did you mean run?`); and `evalkit help <command>` works.
- **Breaking:** settings that were environment variables are flags: `dev --port <n>` (`-p`, used exactly) replaces `PORT`, `dev --no-open` replaces `EVALKIT_NO_OPEN=1`, `--log-level <level>` on `run`, `dev` and `build` replaces `EVALKIT_LOG_LEVEL`, and `share --server <url>` / `compare --server <url>` replace `EVALKIT_SHARE_URL`. `EVALKIT_SOURCE_*` (commit provenance outside GitHub and GitLab CI) and `EVALKIT_RUNTIME` stay environment variables.

### Fixed

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

[Unreleased]: https://github.com/leostera/evalkit/compare/1ca784e...main
[0.6.1]: https://github.com/leostera/evalkit/compare/91c2c86...1ca784e
[0.6.0]: https://github.com/leostera/evalkit/compare/99008d5...91c2c86
[0.5.0]: https://github.com/leostera/evalkit/compare/49ad689...99008d5
[0.4.0]: https://github.com/leostera/evalkit/compare/175bfcd...49ad689
[0.3.0]: https://github.com/leostera/evalkit/compare/d45b221...175bfcd
[0.2.0]: https://github.com/leostera/evalkit/compare/49471c3...d45b221
[0.1.0]: https://github.com/leostera/evalkit/compare/b03233b...49471c3
[0.0.2]: https://github.com/leostera/evalkit/compare/f13f20b...b03233b
