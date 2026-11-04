import { afterEach, expect, test } from 'bun:test';
import type { RunResult } from '@evalkit/core';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { defineEval, registerEvals, user, type RunSource } from '@evalkit/core';
import { readRunManifest } from './local-report-reader.js';
import { localReportStore } from './local-report-store.js';
import { runEval } from './index.js';

/** Runs a scenario once and returns its one run. */
const runOne = async (
  effect: ReturnType<typeof runEval>,
): Promise<RunResult> => {
  const [run, ...more] = await Effect.runPromise(effect);
  if (!run || more.length) throw new Error('expected exactly one run');
  return run;
};

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

const evaluation = defineEval({
  id: 'tagged',
  agent: {
    async start() {
      return { async send() {}, async close() {} };
    },
  },
  transcript: [user('hello')],
  scoring: [],
});
const source: RunSource = {
  repo: 'gitlab.example.com/team/evals',
  project: 'evals',
  commit: 'b'.repeat(40),
  ref: 'main',
  dirty: false,
};

test.each([1, 2])(
  'runs record their source and save the run catalog (repeat %i)',
  async (repeat) => {
    const root = await mkdtemp(join(tmpdir(), 'evalkit-provenance-'));
    roots.push(root);
    const registry = registerEvals([evaluation]);
    const catalog = {
      catalog: registry.catalog(),
      evals: registry.metadata(),
      suites: registry.suiteMetadata(),
    };
    const runs = await Effect.runPromise(
      runEval(evaluation, {
        report: localReportStore(root),
        workspaceRoot: join(root, 'sandbox'),
        repeat,
        source,
        catalog,
      }),
    );
    expect(runs).toHaveLength(repeat);
    for (const run of runs) {
      const manifest = await readRunManifest(root, run.runId);
      expect(manifest).toMatchObject({ schemaVersion: 8, source });
      expect(
        JSON.parse(
          await readFile(join(root, run.runId, 'catalog.json'), 'utf8'),
        ),
      ).toEqual(JSON.parse(JSON.stringify(catalog)));
    }
  },
);

test('a run without a source stays readable ("untracked")', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-provenance-'));
  roots.push(root);
  const result = await runOne(
    runEval(evaluation, { report: localReportStore(root) }),
  );
  expect((await readRunManifest(root, result.runId)).source).toBeUndefined();
});
