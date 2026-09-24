---
title: Troubleshooting and limitations
description: Diagnose common failures and understand current API limitations.
---

- **Unknown eval:** Run from the project directory and select the eval by its ID. Default-export it from a matching `evals/*.eval.ts` file; check `testDir`/`include`/`exclude` if you have a config. If using an explicit suite, confirm its registry is loaded. Check for duplicate or malformed IDs.
- **Fixture not found / duplicate destination:** Fixture `src` is relative to the working directory, not the eval file. Give each fixture a unique destination per workspace; do not use absolute paths or `..` as destinations.
- **Pi exited / command not found:** Install/configure Pi, or run only the self-contained greeting eval. The Pi adapter requires the local `pi` command; the Agents SDK remote adapter is not implemented.
- **No response in a score:** The adapter must emit an assistant `message` event; merely returning a value from `send` does not put it in the trajectory.
- **Execution vs scoring:** A completed execution can fail its scoring rules. Inspect trial `scoring.json`, `summary.json`, and `trajectory.jsonl`, not just the CLI's status line.
- **Not yet executable:** Non-user transcript steps, judge scorers, timeout enforcement, remote Agents SDK transport, and automatic standalone project scaffolding are not available. CLI model/budget flags only forward parameters to adapters, not enforce them.

For deeper API contracts, see [`packages/core/src/index.ts`](https://github.com/leostera/evalkit/blob/main/packages/core/src/index.ts), [`packages/runner/src/index.ts`](https://github.com/leostera/evalkit/blob/main/packages/runner/src/index.ts), and the starter example.
