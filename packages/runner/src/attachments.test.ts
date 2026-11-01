import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { defineAgent, defineEval, predicate, user } from '@evalkit/core';
import { attachmentName, attachmentStore } from './attachments.js';
import { localReportStore, readTrialSummary, runEval } from './index.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

function memoryWriter() {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    writeArtifact: async (path: string, data: Uint8Array) => {
      files.set(path, data);
    },
  };
}

test('names are relative paths of safe segments', () => {
  for (const name of ['agent.log', 'logs/pi-2.jsonl', 'a_b/c.d.txt'])
    expect(attachmentName(name)).toBe(name);
  for (const name of [
    '',
    '/etc/passwd',
    '../escape.log',
    'logs/../../x',
    '.env',
    'logs/.hidden',
    'a//b',
    'back\\slash',
    'space here.log',
    'nul\0.log',
    'x'.repeat(201),
  ])
    expect(() => attachmentName(name)).toThrow('is not allowed');
});

test('a file over the limit keeps its end, on a whole character; the trial total is enforced', async () => {
  const writer = memoryWriter();
  const store = attachmentStore(writer, {
    maxFileBytes: 10,
    maxTrialBytes: 20,
  });
  // "é" is two bytes; the cut must not start in the middle of one.
  await store.attach('agent.log', 'start…é error: boom');
  const saved = new TextDecoder().decode(
    writer.files.get('attachments/agent.log'),
  );
  expect(saved).toBe(' error: boom'.slice(-saved.length));
  expect(Buffer.byteLength(saved)).toBeLessThanOrEqual(10);
  await store.attach('bytes.bin', new Uint8Array([1, 2, 3]));
  await expect(store.attach('agent.log', 'again')).rejects.toThrow(
    'already attached',
  );
  await expect(store.attach('big.log', 'x'.repeat(10))).rejects.toThrow(
    'past its 20-byte attachment limit',
  );
  await expect(store.attach('bad', 42 as never)).rejects.toThrow(
    'must be a string or a Uint8Array',
  );
  expect(await store.close()).toEqual([
    { name: 'agent.log', size: Buffer.byteLength(saved), truncatedFrom: 22 },
    { name: 'bytes.bin', size: 3 },
  ]);
  await expect(store.attach('late.log', 'x')).rejects.toThrow(
    'the trial has finished',
  );
});

test('an adapter attaches its log; it is kept with the results when the passing sandbox is not', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-attach-'));
  roots.push(root);
  const evaluation = defineEval({
    id: 'attaches-log',
    agent: defineAgent({
      async start({ attach }) {
        const log: string[] = [];
        return {
          async send(message: string) {
            log.push(`> ${message}`, '< ok');
            return 'ok';
          },
          async close() {
            await attach('logs/agent.log', log.join('\n'));
          },
        };
      },
    }),
    transcript: [
      user('go'),
      predicate('saves what it saw', async ({ attach }) => {
        await attach('checkpoint.txt', 'state before teardown');
        return true;
      }),
    ],
    scoring: [predicate('ok', ({ output }) => output === 'ok')],
  });
  const result = await Effect.runPromise(
    runEval(evaluation, {
      report: localReportStore(join(root, 'results')),
      workspaceRoot: join(root, 'sandbox'),
    }),
  );
  expect(result.scoring?.passed).toBe(true);
  expect(await readdir(join(root, 'sandbox'))).toEqual([]);
  const trialDir = join(
    root,
    'results',
    result.runId,
    'trials',
    result.trialId,
  );
  expect(
    await readFile(
      join(trialDir, 'artifacts/attachments/logs/agent.log'),
      'utf8',
    ),
  ).toBe('> go\n< ok');
  const summary = await readTrialSummary(
    join(root, 'results'),
    result.runId,
    result.trialId,
  );
  expect(summary.attachments).toEqual([
    { name: 'checkpoint.txt', size: 21 },
    { name: 'logs/agent.log', size: 9 },
  ]);
});
