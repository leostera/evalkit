import { Button, Table } from '@cloudflare/kumo';
import { CaretRightIcon, PlayIcon } from '@phosphor-icons/react';
import type { SuiteSummary } from '../api.js';
import { tableLinkClass } from './DataTable.js';

export function SuiteRow({
  suite,
  expanded,
  onToggle,
  onRun,
}: {
  suite: SuiteSummary;
  expanded: boolean;
  onToggle(): void;
  onRun?: () => void;
}) {
  return (
    <Table.Row variant={expanded ? 'selected' : 'default'}>
      <Table.Cell>
        <button
          type="button"
          className={`${tableLinkClass} inline-flex items-center gap-1.5`}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <CaretRightIcon
            aria-hidden
            className={`size-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          {suite.name ?? suite.id ?? 'Unnamed suite'}
        </button>
      </Table.Cell>
      <Table.Cell className="tabular-nums">{suite.evalIds.length}</Table.Cell>
      <Table.Cell className="text-right">
        <Button
          size="xs"
          variant="secondary"
          icon={<PlayIcon weight="fill" />}
          disabled={!onRun}
          title={
            onRun ? undefined : 'Run matrix cells individually from their rows'
          }
          onClick={(event) => {
            event.stopPropagation();
            onRun?.();
          }}
        >
          Run suite
        </Button>
      </Table.Cell>
    </Table.Row>
  );
}
