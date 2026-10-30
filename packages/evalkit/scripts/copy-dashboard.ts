import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../dashboard/dist/', import.meta.url));
const destination = fileURLToPath(
  new URL('../dist/dashboard/', import.meta.url),
);
await stat(new URL('../../dashboard/dist/index.html', import.meta.url));
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

// The bin runs on Bun when it is installed and on Node otherwise;
// EVALKIT_RUNTIME=node (or a path) picks one. The second line is a no-op
// string in JavaScript and an exec in sh.
const cli = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url));
const body = (await readFile(cli, 'utf8')).replace(/^#!.*\n/, '');
await writeFile(
  cli,
  `#!/bin/sh\n':' //; exec "\${EVALKIT_RUNTIME:-$(command -v bun || command -v node)}" "$0" "$@"\n${body}`,
);

// The EvalKit skills, for coding agents working in a project that installs EvalKit.
await cp(
  fileURLToPath(new URL('../../../.agents/skills/', import.meta.url)),
  fileURLToPath(new URL('../dist/skills/', import.meta.url)),
  { recursive: true },
);
