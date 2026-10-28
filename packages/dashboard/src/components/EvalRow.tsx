import { Button, Link, LinkButton, Table } from '@cloudflare/kumo';
import { ListBulletsIcon, PlayIcon } from '@phosphor-icons/react';
import type { CatalogEval, RunSummary } from '../api.js';
import { agentKey, agentName } from './agentName.js';
import { monoClass, tableLinkClass } from './DataTable.js';
import { runsHref } from './run-facets.js';
import { StatusBadge } from './StatusBadge.js';

export function EvalRow({
  id,
  evaluation,
  parameters = [],
  trials,
  onRun,
  runDisabled = false,
  onOpen,
  status,
  cellParameters,
}: {
  id: string;
  evaluation?: CatalogEval;
  parameters?: readonly unknown[];
  trials?: number;
  onRun?: () => void;
  runDisabled?: boolean;
  onOpen?: () => void;
  status?: RunSummary['status'];
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
          {onOpen ? (
            <button type="button" className={tableLinkClass} onClick={onOpen}>
              {name}
            </button>
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
          <Link
            href={`/agents?agent=${encodeURIComponent(agentKey(evaluation))}`}
          >
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
        {status ? (
          <Link href={runsLink} title="Show these runs">
            <StatusBadge status={status} />
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
              Run eval
            </Button>
          ) : null}
        </div>
      </Table.Cell>
    </Table.Row>
  );
}
