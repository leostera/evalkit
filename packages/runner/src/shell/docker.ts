import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { collect, startLocalProcess } from './local-process.js';

/** Runs the container runtime's CLI and returns its trimmed stdout; throws with its stderr. */
export async function docker(
  runtime: string,
  args: readonly string[],
  options: { input?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const result = await collect(
    startLocalProcess([runtime, ...args], {
      cwd: process.cwd(),
      env: process.env,
      ...(options.input !== undefined ? { input: options.input } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    }),
  );
  if (result.exitCode !== 0)
    throw new Error(
      `${runtime} ${args[0]} failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  return result.stdout.trim();
}

const runtimes = new Map<string, Promise<void>>();

/** Checks once per process that the runtime's CLI and its daemon answer. */
export function ensureRuntime(runtime: string): Promise<void> {
  let checked = runtimes.get(runtime);
  if (!checked) {
    checked = docker(runtime, ['version', '--format', '{{.Server.Version}}'])
      .then(() => undefined)
      .catch((error: unknown) => {
        runtimes.delete(runtime);
        throw new Error(
          `Container isolation needs the ${runtime} CLI and a running engine, which did not answer: ${error instanceof Error ? error.message : String(error)}. Install and start Docker Desktop, OrbStack, Colima, Rancher Desktop or podman, or name another docker-compatible command with container({ runtime }).`,
        );
      });
    runtimes.set(runtime, checked);
  }
  return checked;
}

/** True for an image that names a Dockerfile (or its directory) rather than an image reference. */
export function isDockerfile(image: string): boolean {
  return (
    image.startsWith('./') ||
    image.startsWith('../') ||
    image.startsWith('/') ||
    /(^|\/)Dockerfile[^/]*$/i.test(image)
  );
}

const IGNORED = new Set(['node_modules', '.git', '_evalkit-results']);

/** A hash of a build context: each file's path, size and modification time. */
async function contextHash(directory: string, dockerfile: string) {
  const hash = createHash('sha256');
  hash.update(await readFile(dockerfile));
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const info = await stat(full);
        hash.update(
          `${path.relative(directory, full)}\0${info.size}\0${info.mtimeMs}\n`,
        );
      }
    }
  };
  await walk(directory);
  return hash.digest('hex').slice(0, 16);
}

const builds = new Map<string, Promise<string>>();

/**
 * The image a run's container starts from: a reference as it is, or a
 * Dockerfile built once per process and tagged by the hash of its
 * directory, reused while the directory is unchanged.
 */
export function resolveImage(
  runtime: string,
  image: string,
  projectRoot: string,
): Promise<string> {
  if (!isDockerfile(image)) return Promise.resolve(image);
  const target = path.resolve(projectRoot, image);
  const key = `${runtime}\0${target}`;
  let built = builds.get(key);
  if (!built) {
    built = (async () => {
      const info = await stat(target).catch(() => undefined);
      if (!info)
        throw new Error(
          `container() image ${image} is not an image name or a Dockerfile in the project: ${target} does not exist`,
        );
      const dockerfile = info.isDirectory()
        ? path.join(target, 'Dockerfile')
        : target;
      const context = path.dirname(dockerfile);
      const name =
        path
          .basename(context)
          .toLowerCase()
          .replace(/[^a-z0-9_.-]/g, '-')
          .replace(/^[^a-z0-9]+/, '') || 'image';
      const tag = `evalkit-${name}:${await contextHash(context, dockerfile)}`;
      const present = await docker(runtime, ['image', 'inspect', tag]).then(
        () => true,
        () => false,
      );
      if (!present)
        await docker(runtime, [
          'build',
          '-q',
          '-t',
          tag,
          '-f',
          dockerfile,
          context,
        ]);
      return tag;
    })();
    builds.set(key, built);
    built.catch(() => builds.delete(key));
  }
  return built;
}
