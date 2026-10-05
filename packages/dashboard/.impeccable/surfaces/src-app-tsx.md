---
version: 1
slug: 'src-app-tsx'
primary_target: 'src/App.tsx'
related_targets:
  [
    'src/styles.css',
    'src/components/RunTable.tsx',
    'src/components/TrialPanel.tsx',
  ]
---

# EvalKit dashboard

Mode: Operate. Scope: all dashboard routes; the Runs workspace is the reference surface.
Audience: evaluation authors and developers examining large local run histories. Job: narrow saved runs, compare observed outcomes, inspect trials and evidence, and launch evals. Keep every existing workflow, route, control and reported datum.

## Direction contract

**THESIS** — A working results workspace, not a published-eval gallery or an editorial report. The shell and tables lead; the catalog supports the operating path.
**OWN-WORLD** — Plain black-and-white software workspace: workhorse sans UI, monospace reserved for identifiers and data, white work surface, black navigation, grey separators, textual verdicts distinguished by weight and border. No color-coded dashboard chrome, synthetic brand mark, or ornamental metrics.
**STORY** — Open a saved run, filter by actual persisted dimensions, read the verdict and trial count, then inspect evidence. No fictional comparisons or added metrics.
**FIRST VIEWPORT** — A collapsible navigation rail with an in-rail chevron, a clear title, a filter pane, and a sortable run table with sticky ID and visible status. Desktop lets the table gain width when the rail compresses; mobile keeps the table horizontally scrollable and collapses filters. Selecting a trial reveals its evidence in a right-hand panel over the run context. Suite, eval, run, trial, and workspace breadcrumbs track the investigation without inventing hierarchy for standalone runs. The signature move is preserved context, not an invented visualization.
**FORM** — User-pinned developer-tool operations direction, clarified as high-volume run workspace rather than the Supabase Evals publication layout. Concept-seed key `63a1a48f` ran; the pinned brief overrides its assigned instrument world. Code-led, no generated imagery; existing product routes and content remain.
**FINISH** — unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
