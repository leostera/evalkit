import { Table } from '@cloudflare/kumo';
import { Link } from 'react-router-dom';
import type { RunSummary } from '../api.js';
import { DataTable, monoClass, tableLinkClass } from './DataTable.js';
import { Empty } from './Empty.js';
import { CommitLabel } from './RunTable.js';

export type InvocationSummary = {
  id: string;
  startedAt: string;
  /** From the first run to the last finished one. */
  durationMs?: number;
  suites: string[];
  runs: number;
  passed: number;
  failed: number;
  errored: number;
  cancelled: number;
  running: number;
  source?: RunSummary['source'];
};

/** Groups runs by the `evalkit run` (or dashboard launch) that started them, newest first. */
export function invocationSummaries(
  runs: readonly RunSummary[],
): InvocationSummary[] {
  const byId = new Map<string, RunSummary[]>();
  for (const run of runs)
    if (run.invocationId)
      byId.set(run.invocationId, [...(byId.get(run.invocationId) ?? []), run]);
  return [...byId]
    .map(([id, members]) => {
      const started = members.map((run) => Date.parse(run.startedAt));
      const ended = members.flatMap((run) =>
        run.completedAt ? [Date.parse(run.completedAt)] : [],
      );
      const count = (status: RunSummary['status']) =>
        members.filter((run) => run.status === status).length;
      const first = Math.min(...started);
      return {
        id,
        startedAt: new Date(first).toISOString(),
        ...(ended.length ? { durationMs: Math.max(...ended) - first } : {}),
        suites: [
          ...new Set(
            members.flatMap((run) => (run.suiteId ? [run.suiteId] : [])),
          ),
        ].sort(),
        runs: members.length,
        passed: count('passed'),
        failed: count('failed'),
        errored: count('errored'),
        cancelled: count('cancelled'),
        running: count('running'),
        ...(members[0]!.source ? { source: members[0]!.source } : {}),
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function outcome(summary: InvocationSummary): string {
  return [
    `${summary.passed}/${summary.runs} passed`,
    summary.failed ? `${summary.failed} failed` : '',
    summary.errored ? `${summary.errored} errored` : '',
    summary.cancelled ? `${summary.cancelled} cancelled` : '',
    summary.running ? `${summary.running} running` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function InvocationTable({ runs }: { runs: RunSummary[] }) {
  const invocations = invocationSummaries(runs);
  if (!invocations.length)
    return (
      <Empty message="No invocations yet. Runs started with evalkit run or from this dashboard are grouped here." />
    );
  return (
    <DataTable>
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>Invocation</Table.Head>
          <Table.Head>Started</Table.Head>
          <Table.Head>Suites</Table.Head>
          <Table.Head>Result</Table.Head>
          <Table.Head>Duration</Table.Head>
          <Table.Head>Commit</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {invocations.map((invocation) => (
          <Table.Row key={invocation.id}>
            <Table.Cell>
              <Link
                className={`${tableLinkClass} ${monoClass}`}
                to={`/runs?invocation=${encodeURIComponent(invocation.id)}&status=${encodeURIComponent('"failed"')}&status=${encodeURIComponent('"errored"')}&status=${encodeURIComponent('"cancelled"')}`}
                title="Open its failed, errored and cancelled runs"
              >
                {invocation.id.slice(0, 8)}
              </Link>
            </Table.Cell>
            <Table.Cell className="whitespace-nowrap tabular-nums">
              {new Date(invocation.startedAt).toLocaleString()}
            </Table.Cell>
            <Table.Cell>{invocation.suites.join(', ') || '—'}</Table.Cell>
            <Table.Cell>
              <Link
                className={tableLinkClass}
                to={`/runs?invocation=${encodeURIComponent(invocation.id)}`}
              >
                {outcome(invocation)}
              </Link>
            </Table.Cell>
            <Table.Cell className="tabular-nums">
              {invocation.durationMs === undefined
                ? '—'
                : `${(invocation.durationMs / 1000).toFixed(1)}s`}
            </Table.Cell>
            <Table.Cell className="whitespace-nowrap">
              <CommitLabel source={invocation.source} />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </DataTable>
  );
}
