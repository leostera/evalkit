import type { CatalogEval } from '../api.js';
export function FixtureRow({
  fixture,
}: {
  fixture: CatalogEval['fixtures'][number] & { path: string };
}) {
  return (
    <tr>
      <td>{fixture.source}</td>
      <td>{fixture.destination ?? '—'}</td>
      <td>{fixture.visibility ?? 'dynamic'}</td>
      <td className="mono">{fixture.path}</td>
    </tr>
  );
}
