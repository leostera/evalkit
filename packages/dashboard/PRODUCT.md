# EvalKit Dashboard

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers and evaluation authors inspecting agent runs, trial outcomes, scorers, trajectories, and artifacts in a local project.

## Product Purpose

Help users operate evaluation campaigns at scale: launch evals, scan potentially tens of thousands of runs and trials, narrow results by saved parameters, compare outcomes, and inspect the evidence behind each score without mistaking execution status for scoring success.

## Operating Context

The dashboard runs from an EvalKit project through `serve-dashboard`. It reads local reports and catalog definitions. The working views are Suites & Evals, Agents, Fixtures, Runs, Trial detail, and Candidate workspace. Trial evidence and candidate workspace open in a contextual panel from a run, with a URL-preserved investigation path.

## Capabilities and Constraints

Keep the existing workflows, deep links, functionality, and information density. Trial and workspace deep links remain valid; the in-run investigation stays in a side panel instead of discarding the results view. This request is a visual and navigation redesign, not a claim that the current backend already provides scalable run comparison or pagination. Matrix cells and saved runs are inspectable; saved reports can include sensitive data. Report outputs are local, not automatically published. Dense tables need accessible keyboard and touch paths, clear run/scorer status, and responsive overflow.

## Brand Commitments

Keep the EvalKit name and product-specific terminology. The user wants a black-and-white developer-tool interface without decorative AI-dashboard styling or the old editorial treatment, with a quick collapse control inside the navigation rail and a breadcrumb path through suite, eval, run, trial, and workspace. https://supabase.com/evals is a visual reference only: its published-eval catalog is explicitly _not_ the model for an operational EvalKit workspace handling large run histories and comparisons. Do not copy its branding or gallery-oriented information architecture.

## Evidence on Hand

The existing React dashboard, local sample runs, and project documentation provide real content and interactions. No customer proof, pricing, or marketing claims are needed for this tool.

## Product Principles

- Evidence first: scores and the runs that produced them should remain legible and distinguishable.
- Density without friction: scanning many cells or runs must not compromise discoverability or input access.
- Preserve operational truth: never imply a scoring pass from execution completion alone.
