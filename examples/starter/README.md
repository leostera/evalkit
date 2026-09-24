# Evalkit starter example

A real, workspace-backed Evalkit project used as an integration target while the scaffold and hosted runner are built.

It contains a project-owned AUT, candidate-visible fixture, predicate judge, explicit eval registry, executable local run command, and report assertion. Fixture source paths such as `directory('fixtures/starter')` are resolved from the project directory where Evalkit is invoked; the default options copy the directory as a candidate-visible fixture beneath its basename.

```bash
bun install
bun run evals
bun run dashboard
```

`bun run evals` delegates to `evalkit run-evals`: it loads the explicit `src/registry.ts`, writes local reports under `_evalkit-results/`, and preserves trial workspaces under `_evalkit-sandbox/<trial-id>/` for inspection. These ordinary local directories can be deleted when no longer needed. `bun run dashboard` delegates to `evalkit serve-dashboard`, then prints the local dashboard URL. Report and sandbox state are ignored by Git.
