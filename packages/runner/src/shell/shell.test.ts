import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { container, sandboxExec } from '@evalkit/core';
import { containerShell } from './container-shell.js';
import { fixtureSet } from './fixtures.js';
import { hostShell } from './host-shell.js';
import { sandboxShell } from './sandbox-shell.js';

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

let root: string;
let workspace: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evalkit-shell-'));
  // <sandboxDir>/<run>/candidate, as the runner lays it out.
  workspace = path.join(root, 'runs', 'run-1', 'candidate');
  await mkdir(workspace, { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('host shell', () => {
  test('runs strings with sh and arrays as they are, in the workspace', async () => {
    const shell = hostShell({
      root: workspace,
      signal: new AbortController().signal,
    });
    try {
      const listed = await shell.exec('echo "$GREETING" && pwd', {
        env: { GREETING: 'hello' },
      });
      expect(listed.exitCode).toBe(0);
      expect(listed.stdout.trim().split('\n')[0]).toBe('hello');
      expect(await shell.exec(['sh', '-c', 'exit 3'])).toMatchObject({
        exitCode: 3,
      });
      const missing = await shell.exec(['definitely-not-a-program-evalkit']);
      expect(missing.exitCode).toBe(127);
      expect(missing.stderr).toContain('definitely-not-a-program-evalkit');
      expect((await shell.exec('cat', { input: 'piped' })).stdout).toBe(
        'piped',
      );
    } finally {
      await shell.close();
    }
  });

  test('stops a command at its timeout or when the run aborts', async () => {
    const run = new AbortController();
    const shell = hostShell({ root: workspace, signal: run.signal });
    try {
      expect(await shell.exec('sleep 30', { timeoutMs: 100 })).toMatchObject({
        exitCode: 124,
        timedOut: true,
      });
      const slow = shell.exec('sleep 30');
      setTimeout(() => run.abort(), 50);
      expect((await slow).exitCode).toBe(143);
    } finally {
      await shell.close();
    }
  });

  test('a spawned process streams its output and stops with kill', async () => {
    const shell = hostShell({
      root: workspace,
      signal: new AbortController().signal,
    });
    try {
      const server = shell.spawn('echo ready; sleep 30');
      const chunks: string[] = [];
      server.onOutput((chunk) => chunks.push(chunk));
      while (!server.stdout().includes('ready'))
        await new Promise((resolve) => setTimeout(resolve, 10));
      await server.kill();
      expect((await server.wait()).exitCode).toBe(143);
      expect(server.stdout()).toBe('ready\n');
    } finally {
      await shell.close();
    }
  });

  test('closing stops what the run left running, background children too', async () => {
    const shell = hostShell({
      root: workspace,
      signal: new AbortController().signal,
    });
    const left = await shell.exec('sleep 30 > /dev/null 2>&1 & echo $!');
    const pid = Number(left.stdout.trim());
    expect(alive(pid)).toBe(true);
    await shell.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(alive(pid)).toBe(false);
    await expect(shell.exec('true')).rejects.toThrow('The run is over');
  });

  test('reads, writes and lists files in the workspace, and nowhere else', async () => {
    const shell = hostShell({
      root: workspace,
      signal: new AbortController().signal,
    });
    try {
      await shell.writeFile('notes/a.txt', 'one');
      expect(await shell.readFile('notes/a.txt')).toBe('one');
      expect(await shell.list()).toEqual(['notes/']);
      expect(await shell.list('notes')).toEqual(['a.txt']);
      await expect(shell.readFile('../evaluator/answer.txt')).rejects.toThrow(
        'outside the run',
      );
      await expect(shell.readFile('/etc/hosts')).rejects.toThrow('relative');
      await expect(shell.exec('pwd', { cwd: '..' })).rejects.toThrow('outside');
    } finally {
      await shell.close();
    }
  });
});

describe.if(process.platform === 'darwin')('sandbox-exec shell', () => {
  test('confines files and signals to the run', async () => {
    const project = path.join(root, 'project');
    await mkdir(project);
    await writeFile(path.join(project, 'secret.txt'), 'answer');
    const evaluator = path.join(root, 'runs', 'run-1', 'evaluator');
    await mkdir(evaluator);
    await writeFile(path.join(evaluator, 'expected.txt'), 'answer');
    const outside = Bun.spawn(['sleep', '30']);
    const shell = await sandboxShell({
      isolation: sandboxExec(),
      root: workspace,
      projectRoot: project,
      signal: new AbortController().signal,
    });
    try {
      expect(
        await shell.exec('echo built > out.txt && cat out.txt'),
      ).toMatchObject({
        exitCode: 0,
        stdout: 'built\n',
      });
      expect(await readFile(path.join(workspace, 'out.txt'), 'utf8')).toBe(
        'built\n',
      );
      expect(
        (await shell.exec(`cat ${path.join(project, 'secret.txt')}`)).exitCode,
      ).not.toBe(0);
      expect(
        (await shell.exec(`cat ${path.join(evaluator, 'expected.txt')}`))
          .exitCode,
      ).not.toBe(0);
      expect(
        (await shell.exec(`echo x > ${path.join(project, 'new.txt')}`))
          .exitCode,
      ).not.toBe(0);
      // Signals reach only the sandbox.
      expect((await shell.exec(`kill ${outside.pid}`)).exitCode).not.toBe(0);
      expect(alive(outside.pid)).toBe(true);
      // A later command can stop a server an earlier one started.
      const server = shell.spawn('echo $$; exec sleep 30');
      while (!server.stdout())
        await new Promise((resolve) => setTimeout(resolve, 10));
      const pid = server.stdout().trim();
      expect((await shell.exec(`kill ${pid}`)).exitCode).toBe(0);
      expect((await server.wait()).exitCode).toBe(143);
    } finally {
      await shell.close();
      outside.kill();
    }
  });
});

const hasDocker =
  spawnSync('docker', ['version', '--format', '{{.Server.Version}}']).status ===
  0;

describe.if(hasDocker)('container shell', () => {
  test('runs each run in its own container with the workspace mounted', async () => {
    await writeFile(path.join(workspace, 'input.txt'), 'from the host');
    const outside = Bun.spawn(['sleep', '30']);
    const shell = await containerShell({
      isolation: container({ image: 'busybox:stable' }),
      runId: `test-${crypto.randomUUID()}`,
      root: workspace,
      projectRoot: root,
      signal: new AbortController().signal,
    });
    try {
      expect(shell.root).toBe('/workspace');
      expect(await shell.exec('pwd && cat input.txt')).toMatchObject({
        exitCode: 0,
        stdout: '/workspace\nfrom the host',
      });
      await shell.exec('echo built > out.txt');
      expect(await readFile(path.join(workspace, 'out.txt'), 'utf8')).toBe(
        'built\n',
      );
      // Its own process table: the host's processes are not there to kill.
      expect((await shell.exec(`kill ${outside.pid}`)).exitCode).not.toBe(0);
      expect(alive(outside.pid)).toBe(true);
      expect(
        (await shell.exec('ls /workspace/../evaluator')).exitCode,
      ).not.toBe(0);
      // network: 'none'
      expect(
        (await shell.exec('wget -q -T 2 -O- http://example.com')).exitCode,
      ).not.toBe(0);
      const server = shell.spawn('echo up; exec sleep 30');
      while (!server.stdout())
        await new Promise((resolve) => setTimeout(resolve, 10));
      await server.kill();
      expect((await server.wait()).exitCode).not.toBe(0);
      expect(await shell.exec('sleep 30', { timeoutMs: 200 })).toMatchObject({
        timedOut: true,
      });
    } finally {
      await shell.close();
      outside.kill();
    }
    expect(spawnSync('docker', ['inspect', shell.container]).status).not.toBe(
      0,
    );
  }, 60_000);

  test('a run on the fixtures network reaches the fixtures and nothing else', async () => {
    await writeFile(
      path.join(root, 'fixture.ts'),
      "Bun.serve({ port: 18788, hostname: '127.0.0.1', fetch: () => new Response('stocked') });",
    );
    const fixtures = fixtureSet(
      {
        store: {
          start: `${process.execPath} fixture.ts`,
          ready: 'http://localhost:18788/',
        },
      },
      { root },
    );
    try {
      await fixtures.ensure();
      const isolation = container({
        image: 'busybox:stable',
        network: 'fixtures',
      });
      expect(fixtures.addresses(isolation)).toEqual({
        store: { url: 'http://fixtures.store:18788' },
      });
      const shell = await containerShell({
        isolation,
        runId: `test-${crypto.randomUUID()}`,
        root: workspace,
        projectRoot: root,
        signal: new AbortController().signal,
        fixturesNetwork: await fixtures.network('docker'),
      });
      try {
        expect(
          (await shell.exec('wget -q -T 5 -O- http://fixtures.store:18788/'))
            .stdout,
        ).toBe('stocked');
        expect(
          (await shell.exec('wget -q -T 2 -O- http://example.com')).exitCode,
        ).not.toBe(0);
      } finally {
        await shell.close();
      }
    } finally {
      await fixtures.stop();
    }
  }, 90_000);
});

describe('fixtures', () => {
  test('start once, answer at localhost, keep their output, and stop', async () => {
    await writeFile(
      path.join(root, 'fixture.ts'),
      "console.log('store up'); Bun.serve({ port: 18789, fetch: () => new Response('ok') });",
    );
    const fixtures = fixtureSet(
      {
        store: {
          start: `${process.execPath} fixture.ts`,
          ready: 'http://localhost:18789/health',
        },
      },
      { root },
    );
    expect(fixtures.started).toBe(false);
    await Promise.all([fixtures.ensure(), fixtures.ensure()]);
    expect(fixtures.addresses({ kind: 'none' })).toEqual({
      store: { url: 'http://localhost:18789' },
    });
    expect(await (await fetch('http://localhost:18789/')).text()).toBe('ok');
    expect(fixtures.logs()).toEqual([{ name: 'store', content: 'store up\n' }]);
    await fixtures.stop();
    await expect(fetch('http://localhost:18789/')).rejects.toThrow();
  });

  test('a fixture that exits before it is ready fails with its output', async () => {
    const fixtures = fixtureSet(
      {
        broken: {
          start: 'echo cannot bind; exit 1',
          ready: 'http://localhost:18790/',
        },
      },
      { root },
    );
    await expect(fixtures.ensure()).rejects.toThrow('cannot bind');
    await fixtures.stop();
  });

  test('names must work as host names', () => {
    expect(() => fixtureSet({ Store_1: { start: 'true' } }, { root })).toThrow(
      'lowercase',
    );
  });
});
