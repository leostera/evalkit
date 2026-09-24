import type { CatalogEval } from '../api.js';
import { Empty } from './Empty.js';
import { FixtureRow } from './FixtureRow.js';
export function FixtureTable({ catalog }: { catalog: CatalogEval[] }) {
  const fixtures = catalog.flatMap((evaluation) =>
    evaluation.fixtures.map((fixture) => ({
      ...fixture,
      path: evaluation.path,
    })),
  );
  if (!fixtures.length) return <Empty message="No fixtures are registered." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Source</th>
            <th>Destination</th>
            <th>Visibility</th>
            <th>Used by</th>
          </tr>
        </thead>
        <tbody>
          {fixtures.map((fixture, index) => (
            <FixtureRow key={`${fixture.path}-${fixture.id}-${index}`} fixture={fixture} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
