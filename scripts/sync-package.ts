import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Git installations cannot depend on install-time build scripts. Commit this
// prebuilt artifact so the public repository itself is an installable package.
const root = join(import.meta.dir, '..');
await rm(join(root, 'dist'), { recursive: true, force: true });
await cp(join(root, 'packages/evalkit/dist'), join(root, 'dist'), {
  recursive: true,
});
console.log('Synced the Git-installable EvalKit package to dist/.');
