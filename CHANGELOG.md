# Changelog

All notable changes to `@leostera/evalkit`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Before 1.0, a minor version may include breaking changes; they are marked **Breaking**.

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

[0.5.0]: https://github.com/leostera/evalkit/compare/0dd8717...main
[0.4.0]: https://github.com/leostera/evalkit/compare/5e67e72...0dd8717
[0.3.0]: https://github.com/leostera/evalkit/compare/38c34be...5e67e72
[0.2.0]: https://github.com/leostera/evalkit/compare/3f8855a...38c34be
[0.1.0]: https://github.com/leostera/evalkit/compare/12d5a1e...3f8855a
[0.0.2]: https://github.com/leostera/evalkit/compare/0016e72...12d5a1e
