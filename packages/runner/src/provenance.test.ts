import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { defineEval, registerEvals, user, type RunSource } from '@evalkit/core';
import { readRunManifest } from './local-report-reader.js';
import { localReportStore } from './local-report-store.js';
import { runEval } from './index.js';

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
  'runs record their source and save the run catalog (%i trial(s))',
  async (trials) => {
    const root = await mkdtemp(join(tmpdir(), 'evalkit-provenance-'));
    roots.push(root);
    const registry = registerEvals([evaluation]);
    const catalog = {
      catalog: registry.catalog(),
      evals: registry.metadata(),
      suites: registry.suiteMetadata(),
    };
    const result = await Effect.runPromise(
      runEval(evaluation, {
        report: localReportStore(root),
        workspaceRoot: join(root, 'sandbox'),
        trials,
        source,
        catalog,
      }),
    );
    const manifest = await readRunManifest(root, result.runId);
    expect(manifest).toMatchObject({ schemaVersion: 4, source });
    expect(
      JSON.parse(
        await readFile(join(root, result.runId, 'catalog.json'), 'utf8'),
      ),
    ).toEqual(JSON.parse(JSON.stringify(catalog)));
  },
);

test('a run without a source stays readable ("untracked")', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-provenance-'));
  roots.push(root);
  const result = await Effect.runPromise(
    runEval(evaluation, { report: localReportStore(root) }),
  );
  expect((await readRunManifest(root, result.runId)).source).toBeUndefined();
});
