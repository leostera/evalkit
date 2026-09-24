import { expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('help for every CLI command works without a config, project discovery, or side effects', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'evalkit-help-'));
  try {
    const cli = resolve(import.meta.dir, 'index.ts');
    for (const args of [
      ['--help'],
      ['help'],
      ['run-evals', '--help'],
      ['run-evals', '--', '--help'],
      ['run-evals', '-h'],
      ['run-matrix', '--help'],
      ['run-suite', '--help'],
      ['serve-dashboard', '--help'],
    ]) {
      const child = Bun.spawn(['bun', cli, ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [out, err, status] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(status).toBe(0);
      expect(err).toBe('');
      expect(out).toContain('run-evals [eval-id,...]');
      expect(out).toContain('--dry-run');
    }
    const invalid = Bun.spawn(['bun', cli, 'run-evals', '--not-an-option'], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await invalid.exited).toBe(1);
    expect(await new Response(invalid.stderr).text()).toContain(
      'Unknown option',
    );
    expect(await readdir(cwd)).toEqual([]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
