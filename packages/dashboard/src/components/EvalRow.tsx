import { Button, Link, LinkButton, Table } from '@cloudflare/kumo';
import { ListBulletsIcon, PlayIcon } from '@phosphor-icons/react';
import type { CatalogEval, RunSummary } from '../api.js';
import { agentKey, agentName } from './agentName.js';
import { monoClass, tableLinkClass } from './DataTable.js';
import { agentHref, runHref, scenarioHref } from './links.js';
import { runsHref } from './run-facets.js';
import { StatusBadge } from './StatusBadge.js';

export function EvalRow({
  id,
  evaluation,
  parameters = [],
  trials,
  onRun,
  runDisabled = false,
  latestRun,
  cellParameters,
}: {
  id: string;
  evaluation?: CatalogEval;
  parameters?: readonly unknown[];
  trials?: number;
  onRun?: () => void;
  runDisabled?: boolean;
  /** The newest run of this scenario (or matrix cell); its badge opens it. */
  latestRun?: RunSummary;
  /** The matrix cell's parameters, used to filter the linked runs page. */
  cellParameters?: Record<string, unknown>;
}) {
  const runsLink = runsHref(evaluation?.id ?? id, cellParameters);
  const name = evaluation?.name ?? id;
  const path = evaluation?.path ?? id;
  return (
    <Table.Row>
      <Table.Cell>
        <div className="flex flex-col">
          {evaluation ? (
            <Link href={scenarioHref(evaluation.id)} className={tableLinkClass}>
              {name}
            </Link>
          ) : (
            <span className="font-medium">{name}</span>
          )}
          {path !== name ? (
            <span className={`${monoClass} text-kumo-subtle`}>{path}</span>
          ) : null}
        </div>
      </Table.Cell>
      {parameters.map((value, index) => (
        <Table.Cell key={index} className={monoClass}>
          {typeof value === 'string' ? value : JSON.stringify(value)}
        </Table.Cell>
      ))}
      <Table.Cell>
        {evaluation ? (
          <Link href={agentHref(agentKey(evaluation))}>
            {agentName(evaluation)}
          </Link>
        ) : (
          agentName(evaluation)
        )}
      </Table.Cell>
      <Table.Cell>
        {evaluation?.agent.runtimes.map((runtime) => runtime.name).join(', ') ||
          'default'}
      </Table.Cell>
      <Table.Cell className="tabular-nums">
        {trials ?? evaluation?.trialCount ?? '—'}
      </Table.Cell>
      <Table.Cell>
        {latestRun ? (
          <Link href={runHref(latestRun.id)} title="Open the latest run">
            <StatusBadge status={latestRun.status} />
          </Link>
        ) : (
          '—'
        )}
      </Table.Cell>
      <Table.Cell className="text-right">
        <div className="inline-flex items-center justify-end gap-2">
          <LinkButton
            size="xs"
            variant="secondary"
            icon={<ListBulletsIcon />}
            href={runsLink}
          >
            Runs
          </LinkButton>
          {onRun || runDisabled ? (
            <Button
              size="xs"
              variant="secondary"
              icon={<PlayIcon weight="fill" />}
              disabled={runDisabled}
              title={
                runDisabled
                  ? 'Matrix configuration is still loading'
                  : undefined
              }
              onClick={(event) => {
                event.stopPropagation();
                onRun?.();
              }}
            >
              Run
            </Button>
          ) : null}
        </div>
      </Table.Cell>
    </Table.Row>
  );
}
