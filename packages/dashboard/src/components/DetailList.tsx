import type { ReactNode } from 'react';

/** Two-column key/value list for metadata. */
export function DetailList({
  items,
}: {
  items: ReadonlyArray<readonly [label: string, value: ReactNode]>;
}) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-kumo-subtle">{label}</dt>
          <dd className="min-w-0 break-words text-kumo-default">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
