import { expect, test } from 'bun:test';
import { fileTree, formatBytes } from './FileTree.js';

test('nests flat paths, with directories implied by their files', () => {
  const root = fileTree([
    { path: 'src', kind: 'directory' },
    { path: 'src/a.ts', kind: 'file', size: 10 },
    { path: 'docs/guide/b.md', kind: 'file', size: 2048 },
    { path: 'empty', kind: 'directory' },
  ]);
  expect([...root.children!.keys()]).toEqual(['src', 'docs', 'empty']);
  expect(root.children!.get('src')!.children!.get('a.ts')).toEqual({
    name: 'a.ts',
    path: 'src/a.ts',
    size: 10,
  });
  const guide = root.children!.get('docs')!.children!.get('guide')!;
  expect(guide.path).toBe('docs/guide');
  expect(guide.children!.get('b.md')!.size).toBe(2048);
  expect(root.children!.get('empty')!.children!.size).toBe(0);
  expect([formatBytes(10), formatBytes(2048), formatBytes(undefined)]).toEqual([
    '10 B',
    '2.0 KB',
    '',
  ]);
});
