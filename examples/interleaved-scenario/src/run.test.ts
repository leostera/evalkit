import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Effect } from 'effect';
import { loadProject } from '@evalkit/cli/project';
import {
  localReportStore,
  readRunSummary,
  readTrialEvents,
  readTrialManifest,
  readTrialScoring,
  runEval,
} from '@evalkit/runner';

const projectRoot = resolve(import.meta.dir, '..');

test('discovered scenarios prove interleaved success and failfast using real v3 reports', async () => {
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
      return Effect.runPromise(
        runEval(evaluation, {
          report: localReportStore(reports),
          workspaceRoot: join(temporaryRoot, 'sandbox'),
          runtime: 'local',
        }),
      );
    };

    const passed = await run('write-revise');
    expect(passed.status).toBe('completed');
    expect(passed.scoring?.passed).toBe(true);
    expect(passed.scoring?.overall).toBe(1);
    expect(
      (await readTrialManifest(reports, passed.runId, passed.trialId))
        .schemaVersion,
    ).toBe(3);
    const passedScores = await readTrialScoring(
      reports,
      passed.runId,
      passed.trialId,
    );
    expect(passedScores.checkpoints?.map((entry) => entry.status)).toEqual([
      'passed',
      'passed',
      'passed',
      'passed',
    ]);
    const passedEvents = await readTrialEvents(
      reports,
      passed.runId,
      passed.trialId,
    );
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
      passed: 1,
      failed: 0,
    });

    const judged = await run('judged-reply');
    expect(judged.status).toBe('completed');
    expect(judged.scoring?.passed).toBe(true);
    expect(
      (await readTrialScoring(reports, judged.runId, judged.trialId))
        .checkpoints?.[0],
    ).toMatchObject({
      kind: 'judge',
      status: 'passed',
      evidence: { placement: 'transcript' },
    });
    expect(judged.scoring?.results[0]).toMatchObject({
      kind: 'judge',
      passed: true,
      evidence: { placement: 'scoring' },
      judge: {
        agent: { id: 'local-fake-judge', kind: 'in-process' },
        usage: { inputTokens: 7, outputTokens: 3 },
        events: [
          expect.objectContaining({ kind: 'message', role: 'assistant' }),
          expect.objectContaining({ kind: 'turn-completed' }),
          expect.objectContaining({ kind: 'completed' }),
        ],
      },
    });

    const failed = await run('failfast-file');
    expect(failed.status).toBe('completed'); // assertion failure is not an execution error
    expect(failed.scoring?.passed).toBe(false);
    expect(failed.scoring?.skippedScorers).toEqual(['final file is 2113']);
    expect(failed.scoring?.results.map((entry) => entry.name)).toEqual([
      'first turn was observed',
    ]);
    expect(
      (
        await readTrialScoring(reports, failed.runId, failed.trialId)
      ).checkpoints?.map((entry) => entry.status),
    ).toEqual(['passed', 'passed', 'failed', 'skipped']);
    const failedEvents = await readTrialEvents(
      reports,
      failed.runId,
      failed.trialId,
    );
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
        join(
          reports,
          failed.runId,
          'trials',
          failed.trialId,
          'artifacts',
          'candidate',
          'number.txt',
        ),
        'utf8',
      ),
    ).toBe('wrong');
    expect(await readRunSummary(reports, failed.runId)).toMatchObject({
      status: 'completed',
      passed: 0,
      failed: 1,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
