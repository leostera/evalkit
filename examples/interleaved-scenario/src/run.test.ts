import { expect, test } from 'bun:test';
import type { RunResult } from '@evalkit/core';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Effect } from 'effect';
import { loadProject } from '@evalkit/cli/project';
import {
  localReportStore,
  readRunSummary,
  readRunEvents,
  readRunManifest,
  readRunScoring,
  runEval,
} from '@evalkit/runner';

/** Runs a scenario once and returns its one run. */
const runOne = async (
  effect: ReturnType<typeof runEval>,
): Promise<RunResult> => {
  const [run, ...more] = await Effect.runPromise(effect);
  if (!run || more.length) throw new Error('expected exactly one run');
  return run;
};

const projectRoot = resolve(import.meta.dir, '..');

test('discovered scenarios prove interleaved success and failfast using real v3+ reports', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'evalkit-interleaved-'));
  try {
    const { config, registry } = await loadProject(projectRoot);
    expect(config).toEqual({});
    expect(registry.evals.map((evaluation) => evaluation.id)).toEqual([
      'failfast-file',
      'judged-reply',
      'write-revise',
    ]);
    const reports = join(temporaryRoot, 'reports');
    const run = (id: string) => {
      const evaluation = registry.get(id);
      if (!evaluation) throw new Error(`Eval ${id} was not discovered`);
      return runOne(
        runEval(evaluation, {
          report: localReportStore(reports),
          workspaceRoot: join(temporaryRoot, 'sandbox'),
          runtime: 'local',
        }),
      );
    };

    const passed = await run('write-revise');
    expect(passed.status).toBe('passed');
    expect(passed.scoring?.passed).toBe(true);
    expect(passed.scoring?.overall).toBe(1);
    expect((await readRunManifest(reports, passed.runId)).schemaVersion).toBe(
      6,
    );
    const passedScores = await readRunScoring(reports, passed.runId);
    expect(passedScores.checkpoints?.map((entry) => entry.status)).toEqual([
      'passed',
      'passed',
      'passed',
      'passed',
    ]);
    const passedEvents = await readRunEvents(reports, passed.runId);
    const match = passedScores.checkpoints?.[1]?.matchedToolCall;
    expect(passedEvents[match!.eventIndex]).toMatchObject({
      source: 'aut',
      kind: 'tool-call',
      id: match!.id,
    });
    expect(
      passedEvents.filter(
        (event) => event.source === 'aut' && event.kind === 'tool-call',
      ),
    ).toHaveLength(2);
    expect(await readRunSummary(reports, passed.runId)).toMatchObject({
      status: 'passed',
    });

    const judged = await run('judged-reply');
    expect(judged.status).toBe('passed');
    expect(judged.scoring?.passed).toBe(true);
    expect(
      (await readRunScoring(reports, judged.runId)).checkpoints?.[0],
    ).toMatchObject({
      kind: 'judge',
      status: 'passed',
      explanation: 'The reply says it wrote 2112.',
    });
    expect(judged.scoring?.results[0]).toMatchObject({
      kind: 'judge',
      passed: true,
      passAt: 1,
      judge: {
        agent: { id: 'local-fake-judge', kind: 'in-process' },
        model: 'local-rules',
        prompt: expect.stringContaining(
          'Rubric:\nDid the assistant describe writing 2112?',
        ),
        events: [
          expect.objectContaining({ kind: 'message', role: 'assistant' }),
          expect.objectContaining({ kind: 'turn-completed' }),
        ],
      },
    });

    const failed = await run('failfast-file');
    expect(failed.status).toBe('failed'); // a failed assertion, not an execution error (errored)
    expect(failed.scoring?.passed).toBe(false);
    expect(failed.scoring?.skippedScorers).toEqual(['final file is 2113']);
    expect(failed.scoring?.results.map((entry) => entry.name)).toEqual([
      'first turn was observed',
    ]);
    expect(
      (await readRunScoring(reports, failed.runId)).checkpoints?.map(
        (entry) => entry.status,
      ),
    ).toEqual(['passed', 'passed', 'failed', 'skipped']);
    const failedEvents = await readRunEvents(reports, failed.runId);
    expect(
      failedEvents.filter(
        (event) => event.source === 'aut' && event.kind === 'tool-call',
      ),
    ).toHaveLength(1);
    expect(failedEvents).toContainEqual(
      expect.objectContaining({
        source: 'aut',
        kind: 'tool-result',
        result: { ok: false },
      }),
    );
    expect(
      failedEvents.filter((event) => event.kind === 'transcript-step-skipped'),
    ).toHaveLength(2);
    expect(
      await readFile(
        join(reports, failed.runId, 'artifacts', 'candidate', 'number.txt'),
        'utf8',
      ),
    ).toBe('wrong');
    expect(await readRunSummary(reports, failed.runId)).toMatchObject({
      status: 'failed',
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
