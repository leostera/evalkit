import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import {
  defineEval,
  lastReply,
  sandboxExec,
  toolCalls,
  user,
  type AutAdapter,
  type Isolation,
} from '@evalkit/core';
import { localReportStore, readRunTranscript, runEval } from '@evalkit/runner';
import {
  claudeCodeAgent,
  codexAgent,
  opencodeAgent,
  piAgent,
} from './index.js';

const fixtures = path.join(import.meta.dir, 'fixtures');
const roots: string[] = [];
afterEach(async () => {
  for (const dir of roots.splice(0))
    await rm(dir, { recursive: true, force: true });
});

/**
 * A stand-in CLI: it logs its arguments, stdin and environment, then
 * writes a real session record where the real CLI would.
 */
async function fakeCli(dir: string, body: string): Promise<string> {
  const file = path.join(dir, 'fake-cli');
  await writeFile(
    file,
    `#!/bin/sh
LOG=${JSON.stringify(path.join(dir, 'calls.log'))}
FIXTURES=${JSON.stringify(fixtures)}
input=$(cat)
{
  echo "argv: $*"
  echo "stdin: $input"
  echo "secret: \${FAKE_SECRET:-none}"
} >> "$LOG"
arg() { prev=; for a in "$@"; do [ "$prev" = "$WANT" ] && { echo "$a"; return; }; prev=$a; done; }
${body}
`,
  );
  await chmod(file, 0o755);
  return file;
}

async function runTwoTurns(
  agent: AutAdapter,
  dir: string,
  isolation?: Isolation,
) {
  const scenario = defineEval({
    id: 'harness',
    agent,
    transcript: [user('Write hi to hello.txt.'), user('Now say done.')],
    scoring: [],
  });
  const [result] = await Effect.runPromise(
    runEval(scenario, {
      report: localReportStore(path.join(dir, 'reports')),
      workspaceRoot: path.join(dir, 'sandbox'),
      root: dir,
      ...(isolation ? { isolation } : {}),
      parameters: { model: 'anthropic/claude-sonnet-4-5' },
    }),
  );
  const transcript = await readRunTranscript(
    path.join(dir, 'reports'),
    result!.runId,
  );
  const calls = await readFile(path.join(dir, 'calls.log'), 'utf8');
  const log = await readFile(
    path.join(
      dir,
      'reports',
      result!.runId,
      'artifacts',
      'attachments',
      'logs',
      `${agent.identity?.id}.log`,
    ),
    'utf8',
  );
  return { result: result!, transcript: transcript!, calls, log };
}

async function root() {
  const dir = await mkdtemp(path.join(tmpdir(), 'evalkit-harness-'));
  roots.push(dir);
  return dir;
}

