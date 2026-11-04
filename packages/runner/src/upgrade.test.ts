import { afterEach, expect, test } from 'bun:test';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import {
  readRunEvents,
  readRunManifest,
  readRunScoring,
  readRunSummary,
  readRunTranscript,
} from './local-report-reader.js';
import { upgradeReports } from './upgrade.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const id = (n: number) =>
  `0197f17c-4d89-7f81-9d42-${n.toString(16).padStart(12, '0')}`;
const at = '2026-10-01T10:00:00.000Z';
const gone = { pid: 999_999_999, hostname: os.hostname() };
const source = {
  repo: 'github.com/acme/evals',
  project: '',
  commit: 'a'.repeat(40),
  dirty: false,
};

async function write(path: string, value: unknown) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(
    path,
    typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  );
}

/** A run as EvalKit 0.8 saved it, with `trials` trials. */
async function oldRun(
  root: string,
  runId: string,
  trials: { id: string; passed?: boolean; status?: string }[],
  options: { finished?: boolean; schemaVersion?: number } = {},
) {
  const dir = join(root, runId);
  const schemaVersion = options.schemaVersion ?? 5;
  await write(join(dir, 'manifest.json'), {
    schemaVersion,
    runUri: `evalkit:run:${runId}`,
    evalId: 'lint-and-fix',
    suiteId: 'testing',
    parameters: { model: 'luna' },
    matrix: { id: 'models', cellKey: 'k' },
    startedAt: at,
    source,
    process: gone,
    status: 'completed',
  });
  await write(join(dir, 'catalog.json'), {
    catalog: [
      {
        id: 'lint-and-fix',
        trialCount: trials.length,
        policy: { trials: trials.length, failfast: true },
      },
    ],
    evals: [],
    suites: [],
  });
  if (options.finished !== false)
    await write(join(dir, 'summary.json'), {
      status: 'completed',
      endedAt: at,
      trialCount: trials.length,
      passed: 0,
      failed: 0,
    });
  for (const [index, trial] of trials.entries()) {
    const trialDir = join(dir, 'trials', trial.id);
    const status = trial.status ?? 'completed';
    await write(join(trialDir, 'manifest.json'), {
      schemaVersion,
      runUri: `evalkit:run:${runId}`,
      trialUri: `evalkit:trial:${trial.id}`,
      trialIndex: index,
      evalId: 'lint-and-fix',
      parameters: { model: 'luna' },
      startedAt: at,
      workspaceIgnore: ['_build'],
      datasets: [
        {
          id: 'project',
          visibility: 'candidate',
          source: 'static',
          digest: 'sha256:1',
        },
      ],
      status,
    });
    const scoring = { results: [], passed: trial.passed ?? true, overall: 1 };
    await write(join(trialDir, 'summary.json'), {
      status,
      endedAt: at,
      durationMs: 1200,
      scoring,
      artifacts: [{ path: 'candidate/main.ml', kind: 'file', size: 2 }],
    });
    await write(join(trialDir, 'scoring.json'), scoring);
    await write(
      join(trialDir, 'trajectory.jsonl'),
      [
        { source: 'runner', kind: 'trial-started', timestamp: at },
        {
          source: 'aut',
          kind: 'message',
          role: 'assistant',
          content: 'done',
          timestamp: at,
        },
        { source: 'runner', kind: 'trial-completed', timestamp: at },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n') + '\n',
    );
    await write(join(trialDir, 'artifacts', 'candidate', 'main.ml'), '()');
  }
}

async function results() {
  const root = await mkdtemp(join(os.tmpdir(), 'evalkit-upgrade-'));
  roots.push(root);
  return root;
}

test('a run of one trial keeps its ID; a run of several becomes a batch of its trials', async () => {
  const root = await results();
  await oldRun(root, id(1), [
    { id: id(11) },
    { id: id(12), passed: false },
    { id: id(13), status: 'failed', passed: false },
  ]);
  await oldRun(root, id(2), [{ id: id(21) }], { schemaVersion: 2 });

  expect(await upgradeReports(root, { dryRun: true })).toEqual({
    upgraded: 2,
    runs: 4,
    batches: 1,
    running: [],
    transcripts: 4,
    failed: [],
  });
  expect((await readdir(root)).sort()).toEqual([id(1), id(2)]); // nothing changed

  expect(await upgradeReports(root)).toEqual({
    upgraded: 2,
    runs: 4,
    batches: 1,
    running: [],
    transcripts: 4,
    failed: [],
  });
  expect((await readdir(root)).sort()).toEqual([id(2), id(11), id(12), id(13)]);

  const manifest = await readRunManifest(root, id(12));
  expect(manifest).toMatchObject({
    schemaVersion: 7,
    runUri: `evalkit:run:${id(12)}`,
    evalId: 'lint-and-fix',
    suiteId: 'testing',
    parameters: { model: 'luna' },
    matrix: { id: 'models', cellKey: 'k' },
    source,
    workspaceIgnore: ['_build'],
    batch: { id: id(1), index: 1, size: 3 },
    status: 'failed',
  });
  expect(manifest.datasets?.[0]?.digest).toBe('sha256:1');
  // completed + passed → passed; completed + not passed → failed; failed → errored.
  expect((await readRunSummary(root, id(11))).status).toBe('passed');
  expect((await readRunSummary(root, id(12))).status).toBe('failed');
  expect((await readRunSummary(root, id(13))).status).toBe('errored');
  expect((await readRunScoring(root, id(11))).overall).toBe(1);
  // The old trajectory is now an ATXF transcript and EvalKit's events.
  expect(
    (await readRunEvents(root, id(11))).map((event) => event.kind),
  ).toEqual(['run-started', 'run-completed']);
  expect(
    (await readRunTranscript(root, id(11))).records.map((record) =>
      record.type === 'message' ? record.role : record.type,
    ),
  ).toEqual(['assistant', 'seal']);
  expect(
    await readFile(
      join(root, id(11), 'artifacts', 'candidate', 'main.ml'),
      'utf8',
    ),
  ).toBe('()');
  const catalog = JSON.parse(
    await readFile(join(root, id(11), 'catalog.json'), 'utf8'),
  );
  expect(catalog.catalog[0]).toEqual({
    id: 'lint-and-fix',
    repeat: 3,
    policy: { failfast: true },
  });
  // A single trial is the old run, same ID (so its links keep working), with no batch.
  const single = await readRunManifest(root, id(2));
  expect(single).toMatchObject({ runUri: `evalkit:run:${id(2)}` });
  expect(single.batch).toBeUndefined();
  expect(
    await readFile(
      join(root, id(2), 'artifacts', 'candidate', 'main.ml'),
      'utf8',
    ),
  ).toBe('()');

  // Upgrading again changes nothing.
  expect(await upgradeReports(root)).toEqual({
    upgraded: 0,
    runs: 0,
    batches: 0,
    running: [],
    transcripts: 0,
    failed: [],
  });
});

test('running runs are left alone; cancelled runs without trials become one cancelled run', async () => {
  const root = await results();
  await oldRun(root, id(3), [{ id: id(31) }], { finished: false });
  const manifestPath = join(root, id(3), 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await write(manifestPath, {
    ...manifest,
    process: { pid: process.pid, hostname: os.hostname() },
  });
  await oldRun(root, id(4), []);

  const report = await upgradeReports(root);
  expect(report).toMatchObject({ upgraded: 1, runs: 1, running: [id(3)] });
  // Still in the old layout, untouched.
  expect(JSON.parse(await readFile(manifestPath, 'utf8')).schemaVersion).toBe(
    5,
  );
  expect(await readRunSummary(root, id(4))).toMatchObject({
    status: 'cancelled',
  });
  expect((await readRunManifest(root, id(4))).batch).toBeUndefined();
});

test('a crash part-way is finished by upgrading again', async () => {
  const root = await results();
  await oldRun(root, id(5), [{ id: id(51) }, { id: id(52) }]);
  // As if the upgrade had renamed the first run into place and then crashed
  // while writing the second.
  await upgradeReports(root);
  await oldRun(root, id(5), [{ id: id(51) }, { id: id(52) }]);
  await rm(join(root, id(52)), { recursive: true });
  await mkdir(join(root, `.upgrade-${id(52)}`));

  expect(await upgradeReports(root)).toMatchObject({ upgraded: 1, runs: 2 });
  expect((await readdir(root)).sort()).toEqual([id(51), id(52)]);
  expect((await readRunManifest(root, id(52))).batch).toEqual({
    id: id(5),
    index: 1,
    size: 2,
  });
});

test('artifacts moved before a crash are moved back, never lost', async () => {
  const root = await results();
  await oldRun(root, id(6), [{ id: id(61) }, { id: id(62) }]);
  // As if the upgrade had moved the second run's artifacts into its
  // temporary directory, then crashed before renaming it into place.
  const temporary = join(root, `.upgrade-${id(62)}`);
  await mkdir(temporary);
  await rename(
    join(root, id(6), 'trials', id(62), 'artifacts'),
    join(temporary, 'artifacts'),
  );

  expect(await upgradeReports(root)).toMatchObject({ upgraded: 1, runs: 2 });
  for (const run of [id(61), id(62)])
    expect(
      await readFile(
        join(root, run, 'artifacts', 'candidate', 'main.ml'),
        'utf8',
      ),
    ).toBe('()');
  expect((await readdir(root)).sort()).toEqual([id(61), id(62)]);
});

test('a same-ID replacement interrupted at either rename is finished', async () => {
  // Crashed after setting the old run aside, before moving the new one in.
  const first = await results();
  await oldRun(first, id(7), [{ id: id(71) }]);
  await upgradeReports(first);
  await rename(join(first, id(7)), join(first, `.upgrade-${id(7)}`));
  await oldRun(first, id(7), [{ id: id(71) }]);
  await rename(join(first, id(7)), join(first, `.upgraded-${id(7)}`));
  expect(await upgradeReports(first)).toMatchObject({ upgraded: 0 });
  expect((await readdir(first)).sort()).toEqual([id(7)]);
  expect((await readRunManifest(first, id(7))).schemaVersion).toBe(7);

  // Crashed after moving the new one in, before removing the old one.
  const second = await results();
  await oldRun(second, id(8), [{ id: id(81) }]);
  await upgradeReports(second);
  await oldRun(second, id(9), [{ id: id(91) }]);
  await rename(join(second, id(9)), join(second, `.upgraded-${id(8)}`));
  expect(await upgradeReports(second)).toMatchObject({ upgraded: 0 });
  expect((await readdir(second)).sort()).toEqual([id(8)]);
  expect(
    await readFile(
      join(second, id(8), 'artifacts', 'candidate', 'main.ml'),
      'utf8',
    ),
  ).toBe('()');
});

test('a temporary folder holding the only copy of artifacts is never deleted', async () => {
  const root = await results();
  const orphan = join(root, `.upgrade-${id(10)}`);
  await write(join(orphan, 'artifacts', 'candidate', 'main.ml'), '()');
  await write(join(root, `.upgrade-${id(11)}`, 'manifest.json'), {});
  await upgradeReports(root);
  expect(await readdir(root)).toEqual([`.upgrade-${id(10)}`]);
});

/** A run as EvalKit 0.10 saved it: schema version 6, with a trajectory. */
async function v6Run(
  root: string,
  runId: string,
  events: unknown[],
  scoring: Record<string, unknown>,
) {
  const dir = join(root, runId);
  await write(join(dir, 'manifest.json'), {
    schemaVersion: 6,
    runUri: `evalkit:run:${runId}`,
    evalId: 'orders',
    startedAt: at,
    source,
    process: gone,
    status: 'passed',
    aut: { id: 'support-bot', kind: 'test' },
  });
  await write(join(dir, 'scoring.json'), scoring);
  await write(join(dir, 'summary.json'), {
    status: 'passed',
    endedAt: at,
    scoring,
  });
  await write(
    join(dir, 'trajectory.jsonl'),
    events.map((event) => JSON.stringify(event)).join('\n') + '\n',
  );
}

test('version 6 runs become ATXF transcripts; their tokens and tool matches carry over', async () => {
  const root = await results();
  const runner = (kind: string, extra: object = {}) => ({
    source: 'runner',
    kind,
    timestamp: at,
    ...extra,
  });
  const aut = (kind: string, extra: object = {}) => ({
    source: 'aut',
    kind,
    timestamp: at,
    ...extra,
  });
  await v6Run(
    root,
    id(90),
    [
      runner('run-started'),
      runner('transcript-step-started', { step: 0, message: 'Where is 7?' }),
      aut('tool-call', { id: 'c1', name: 'lookupOrder', arguments: { id: 7 } }),
      aut('tool-result', { id: 'c1', result: { eta: 'tomorrow' } }),
      aut('message', { role: 'assistant', content: 'Tomorrow.' }),
      aut('turn-completed', {
        turn: 1,
        // 0.10 counted cached tokens inside input.
        usage: { inputTokens: 1000, outputTokens: 50, cachedInputTokens: 800 },
        model: 'openai/gpt-x',
      }),
      runner('transcript-step-completed', { step: 0 }),
      runner('run-completed'),
    ],
    {
      results: [],
      checkpoints: [
        {
          step: 1,
          name: 'looked up',
          kind: 'expect-tool-call',
          status: 'passed',
          value: 1,
          passed: true,
          matchedToolCall: { eventIndex: 2, id: 'c1' },
        },
      ],
      passed: true,
      overall: 1,
      metrics: [
        {
          name: 'tokens',
          value: 1050,
          unit: 'tokens',
          better: 'lower',
          builtIn: true,
        },
        { name: 'cached tokens', value: 800, unit: 'tokens', builtIn: true },
      ],
    },
  );

  expect(await upgradeReports(root)).toMatchObject({
    transcripts: 1,
    failed: [],
  });
  expect((await readRunManifest(root, id(90))).schemaVersion).toBe(7);
  expect(await readdir(join(root, id(90)))).not.toContain('trajectory.jsonl');
  expect(await readdir(join(root, id(90)))).not.toContain('.v6');

  const transcript = await readRunTranscript(root, id(90));
  // The prompt, the call, its result, the reply: the turn's usage and model on its last message.
  expect(
    transcript.records.map((record) =>
      record.type === 'message' ? record.role : record.type,
    ),
  ).toEqual(['user', 'assistant', 'tool', 'assistant', 'seal']);
  const assistants = transcript.records.filter(
    (record) => record.type === 'message' && record.role === 'assistant',
  );
  const assistant = assistants[0];
  expect(assistants[1]).toMatchObject({
    model: { provider: 'openai', id: 'gpt-x' },
    usage: { input: 200, cacheRead: 800, output: 50 },
  });
  const scoring = await readRunScoring(root, id(90));
  // The match now names the assistant message that made the call.
  expect(scoring.checkpoints?.[0]?.matchedToolCall).toEqual({
    messageId: assistant!.id,
    id: 'c1',
  });
  // Uncached tokens plus cache reads are what 0.10 called tokens.
  const metric = (name: string) =>
    scoring.metrics?.find((entry) => entry.name === name)?.value;
  expect(metric('tokens')).toBe(250);
  expect(metric('cached tokens')).toBe(800);
  expect(metric('tokens')! + metric('cached tokens')!).toBe(1050);

  // Upgrading again changes nothing.
  expect(await upgradeReports(root)).toMatchObject({
    transcripts: 0,
    failed: [],
  });
});

test('a version 6 run that cannot be converted is left as it was and reported', async () => {
  const root = await results();
  await v6Run(root, id(91), [], { results: [], passed: true, overall: 1 });
  await writeFile(join(root, id(91), 'trajectory.jsonl'), '{not json\n');
  const report = await upgradeReports(root);
  expect(report.failed).toEqual([
    { runId: id(91), reason: 'trajectory.jsonl line 1 is not JSON' },
  ]);
  expect(
    JSON.parse(await readFile(join(root, id(91), 'manifest.json'), 'utf8'))
      .schemaVersion,
  ).toBe(6);
  expect(await readFile(join(root, id(91), 'trajectory.jsonl'), 'utf8')).toBe(
    '{not json\n',
  );
});
