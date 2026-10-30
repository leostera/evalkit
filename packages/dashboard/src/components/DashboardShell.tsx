import {
  LinkProvider,
  Sidebar,
  type LinkComponentProps,
} from '@cloudflare/kumo';
import {
  ClockCounterClockwiseIcon,
  FolderOpenIcon,
  ListChecksIcon,
  RobotIcon,
  StackIcon,
} from '@phosphor-icons/react';
import { forwardRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

/** Kumo renders links through this, so navigation stays client-side. */
const RouterLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(
  function RouterLink({ href = '/', ...props }, ref) {
    return <Link ref={ref} to={href} {...props} />;
  },
);

type Section = {
  label: string;
  href: string;
  icon: typeof StackIcon;
  /** Whether a path belongs to this section. */
  matches(pathname: string): boolean;
};

const under = (prefix: string) => (pathname: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Scenarios lead: a scenario's page lists its runs, a run's page its trials,
 * and a trial's page its trajectory, so every run and trial page belongs to
 * Scenarios. Runs and Invocations are the history across scenarios; Agents
 * and Datasets are what scenarios are built from.
 */
const groups: ReadonlyArray<{ label?: string; sections: readonly Section[] }> =
  [
    {
      sections: [
        {
          label: 'Scenarios',
          href: '/scenarios',
          icon: StackIcon,
          matches: (pathname) =>
            pathname === '/' ||
            under('/scenarios')(pathname) ||
            pathname.startsWith('/runs/'),
        },
      ],
    },
    {
      label: 'History',
      sections: [
        {
          label: 'Runs',
          href: '/runs',
          icon: ClockCounterClockwiseIcon,
          matches: (pathname) => pathname === '/runs',
        },
        {
          label: 'Invocations',
          href: '/invocations',
          icon: ListChecksIcon,
          matches: under('/invocations'),
        },
      ],
    },
    {
      label: 'Library',
      sections: [
        {
          label: 'Agents',
          href: '/agents',
          icon: RobotIcon,
          matches: under('/agents'),
        },
        {
          label: 'Datasets',
          href: '/datasets',
          icon: FolderOpenIcon,
          matches: under('/datasets'),
        },
      ],
    },
  ];

const sections = groups.flatMap((group) => group.sections);

function activeSection(pathname: string): Section {
  return sections.find((section) => section.matches(pathname)) ?? sections[0]!;
}

export function screenTitle(pathname: string): string {
  if (/^\/runs\/[^/]+\/trials\/[^/]+\/workspace$/.test(pathname))
    return 'Candidate workspace';
  if (/^\/runs\/[^/]+\/trials\//.test(pathname)) return 'Trial';
  if (pathname.startsWith('/runs/')) return 'Run';
  if (pathname.startsWith('/scenarios/')) return 'Scenario';
  return activeSection(pathname).label;
}

export function DashboardShell({
  children,
  header,
}: {
  children: ReactNode;
  /** Extra controls on the right of the page header. */
  header?: ReactNode;
}) {
  const { pathname } = useLocation();
  const active = activeSection(pathname);
  return (
    <LinkProvider component={RouterLink}>
      <Sidebar.Provider collapsible="icon" defaultWidth={208} className="h-dvh">
        <Sidebar id="dashboard-navigation">
          <Sidebar.Header className="justify-between">
            <Link
              to="/scenarios"
              className="truncate text-sm font-semibold text-kumo-strong group-data-[state=collapsed]/sidebar:hidden"
            >
              EvalKit
            </Link>
            <Sidebar.Trigger className="navigation-toggle" />
          </Sidebar.Header>
          <Sidebar.Content>
            <nav aria-label="Dashboard">
              {groups.map((group, index) => (
                <Sidebar.Group key={group.label ?? index}>
                  {group.label ? (
                    <Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
                  ) : null}
                  <Sidebar.Menu>
                    {group.sections.map((section) => (
                      <Sidebar.MenuButton
                        key={section.href}
                        href={section.href}
                        icon={section.icon}
                        active={section === active}
                        aria-current={section === active ? 'page' : undefined}
                        tooltip={section.label}
                      >
                        {section.label}
                      </Sidebar.MenuButton>
                    ))}
                  </Sidebar.Menu>
                </Sidebar.Group>
              ))}
            </nav>
          </Sidebar.Content>
        </Sidebar>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-kumo-line bg-kumo-base px-4 md:px-6">
            <Sidebar.Trigger className="md:hidden" />
            <h1 className="text-base font-semibold text-kumo-strong">
              {screenTitle(pathname)}
            </h1>
            {header}
          </header>
          <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-4 md:px-6">
            {children}
          </div>
        </main>
      </Sidebar.Provider>
    </LinkProvider>
  );
}
