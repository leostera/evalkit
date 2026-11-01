/** A tool call that ran a shell command, read for display as a terminal. */
export type ShellView = {
  command: string;
  /** Where it ran, when the call says. */
  cwd?: string;
  /** Combined output, or stdout when stderr is separate. */
  output?: string;
  stderr?: string;
  exitCode?: number;
  /** The tool reported an error, or the command exited non-zero. */
  failed: boolean;
  /** Arguments other than the command and its directory, e.g. a timeout. */
  options: Array<[name: string, value: unknown]>;
};

const COMMAND_KEYS = ['command', 'cmd', 'script'];
const CWD_KEYS = ['cwd', 'workdir', 'directory', 'dir'];

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function commandText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (
    Array.isArray(value) &&
    value.length &&
    value.every((part) => typeof part === 'string')
  )
    return value
      .map((part: string) =>
        /^[\w./=:@%+-]+$/.test(part)
          ? part
          : `'${part.replace(/'/g, `'\\''`)}'`,
      )
      .join(' ');
  return undefined;
}

/** Text of an MCP-style `content: [{ type: 'text', text }]` list. */
function contentText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const texts = value
    .map((part) => record(part))
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part!.text as string);
  return texts.length ? texts.join('\n') : undefined;
}

function numberOf(
  value: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys)
    if (typeof value[key] === 'number') return value[key] as number;
  return undefined;
}

/**
 * Reads a tool call as a shell command when its arguments carry one
 * (`command`, `cmd` or `script`, as a string or an argv list), whatever the
 * tool is called. Results may be a string, `{ output }`, `{ stdout, stderr }`
 * or MCP-style `content`, with an optional exit code.
 */
export function shellView(
  args: unknown,
  result?: { value: unknown },
): ShellView | undefined {
  const input = record(args);
  if (!input) return undefined;
  const commandKey = COMMAND_KEYS.find((key) => commandText(input[key]));
  if (!commandKey) return undefined;
  const cwdKey = CWD_KEYS.find((key) => typeof input[key] === 'string');
  const view: ShellView = {
    command: commandText(input[commandKey])!,
    ...(cwdKey ? { cwd: input[cwdKey] as string } : {}),
    failed: false,
    options: Object.entries(input).filter(
      ([key]) => key !== commandKey && key !== cwdKey,
    ),
  };
  if (!result) return view;

  const value = result.value;
  const output = record(value);
  if (typeof value === 'string') return { ...view, output: value };
  if (!output) return view;
  const text =
    (typeof output.output === 'string' ? output.output : undefined) ??
    (typeof output.stdout === 'string' ? output.stdout : undefined) ??
    contentText(output.content) ??
    (typeof output.text === 'string' ? output.text : undefined);
  const stderr =
    typeof output.stderr === 'string' && output.stderr
      ? output.stderr
      : undefined;
  const exitCode = numberOf(output, [
    'exitCode',
    'exit_code',
    'code',
    'status',
  ]);
  return {
    ...view,
    ...(text === undefined ? {} : { output: text }),
    ...(stderr ? { stderr } : {}),
    ...(exitCode === undefined ? {} : { exitCode }),
    failed:
      output.isError === true ||
      output.is_error === true ||
      (exitCode !== undefined && exitCode !== 0),
  };
}
