import { LayerCard } from '@cloudflare/kumo';
import type { CatalogEval } from '../api.js';
import { agentName } from './agentName.js';
import { monoClass } from './DataTable.js';
import { DetailList } from './DetailList.js';
import { Empty } from './Empty.js';

export function EvalDetail({
  catalog,
  path,
}: {
  catalog: CatalogEval[];
  path: string;
}) {
  const evaluation = catalog.find((entry) => entry.path === path);
  if (!evaluation) return <Empty message={`Eval not found: ${path}`} />;
  return (
    <LayerCard className="flex max-w-3xl flex-col gap-3 p-4">
      <div>
        <h2 className="text-base font-semibold text-kumo-strong">
          {evaluation.name ?? evaluation.id}
        </h2>
        <p className={`${monoClass} text-kumo-subtle`}>{evaluation.path}</p>
      </div>
      <DetailList
        items={[
          ['Agent', agentName(evaluation)],
          [
            'Runtimes',
            evaluation.agent.runtimes
              .map((runtime) => `${runtime.name} (${runtime.kind})`)
              .join(', ') || 'default',
          ],
          ['Trials', evaluation.trialCount],
          [
            'Scorers',
            evaluation.scorers
              .map((scorer) => `${scorer.name} (${scorer.kind})`)
              .join(', ') || 'none',
          ],
          [
            'Fixtures',
            evaluation.fixtures.map((fixture) => fixture.source).join(', ') ||
              'none',
          ],
        ]}
      />
    </LayerCard>
  );
}
