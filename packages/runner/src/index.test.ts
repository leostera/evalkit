import { Effect } from 'effect';
import { afterEach, describe, expect, test } from 'bun:test';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  defineAgent,
  defineEval,
  directory,
  file,
  dynamic,
  inlineFile,
  predicate,
  user,
} from '@evalkit/core';
import { localReportStore, runEval } from './index';

const execute = (
  definition: Parameters<typeof runEval>[0],
  options: Parameters<typeof runEval>[1],
) => Effect.runPromise(runEval(definition, options));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function reportDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'evalkit-'));
  temporaryDirectories.push(directory);
  return directory;
}

function testAgent(response: string | (() => Promise<string>)) {
  return defineAgent({
    identity: { kind: 'test-agent' },
    async start({ onEvent }) {
      await onEvent({ kind: 'started', timestamp: new Date().toISOString() });
      return {
        async send(message) {
          await onEvent({
            kind: 'message',
            role: 'user',
            content: message,
            timestamp: new Date().toISOString(),
          });
          const content =
            typeof response === 'string' ? response : await response();
          await onEvent({
            kind: 'message',
            role: 'assistant',
            content,
            timestamp: new Date().toISOString(),
          });
        },
        async close() {
          await onEvent({
            kind: 'completed',
            timestamp: new Date().toISOString(),
          });
        },
      };
    },
  });
}

