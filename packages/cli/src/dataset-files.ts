import type { Dataset, EvalRegistry } from '@evalkit/core';
import {
  staticDatasetFile,
  staticDatasetFiles,
  type DatasetFileEntry,
} from '@evalkit/runner';

/** What the dashboard can browse of one dataset. */
export type DatasetListing =
  /** Files placed below `mount` in every trial workspace. */
  | { kind: 'static'; mount: string; files: DatasetFileEntry[] }
  /** Files come from `onLoad`/`onRun`; browse a trial's workspace instead. */
  | { kind: 'computed'; mount: string };

/** The project's datasets by ID; the first definition wins when IDs repeat. */
export function projectDatasets(registry: EvalRegistry): Map<string, Dataset> {
  const byId = new Map<string, Dataset>();
  for (const evaluation of registry.evals)
    for (const dataset of evaluation.datasets ?? [])
      if (!byId.has(dataset.id)) byId.set(dataset.id, dataset);
  return byId;
}

export async function datasetListing(
  dataset: Dataset,
  root: string,
): Promise<DatasetListing> {
  const files = await staticDatasetFiles(dataset, root);
  return files
    ? { kind: 'static', mount: dataset.mount, files }
    : { kind: 'computed', mount: dataset.mount };
}

export { staticDatasetFile as datasetFile };
