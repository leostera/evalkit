import { cp, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../dashboard/dist/', import.meta.url));
const destination = fileURLToPath(
  new URL('../dist/dashboard/', import.meta.url),
);
await stat(new URL('../../dashboard/dist/index.html', import.meta.url));
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
