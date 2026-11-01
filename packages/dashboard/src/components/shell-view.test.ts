import { expect, test } from 'bun:test';
import { shellView } from './shell-view.js';

test('a bash call with an exit code and output, as Pi records it', () => {
  expect(
    shellView(
      { command: 'dune build', timeout: 10 },
      {
        value: { isError: false, exitCode: 0, durationMs: 592, output: 'ok\n' },
      },
    ),
  ).toEqual({
    command: 'dune build',
    output: 'ok\n',
    exitCode: 0,
    failed: false,
    options: [['timeout', 10]],
  });
});

test('separate stdout and stderr, a working directory, and a failing exit', () => {
  expect(
    shellView(
      { cmd: 'make', cwd: '/work' },
      { value: { stdout: 'building', stderr: 'error: x', exit_code: 2 } },
    ),
  ).toEqual({
    command: 'make',
    cwd: '/work',
    output: 'building',
    stderr: 'error: x',
    exitCode: 2,
    failed: true,
    options: [],
  });
});

test('argv lists are quoted; MCP-style content and plain strings are read', () => {
  expect(
    shellView(
      { command: ['grep', '-r', 'hello world', '.'] },
      { value: { content: [{ type: 'text', text: 'a.ml' }], isError: true } },
    ),
  ).toMatchObject({
    command: "grep -r 'hello world' .",
    output: 'a.ml',
    failed: true,
  });
  expect(shellView({ script: 'ls' }, { value: 'a\nb' })).toMatchObject({
    command: 'ls',
    output: 'a\nb',
  });
});

test('calls without a command are not shell calls; no result yet is fine', () => {
  expect(shellView({ query: 'dune install' })).toBeUndefined();
  expect(shellView({ command: '' })).toBeUndefined();
  expect(shellView('ls')).toBeUndefined();
  expect(shellView({ command: 'sleep 9' })).toEqual({
    command: 'sleep 9',
    failed: false,
    options: [],
  });
});