describe('coding-agent harnesses', () => {
  test('piAgent: private config, one session, stdin, the session imported', async () => {
    const dir = await root();
    const command = await fakeCli(
      dir,
      `case "$*" in *--version*) exit 0;; esac
WANT=--session-dir; sessions=$(arg "$@")
WANT=--session-id; id=$(arg "$@")
echo "config: $PI_CODING_AGENT_DIR $(cat "$PI_CODING_AGENT_DIR/auth.json")" >> "$LOG"
mkdir -p "$sessions" && cp "$FIXTURES/pi.jsonl" "$sessions/2026-11-04T10-00-00-000Z_$id.jsonl"
echo Done.`,
    );
    const { result, transcript, calls, log } = await runTwoTurns(
      piAgent({
        command,
        // A matrix cell's model.
        model: ({ model }) => String(model),
        skills: ['/skills/review'],
        configFiles: { 'auth.json': '{"token":"t"}' },
        env: { FAKE_SECRET: 'passed' },
      }),
      dir,
    );
    expect(result.status).toBe('passed');
    const argvs = calls.split('\n').filter((line) => line.startsWith('argv:'));
    expect(argvs).toHaveLength(2);
    expect(argvs[0]).toContain('--print');
    expect(argvs[0]).toContain('--no-extensions -e builtin:mcp');
    expect(argvs[0]).toContain('--model anthropic/claude-sonnet-4-5');
    expect(argvs[0]).toContain('--skill /skills/review');
    // The same session both turns.
    const ids = argvs.map((line) => /--session-id (\S+)/.exec(line)?.[1]);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
    expect(calls).toContain('stdin: Write hi to hello.txt.');
    expect(calls).toContain('stdin: Now say done.');
    expect(calls).toContain('secret: passed');
    expect(calls).toMatch(/config: \S+\/home\/pi\/config \{"token":"t"\}/);
    expect(toolCalls({ transcript }).map((call) => call.name)).toEqual([
      'write',
    ]);
    expect(lastReply({ transcript })).toBe('Done.');
    expect(log).toContain('turn 2, exit 0');
  });

  test('codexAgent: learns the thread, resumes it, imports the rollout', async () => {
    const dir = await root();
    const command = await fakeCli(
      dir,
      `id=019a3b4c-0000-7000-8000-000000000001
echo '{"type":"thread.started","thread_id":"'$id'"}'
mkdir -p "$CODEX_HOME/sessions/2026/10/29"
cp "$FIXTURES/codex.jsonl" "$CODEX_HOME/sessions/2026/10/29/rollout-2026-10-29T12-00-00-$id.jsonl"`,
    );
    const { result, transcript, calls } = await runTwoTurns(
      codexAgent({ command, model: 'gpt-5' }),
      dir,
    );
    expect(result.status).toBe('passed');
    const argvs = calls.split('\n').filter((line) => line.startsWith('argv:'));
    expect(argvs[0]).toBe(
      'argv: exec --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --model gpt-5 -',
    );
    expect(argvs[1]).toStartWith(
      'argv: exec resume 019a3b4c-0000-7000-8000-000000000001 --json',
    );
    expect(toolCalls({ transcript }).length).toBeGreaterThan(0);
  });

  test('opencodeAgent: standalone, private XDG directories, the export imported', async () => {
    const dir = await root();
    const command = await fakeCli(
      dir,
      `case "$1" in
  run) echo "xdg: $XDG_CONFIG_HOME $XDG_DATA_HOME" >> "$LOG"
       echo '{"type":"step_start","sessionID":"ses_7f3a1c2b9e01"}';;
  session) cat "$FIXTURES/opencode.json";;
esac`,
    );
    const { result, transcript, calls } = await runTwoTurns(
      opencodeAgent({ command, model: 'openai/gpt-5', agent: 'build' }),
      dir,
    );
    expect(result.status).toBe('passed');
    const argvs = calls.split('\n').filter((line) => line.startsWith('argv:'));
    expect(argvs).toEqual([
      'argv: run --standalone --format json --auto --model openai/gpt-5 --agent build',
      'argv: session export --standalone ses_7f3a1c2b9e01',
      'argv: run --standalone --format json --auto --session ses_7f3a1c2b9e01 --model openai/gpt-5 --agent build',
      'argv: session export --standalone ses_7f3a1c2b9e01',
    ]);
    expect(calls).toMatch(
      /xdg: \S+\/home\/opencode\/config\/config \S+\/home\/opencode\/config\/data/,
    );
    expect(toolCalls({ transcript }).length).toBeGreaterThan(0);
  });

  test('claudeCodeAgent: a session ID, then --resume, the session file imported', async () => {
    const dir = await root();
    const command = await fakeCli(
      dir,
      `WANT=--session-id; id=$(arg "$@")
[ -z "$id" ] && { WANT=--resume; id=$(arg "$@"); }
mkdir -p "$CLAUDE_CONFIG_DIR/projects/-work"
cp "$FIXTURES/claude-code.jsonl" "$CLAUDE_CONFIG_DIR/projects/-work/$id.jsonl"
echo '{"type":"result","result":"done"}'`,
    );
    const { result, transcript, calls } = await runTwoTurns(
      claudeCodeAgent({ command, appendSystemPrompt: 'Be brief.' }),
      dir,
    );
    expect(result.status).toBe('passed');
    const argvs = calls.split('\n').filter((line) => line.startsWith('argv:'));
    const id = /--session-id (\S+)/.exec(argvs[0]!)?.[1];
    expect(id).toBeTruthy();
    expect(argvs[0]).toContain('--dangerously-skip-permissions');
    expect(argvs[0]).toContain('--append-system-prompt Be brief.');
    expect(argvs[1]).toContain(`--resume ${id}`);
    expect(toolCalls({ transcript }).length).toBeGreaterThan(0);
  });

  test.if(process.platform === 'darwin')(
    'piAgent inside sandboxExec: the private home is usable, the project is not',
    async () => {
      const dir = await root();
      const command = await fakeCli(
        dir,
        `WANT=--session-dir; sessions=$(arg "$@")
WANT=--session-id; id=$(arg "$@")
cat ${JSON.stringify(path.join('$PWD', '..', '..', '..', 'package.json'))} >/dev/null 2>&1 && echo "project: readable" >> "$LOG"
mkdir -p "$sessions" && cp "$FIXTURES/pi.jsonl" "$sessions/x_$id.jsonl"
echo Done.`,
      );
      await writeFile(path.join(dir, 'package.json'), '{}');
      await writeFile(path.join(dir, 'calls.log'), '');
      const { result, transcript, calls } = await runTwoTurns(
        piAgent({ command }),
        dir,
        // The stand-in and its log are in the project, which the sandbox hides.
        sandboxExec({
          read: [fixtures, command],
          allow: [path.join(dir, 'calls.log')],
        }),
      );
      expect(result.status).toBe('passed');
      expect(calls).not.toContain('project: readable');
      expect(toolCalls({ transcript }).map((call) => call.name)).toEqual([
        'write',
      ]);
    },
  );

  test('options may be picked per run from its context', async () => {
    const dir = await root();
    const command = await fakeCli(
      dir,
      `WANT=--session-dir; sessions=$(arg "$@")
WANT=--session-id; id=$(arg "$@")
mkdir -p "$sessions" && cp "$FIXTURES/pi.jsonl" "$sessions/x_$id.jsonl"
echo Done.`,
    );
    const { result, calls } = await runTwoTurns(
      piAgent((context) => ({
        command,
        skills: [`/skills/${String(context.parameters?.model)}`],
        env: { FAKE_SECRET: context.runId },
      })),
      dir,
    );
    expect(result.status).toBe('passed');
    expect(calls).toContain('--skill /skills/anthropic/claude-sonnet-4-5');
    expect(calls).toContain(`secret: ${result.runId}`);
  });

  test('a failing CLI fails the run with its error, keeping what it did', async () => {
    const dir = await root();
    const command = await fakeCli(
      dir,
      `WANT=--session-dir; sessions=$(arg "$@")
WANT=--session-id; id=$(arg "$@")
mkdir -p "$sessions" && cp "$FIXTURES/pi.jsonl" "$sessions/x_$id.jsonl"
echo "provider not configured" >&2; exit 3`,
    );
    const { result, transcript } = await runTwoTurns(piAgent({ command }), dir);
    expect(result.status).toBe('errored');
    expect(JSON.stringify(result)).toContain('provider not configured');
    expect(toolCalls({ transcript }).map((call) => call.name)).toEqual([
      'write',
    ]);
  });
});
