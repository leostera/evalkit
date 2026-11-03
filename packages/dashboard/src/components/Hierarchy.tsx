import { Breadcrumbs } from '@cloudflare/kumo';
import { Fragment, type ReactNode } from 'react';
import type { RunSummary } from '../api.js';
import { runHref, runsListHref } from './links.js';

/**
 * Where a result page sits: Runs › Run › Workspace (or Attachments). Every
 * level above the current one links back up.
 */
export function HierarchyBreadcrumbs({ run }: { run: RunSummary }) {
  const levels: Array<{ label: ReactNode; href?: string }> = [
    { label: 'Runs', href: runsListHref },
    { label: `Run ${run.id.slice(0, 8)}`, href: runHref(run.id) },
  ];
  // Kumo's breadcrumbs grow to fill a flex column; the wrapper keeps them one line tall.
  return (
    <div className="shrink-0">
      <Breadcrumbs size="sm" className="hierarchy-breadcrumbs">
        {levels.map((level, index) => (
          <Fragment key={index}>
            {index ? <Breadcrumbs.Separator /> : null}
            {index === levels.length - 1 || !level.href ? (
              <Breadcrumbs.Current>{level.label}</Breadcrumbs.Current>
            ) : (
              <Breadcrumbs.Link href={level.href}>
                {level.label}
              </Breadcrumbs.Link>
            )}
          </Fragment>
        ))}
      </Breadcrumbs>
    </div>
  );
}

/** The page heading under the breadcrumbs: a title, its ID, and actions. */
export function PageHeading({
  title,
  subtitle,
  status,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-kumo-strong">
          {title}
          {status}
        </h2>
        {subtitle ? (
          <p className="truncate font-mono text-xs text-kumo-subtle">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
