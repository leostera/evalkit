import { expect, test } from 'bun:test';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newProject } from './new-project.js';

test('new . initializes an existing Bun project without clobbering its dependencies or files', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'evalkit-init-'));
  try {
    const pkg = {
      name: 'existing-project',
      private: true,
      dependencies: {
        '@leostera/evalkit':
          'git+https://github.com/leostera/evalkit.git#abc123',
        zod: '^4.0.0',
      },
      scripts: { test: 'bun test', dashboard: 'echo existing' },
    };
    await writeFile(join(cwd, 'package.json'), JSON.stringify(pkg));
    await writeFile(join(cwd, 'README.md'), 'Keep me!\n');
    await writeFile(join(cwd, '.gitignore'), 'custom/\n');
    await writeFile(
      join(cwd, 'tsconfig.json'),
      '{"compilerOptions":{"strict":false}}\n',
    );
    expect(await newProject(['.'], cwd)).toBe(cwd);
    const generated = JSON.parse(
      await readFile(join(cwd, 'package.json'), 'utf8'),
    ) as typeof pkg & { scripts: Record<string, string> };
    expect(generated.dependencies).toEqual(pkg.dependencies);
    expect(generated.scripts).toEqual({
      test: 'bun test',
      dashboard: 'echo existing',
      evals: 'evalkit run-evals greeting --local',
      matrix: 'evalkit run-matrix styles --local',
      'matrix:plan': 'evalkit run-matrix styles --dry-run',
      check: 'tsc --noEmit',
    });
    expect(await readFile(join(cwd, 'README.md'), 'utf8')).toBe('Keep me!\n');
    expect(await readFile(join(cwd, '.gitignore'), 'utf8')).toContain(
      'custom/\n',
    );
    expect(await readFile(join(cwd, 'tsconfig.json'), 'utf8')).toBe(
      '{"compilerOptions":{"strict":false}}\n',
    );
    expect(
      await readFile(join(cwd, 'evals/greeting.eval.ts'), 'utf8'),
    ).toContain('export default defineEval');
    await expect(newProject(['.'], cwd)).rejects.toThrow(
      'Scaffold file already exists',
    );
    expect(await readFile(join(cwd, 'README.md'), 'utf8')).toBe('Keep me!\n');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('new . adds the Git package to an existing project that has no EvalKit dependency', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'evalkit-existing-'));
  try {
    await mkdir(join(cwd, 'evals'));
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ name: 'my-project', dependencies: { hono: '^4.0.0' } }),
    );
    await newProject(['.'], cwd);
    const pkg = JSON.parse(
      await readFile(join(cwd, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toEqual({
      hono: '^4.0.0',
      '@leostera/evalkit': 'git+https://github.com/leostera/evalkit.git',
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('new . rejects existing config before touching an existing project', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'evalkit-conflict-'));
  try {
    await writeFile(join(cwd, 'package.json'), '{"name":"keep-this"}\n');
    await writeFile(join(cwd, 'evalkit.config.ts'), 'export default {};\n');
    await expect(newProject(['.'], cwd)).rejects.toThrow(
      'Scaffold file already exists',
    );
    expect(await readFile(join(cwd, 'package.json'), 'utf8')).toBe(
      '{"name":"keep-this"}\n',
    );
    expect((await readdir(cwd)).sort()).toEqual([
      'evalkit.config.ts',
      'package.json',
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('new creates a self-contained, provider-free project without overwriting files', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'evalkit-new-'));
  try {
    const root = await newProject(['./my-evals'], cwd);
    expect(root).toBe(join(cwd, 'my-evals'));
    expect((await readdir(root)).sort()).toEqual([
      '.gitignore',
      'README.md',
      'agents',
      'evalkit.config.ts',
      'evals',
      'fixtures',
      'judges',
      'package.json',
      'tsconfig.json',
    ]);
    const pkg = JSON.parse(
      await readFile(join(root, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@leostera/evalkit']).toBe(
      'git+https://github.com/leostera/evalkit.git',
    );
    expect(
      await readFile(join(root, 'evals/greeting.eval.ts'), 'utf8'),
    ).toContain("import { defineEval, file, user } from '@leostera/evalkit'");
    await expect(newProject(['my-evals'], cwd)).rejects.toThrow(
      'already exists',
    );
    await expect(newProject(['../escape'], cwd)).rejects.toThrow('Usage:');
    await expect(newProject([], cwd)).rejects.toThrow('Usage:');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
