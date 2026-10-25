import { LayerCard, Table, cn } from '@cloudflare/kumo';
import type { ReactNode } from 'react';

/** Compact cell rhythm shared by every dashboard table. */
const denseTable = cn(
  'text-[13px] [&_td]:px-3 [&_td]:py-1.5 [&_tbody_tr]:border-t [&_tbody_tr]:border-kumo-hairline',
  '[&_th]:px-3 [&_th]:py-1.5 [&_th]:text-xs [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-kumo-subtle',
);
/** Data grids keep one line per row and scroll sideways instead of wrapping. */
const singleLine = '[&_td]:whitespace-nowrap';

/** A top-level table: a card that scrolls horizontally on narrow screens. */
export function DataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <LayerCard className={cn('data-table overflow-x-auto p-0', className)}>
      <Table className={cn(denseTable, singleLine)}>{children}</Table>
    </LayerCard>
  );
}

/**
 * A table inside an expanded row or a detail panel. Narrow evidence tables
 * (scorers, checkpoints) may `wrap` long names instead of scrolling.
 */
export function NestedTable({
  children,
  wrap = false,
}: {
  children: ReactNode;
  wrap?: boolean;
}) {
  return (
    <div className="nested overflow-x-auto rounded-md border border-kumo-hairline bg-kumo-base">
      <Table className={cn(denseTable, !wrap && singleLine)}>{children}</Table>
    </div>
  );
}

export function TableMessage({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <Table.Row>
      <Table.Cell colSpan={colSpan} className="text-kumo-subtle">
        {children}
      </Table.Cell>
    </Table.Row>
  );
}

/** The primary identity in a row: opens or expands the row's subject. */
export const tableLinkClass =
  'table-link cursor-pointer text-left font-medium text-kumo-link hover:underline focus-visible:outline-2 focus-visible:outline-kumo-brand rounded-sm';

/** IDs, paths and raw parameter values. */
export const monoClass = 'font-mono text-xs';
