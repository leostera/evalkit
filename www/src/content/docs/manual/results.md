---
title: Results and reports
description: Inspect local reports, scores, trajectories, and trial workspaces.
---

The CLI writes v2 manifests with human `evalId`/`suiteId`/matrix IDs and generated run/trial URIs. Older v1 manifests with authored resource URIs are not migrated or listed by the v2 dashboard; their files remain on disk. The CLI writes the following tree under the current project directory:

```text
_evalkit-results/<run-uuid>/
├── manifest.json                # eval/suite/agent identity, start time
├── summary.json                 # run status, trialCount, passed, failed
└── trials/<trial-uuid>/
    ├── manifest.json            # trialIndex (zero-based), identity
    ├── trajectory.jsonl         # one timestamped event per line
    ├── scoring.json             # scorer results, overall, passed
    ├── summary.json             # execution status, scoring, error, artifacts
    └── artifacts/candidate/...  # candidate workspace snapshot, if files exist
```

`_evalkit-sandbox/<trial-uuid>/{candidate,evaluator}/` preserves the actual local workspaces for debugging. Both directories are ignored by Git in this repository's example and can be deleted when no longer needed; apply equivalent ignore/retention rules in your own project. Avoid sharing raw reports or sandboxes before checking for sensitive data in messages and candidate files.

Open the dashboard to navigate suites/evals, start runs, inspect trials and event timelines, see scorer values and candidate files. For automation, read the report files directly (requires `jq`):

```sh
# Replace with an actual run UUID from _evalkit-results/.
RUN="_evalkit-results/<run-uuid>"
jq '{status, trialCount, passed, failed}' "$RUN/summary.json"
jq '{status, scoring, error}' "$RUN"/trials/*/summary.json
jq -r '.results[] | [.name, (.value // "error"), .passed] | @tsv' "$RUN"/trials/*/scoring.json
jq -s 'map(select(.source == "aut" and .kind == "message"))' "$RUN"/trials/*/trajectory.jsonl
```

`scoring.overall` is the **unweighted mean of valid scorer values**, not a pass percentage; it may be absent if no valid score exists. A trial passes only when execution completed **and** all scorers passed without errors. `summary.json` at run level counts passed/failed trials; compare those counts across repeated runs rather than treating `status: "completed"` alone as a pass. The CLI returns a nonzero exit code when any matrix cell fails; use run-level `failed` in `summary.json` for detailed CI gates (for example, `jq -e '.failed == 0 and .trialCount > 0' "$RUN/summary.json"`). A scorer returning zero can leave execution `status: "completed"` while run summary reports a failed trial. Adapters may include usage and latency in `turn-completed` trajectory events; read `trajectory.jsonl` for those details.
