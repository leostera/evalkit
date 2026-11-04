import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPackageManager, evalkitCommand } from './package-manager.js';

describe('detectPackageManager', () => {
  test('prefers the manager that started the process', () => {
    expect(detectPackageManager('/', 'pnpm/9.0.0 npm/? node/v22')).toBe('pnpm');
  });

  test("reads the nearest lockfile, up to a workspace's root", async () => {
    const root = await mkdtemp(join(tmpdir(), 'evalkit-pm-'));
    await writeFile(join(root, 'pnpm-lock.yaml'), '');
    const project = join(root, 'packages', 'evals');
    await mkdir(project, { recursive: true });
    expect(detectPackageManager(project, '')).toBe('pnpm');
  });

  test('suggests a command each manager runs as written', () => {
    expect(evalkitCommand('pnpm', 'dev')).toBe('pnpm run evalkit dev');
    expect(evalkitCommand('npm', 'dev')).toBe('npm run evalkit -- dev');
  });
});
