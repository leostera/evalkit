# Design: EvalKit dashboard

The dashboard is a dense, functional workspace for inspecting eval results. It
is built from [Kumo](https://kumo-ui.com) components (`@cloudflare/kumo`, from
public npm) styled with Kumo's semantic Tailwind tokens. There is no custom
stylesheet beyond `src/app.css`, which loads Kumo's theme before Tailwind.

## Principles

- **Evidence first.** Run identity, status, scores and the trial evidence behind
  them get the space. No invented metrics or decorative summaries.
- **Dense, not cramped.** 13px table text with compact rows; data grids keep one
  line per row and scroll horizontally instead of wrapping or hiding columns.
- **Status is a word.** `StatusBadge` always prints the state; the colored dot
  (success, error, warning, neutral) supports it but never replaces it.
  Execution errors (`errored`) stay visually distinct from scoring failures.
- **Use Kumo, don't restyle it.** Prefer Kumo components and semantic tokens
  (`text-kumo-subtle`, `border-kumo-line`, …). No raw colors.

## Building blocks

Shared pieces live in `src/components/` and should be reused rather than
re-created per view:

| Component                                    | Purpose                                                       |
| -------------------------------------------- | ------------------------------------------------------------- |
| `DashboardShell`                             | Kumo `Sidebar` (collapses to an icon rail; a sheet on phones) |
| `DataTable` / `NestedTable` / `TableMessage` | Dense Kumo tables; nested tables sit inside expanded rows     |
| `SortableHeader`, `useSort`, `useSortedRows` | Sortable column headers with `aria-sort`                      |
| `SearchField`                                | Table search with a visible/total count                       |
| `Pager`                                      | Kumo `Pagination` for client- or server-paged tables          |
| `StatusBadge`                                | Run, trial, checkpoint and scorer status                      |
| `ErrorBanner`, `Empty`, `DetailList`         | Errors, empty states and key/value metadata                   |
| `MatrixCellHeader`                           | Shared header for Cartesian and planner-paged matrix tables   |

Kumo renders links through a `LinkProvider` bound to react-router, so sidebar
and breadcrumb navigation stays client-side.

## Layout

- The shell fills the viewport; the main column scrolls under a sticky header.
- Runs: facet filters (collapsible, closed by default on phones) beside the run
  table. The run ID column is sticky during horizontal scrolling.
- Trial evidence opens in a right-side native `<dialog>` over the run table, so
  the run's URL filters stay in place. Breadcrumbs lead from suite (or Runs)
  through eval, run, trial and candidate workspace; Escape closes the panel.
  Direct `/trials/:id` and `/workspaces/:id` links remain valid.

## Build

`bun run build` forces `NODE_ENV=production`: Vite honors an inherited
`NODE_ENV=development` and would otherwise bundle React's development build.
