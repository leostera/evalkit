import { expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newProject } from './new-project.js';

test('new creates a self-contained, provider-free project without overwriting files', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'evalkit-new-'));
  try {
    const root = await newProject(['my-evals'], cwd);
    expect(root).toBe(join(cwd, 'my-evals'));
    expect((await readdir(root)).sort()).toEqual([
      '.gitignore',
      '.npmrc',
      'README.md',
      'evals',
      'package.json',
    ]);
    const pkg = JSON.parse(
      await readFile(join(root, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@leostera/evalkit']).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(await readFile(join(root, 'evals/hello.eval.ts'), 'utf8')).toContain(
      "import { defineAgent, defineEval, predicate, user } from '@leostera/evalkit'",
    );
    expect(await readFile(join(root, '.npmrc'), 'utf8')).toContain(
      '${GITHUB_PACKAGES_TOKEN}',
    );
    await expect(newProject(['my-evals'], cwd)).rejects.toThrow(
      'already exists',
    );
    await expect(newProject(['../escape'], cwd)).rejects.toThrow('Usage:');
    await expect(newProject([], cwd)).rejects.toThrow('Usage:');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