describe('runEval', () => {
  test('streams a trajectory, scores it, and writes a hierarchical report', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'greeting',
      agent: testAgent('Hello back!'),
      transcript: [user('Hello')],
      scoring: [
        predicate('responded', ({ trajectory }) =>
          trajectory.events.some(
            (event) =>
              event.source === 'aut' &&
              event.kind === 'message' &&
              event.role === 'assistant',
          )
            ? 1
            : 0,
        ),
      ],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: 'run-test',
      trialId: 'trial-test',
    });

    expect(result.status).toBe('completed');
    expect(result.scoring?.overall).toBe(1);
    expect(result.scoring?.passed).toBe(true);

    const trajectory = await readFile(
      path.join(root, 'run-test', 'trials', 'trial-test', 'trajectory.jsonl'),
      'utf8',
    );
    expect(trajectory).toContain('"role":"assistant"');
    expect(trajectory).toContain('"kind":"scorer-completed"');

    const scoring = JSON.parse(
      await readFile(
        path.join(root, 'run-test', 'trials', 'trial-test', 'scoring.json'),
        'utf8',
      ),
    );
    expect(scoring.results[0]).toMatchObject({
      name: 'responded',
      value: 1,
      passed: true,
    });
  });

  test('groups requested independent trials beneath one aggregate run', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'many-trials',
      agent: testAgent('Aye!'),
      transcript: [user('Hello')],
      scoring: [predicate('responded', () => 1)],
      policy: { trials: 3 },
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: 'aggregate-run',
    });

    expect(result.runId).toBe('aggregate-run');
    expect(result.trialCount).toBe(3);
    expect(result.passed).toBe(3);
    expect(result.trials?.map((trial) => trial.trialId)).toEqual([
      'trial-0001',
      'trial-0002',
      'trial-0003',
    ]);
    for (const trial of result.trials ?? []) {
      await access(
        path.join(
          root,
          'aggregate-run',
          'trials',
          trial.trialId,
          'summary.json',
        ),
      );
    }
    const summary = JSON.parse(
      await readFile(path.join(root, 'aggregate-run', 'summary.json'), 'utf8'),
    );
    expect(summary).toMatchObject({ trialCount: 3, passed: 3, failed: 0 });
  });

  test('selects a declared AUT runtime', async () => {
    const root = await reportDirectory();
    let selectedRuntime: string | undefined;
    const evaluation = defineEval({
      id: 'runtime-selection',
      agent: defineAgent({
        runtimes: {
          local: {
            kind: 'process',
            configuration: { command: 'test-agent' },
          },
        },
        async start({ context, runtime }) {
          selectedRuntime = context.runtime;
          expect(runtime).toEqual({
            kind: 'process',
            configuration: { command: 'test-agent' },
          });
          return { async send() {}, async close() {} };
        },
      }),
      transcript: [],
      scoring: [],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runtime: 'local',
      runId: 'run-runtime',
      trialId: 'trial-runtime',
    });

    expect(result.status).toBe('completed');
    expect(selectedRuntime).toBe('local');
  });

  test('rejects an undeclared AUT runtime', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'missing-runtime',
      agent: testAgent('unused'),
      transcript: [],
      scoring: [],
    });

    await expect(
      execute(evaluation, {
        report: localReportStore(root),
        runtime: 'sandbox',
      }),
    ).rejects.toThrow('does not declare the requested sandbox runtime');
  });

  test('provisions isolated candidate and evaluator fixtures', async () => {
    const root = await reportDirectory();
    const source = await reportDirectory();
    let candidateSawEvaluatorFixture = false;
    let candidateRoot = '';
    await writeFile(path.join(source, 'starter.txt'), 'candidate fixture');
    const evaluation = defineEval({
      id: 'fixtures',
      agent: defineAgent({
        async start({ context, onEvent }) {
          return {
            async send() {
              candidateRoot = context.workspace.root;
              try {
                await readFile(path.join(context.workspace.root, 'hidden.txt'));
                candidateSawEvaluatorFixture = true;
              } catch {
                // Evaluator-only fixtures are materialized in a separate tree.
              }
              const starter = await readFile(
                path.join(context.workspace.root, 'project', 'starter.txt'),
                'utf8',
              );
              await writeFile(
                path.join(context.workspace.root, 'agent-output.txt'),
                starter.toUpperCase(),
              );
              await onEvent({
                kind: 'message',
                role: 'assistant',
                content: 'Created output.',
                timestamp: new Date().toISOString(),
              });
            },
            async close() {},
          };
        },
      }),
      fixtures: [
        directory(source, { dst: 'project', visibility: 'candidate' }),
        file(path.join(source, 'starter.txt'), {
          dst: 'copied.txt',
          visibility: 'evaluator',
        }),
        inlineFile('hidden.txt', 'evaluator fixture', 'evaluator'),
        dynamic(() =>
          inlineFile('generated.txt', 'dynamic fixture', 'candidate'),
        ),
      ],
      transcript: [user('Create the output')],
      scoring: [
        predicate('checks-both-workspaces', async ({ artifacts }) => {
          const output = await readFile(
            path.join(artifacts.candidate.root, 'agent-output.txt'),
            'utf8',
          );
          const hidden = await readFile(
            path.join(artifacts.evaluator.root, 'hidden.txt'),
            'utf8',
          );
          const copied = await readFile(
            path.join(artifacts.evaluator.root, 'copied.txt'),
            'utf8',
          );
          return output === 'CANDIDATE FIXTURE' &&
            hidden === 'evaluator fixture' &&
            copied === 'candidate fixture'
            ? 1
            : 0;
        }),
      ],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: 'run-fixtures',
      trialId: 'trial-fixtures',
    });

    expect(result.status).toBe('completed');
    expect(result.scoring?.passed).toBe(true);
    expect(candidateSawEvaluatorFixture).toBe(false);
    await expect(access(candidateRoot)).rejects.toThrow();

    const snapshotRoot = path.join(
      root,
      'run-fixtures',
      'trials',
      'trial-fixtures',
      'artifacts',
    );
    expect(
      await readFile(
        path.join(snapshotRoot, 'candidate', 'agent-output.txt'),
        'utf8',
      ),
    ).toBe('CANDIDATE FIXTURE');
    await expect(
      access(path.join(snapshotRoot, 'evaluator', 'hidden.txt')),
    ).rejects.toThrow();
  });

  test('fails safely when fixture destinations escape the workspace', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'invalid-fixture',
      agent: testAgent('unused'),
      fixtures: [inlineFile('../outside.txt', 'nope', 'candidate')],
      transcript: [],
      scoring: [],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: 'run-invalid-fixture',
      trialId: 'trial-invalid-fixture',
    });

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('escapes its workspace');
  });

  test('fails safely for duplicate fixture destinations', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'duplicate-fixture',
      agent: testAgent('unused'),
      fixtures: [
        inlineFile('same.txt', 'first', 'candidate'),
        inlineFile('same.txt', 'second', 'candidate'),
      ],
      transcript: [],
      scoring: [],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: 'run-duplicate-fixture',
      trialId: 'trial-duplicate-fixture',
    });

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain(
      'Duplicate candidate fixture destination',
    );
  });

  test('persists a partial trajectory when the AUT fails', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'failure',
      agent: testAgent(async () => {
        throw new Error('boom');
      }),
      transcript: [user('Hello')],
      scoring: [],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: 'run-failure',
      trialId: 'trial-failure',
    });

    expect(result.status).toBe('failed');
    const trajectory = await readFile(
      path.join(
        root,
        'run-failure',
        'trials',
        'trial-failure',
        'trajectory.jsonl',
      ),
      'utf8',
    );
    expect(trajectory).toContain('"role":"user"');
    expect(trajectory).toContain('"kind":"error"');
  });
});
