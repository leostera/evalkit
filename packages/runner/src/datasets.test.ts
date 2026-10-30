import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineDataset } from '@evalkit/core';
import { staticDatasetFile, staticDatasetFiles } from './datasets.js';

test('static datasets list and read their files, never outside the dataset', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-datasets-'));
  try {
    await mkdir(join(root, 'data', 'docs'), { recursive: true });
    await writeFile(join(root, 'data', 'docs', 'a.md'), 'alpha');
    await writeFile(join(root, 'secret.txt'), 'nope');
    const directory = defineDataset({ id: 'docs', files: 'data' });
    expect(await staticDatasetFiles(directory, root)).toEqual([
      { path: 'docs/a.md', size: 5 },
    ]);
    expect(
      new TextDecoder().decode(
        await staticDatasetFile(directory, root, 'docs/a.md'),
      ),
    ).toBe('alpha');
    await expect(
      staticDatasetFile(directory, root, '../secret.txt'),
    ).rejects.toThrow('has no file');

    const inline = defineDataset({
      id: 'inline',
      files: { 'b.txt': 'bee', 'c.txt': { file: 'secret.txt' } },
    });
    expect(await staticDatasetFiles(inline, root)).toEqual([
      { path: 'b.txt', size: 3 },
      { path: 'c.txt', size: 4 },
    ]);
    await expect(staticDatasetFile(inline, root, 'd.txt')).rejects.toThrow(
      'has no file',
    );

    // Computed datasets are never run just to browse them.
    let loaded = false;
    const computed = defineDataset({
      id: 'computed',
      onLoad: () => {
        loaded = true;
        return {};
      },
    });
    expect(await staticDatasetFiles(computed, root)).toBeUndefined();
    expect(loaded).toBe(false);
    expect(
      await staticDatasetFiles(defineDataset({ id: 'v', value: 1 }), root),
    ).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
