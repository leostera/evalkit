import { readdir, stat } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { defineEvalMatrix, registerEvals, parseResourceUri, type EvalDefinition, type EvalkitConfig, type EvalRegistry } from '@evalkit/core';

const defaultInclude = ['**/*.eval.ts', '**/*.eval.js'];
const defaultExclude = ['**/node_modules/**', '**/.git/**', '**/_evalkit-*/**'];
async function exists(file: string) {
  try { return (await stat(file)).isFile(); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
function evaluation(value: unknown, source: string): EvalDefinition {
  if (!value || typeof value !== 'object') throw new Error(`${source} must default-export defineEval(...) or an array of evals`);
  const candidate = value as EvalDefinition;
  parseResourceUri(candidate.uri, 'eval');
  if (typeof candidate.agent?.start !== 'function' || !Array.isArray(candidate.transcript) || !Array.isArray(candidate.scoring))
    throw new Error(`Invalid eval exported by ${source}`);
  return candidate;
}
async function discover(root: string, config: EvalkitConfig): Promise<EvalDefinition[]> {
  const directory = resolve(root, config.testDir ?? 'evals');
  const includes = (config.include ?? defaultInclude).map(pattern => new Bun.Glob(pattern));
  const excludes = [...defaultExclude, ...(config.exclude ?? [])].map(pattern => new Bun.Glob(pattern));
  const paths: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const file = resolve(dir, entry.name);
      const rel = relative(directory, file).split(sep).join('/');
      if (entry.isSymbolicLink() || entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('_evalkit-')) continue;
      if (excludes.some(glob => glob.match(rel) || (entry.isDirectory() && glob.match(`${rel}/`)))) continue;
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && includes.some(glob => glob.match(rel))) paths.push(file);
    }
  }
  try { await walk(directory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Eval directory not found: ${directory}`);
    throw error;
  }
  const evals: EvalDefinition[] = [];
  for (const file of paths.sort()) {
    const module = await import(pathToFileURL(file).href);
    for (const value of Array.isArray(module.default) ? module.default : [module.default]) evals.push(evaluation(value, file));
  }
  if (!evals.length) throw new Error(`No eval files found in ${directory}`);
  return evals;
}

export type LoadedProject = { root: string; config: EvalkitConfig; registry: EvalRegistry };
export async function loadProject(cwd: string, configPath?: string): Promise<LoadedProject> {
  const candidates = configPath ? [resolve(cwd, configPath)] :
    ['evalkit.config.ts', 'evalkit.config.js', 'evalkit.config.mjs'].map(name => resolve(cwd, name));
  const present: string[] = [];
  for (const file of candidates) if (await exists(file)) present.push(file);
  if (configPath && !present.length) throw new Error(`Config not found: ${configPath}`);
  if (present.length > 1) throw new Error('Multiple Evalkit configs found; select one with --config');
  const file = present[0];
  const root = file ? dirname(file) : resolve(cwd);
  const config: EvalkitConfig = file ? (await import(pathToFileURL(file).href)).default : {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Config must default-export defineConfig({...})');
  for (const [key, value] of Object.entries(config.execution ?? {})) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error(`execution.${key} must be a positive integer`);
  }
  let registry = config.registry;
  if (!file && !configPath && await exists(resolve(root, 'src/registry.ts'))) {
    registry = (await import(pathToFileURL(resolve(root, 'src/registry.ts')).href)).default;
  }
  if (!registry) registry = registerEvals(config.evals ?? await discover(root, config));
  if (!registry?.evals || !registry.get) throw new Error('Invalid explicit eval registry');
  const slugs = new Set<string>();
  for (const e of registry.evals) {
    if (e.slug && slugs.has(e.slug)) throw new Error(`Duplicate eval slug: ${e.slug}`);
    if (e.slug) slugs.add(e.slug);
  }
  if (config.matrix) {
    const hex = createHash('sha256').update(JSON.stringify([config.matrix.slug ?? 'default', registry.evals.map(e => e.uri).sort()])).digest('hex');
    const uri = config.matrix.uri ?? `evalkit:matrix:${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
    const matrix = defineEvalMatrix({ ...config.matrix, uri, slug: config.matrix.slug ?? 'default', evals: registry.evals });
    if (registry.matrices.some(m => m.uri === uri)) throw new Error(`Duplicate matrix URI: ${uri}`);
    registry = { ...registry, matrices: [...registry.matrices, matrix] };
  }
  return { root, config, registry };
}
