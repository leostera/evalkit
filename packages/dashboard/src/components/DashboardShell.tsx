import {
  LinkProvider,
  Sidebar,
  type LinkComponentProps,
} from '@cloudflare/kumo';
import {
  ChatsCircleIcon,
  ClockCounterClockwiseIcon,
  DatabaseIcon,
  FolderOpenIcon,
  GavelIcon,
  ListChecksIcon,
  RobotIcon,
  SquaresFourIcon,
  StackIcon,
} from '@phosphor-icons/react';
import { forwardRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ProjectInfo } from '../api.js';

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
 * Evals are results, from the overview down: the scoreboard, then runs,
 * trials, and the workspaces trials ran in. Run and trial pages belong to
 * Runs and Trials. The library is what scenarios are built from, each item
 * with its own page.
 */
const groups: ReadonlyArray<{ label: string; sections: readonly Section[] }> = [
  {
    label: 'Evals',
    sections: [
      {
        label: 'Scoreboard',
        href: '/scoreboard',
        icon: SquaresFourIcon,
        matches: (pathname) =>
          pathname === '/' || under('/scoreboard')(pathname),
      },
      {
        label: 'Runs',
        href: '/runs',
        icon: ClockCounterClockwiseIcon,
        matches: (pathname) =>
          under('/runs')(pathname) && !/\/trials\//.test(pathname),
      },
      {
        label: 'Trials',
        href: '/trials',
        icon: ListChecksIcon,
        matches: (pathname) =>
          under('/trials')(pathname) ||
          (/^\/runs\/[^/]+\/trials\//.test(pathname) &&
            !pathname.endsWith('/workspace')),
      },
      {
        label: 'Workspaces',
        href: '/workspaces',
        icon: FolderOpenIcon,
        matches: (pathname) =>
          under('/workspaces')(pathname) || pathname.endsWith('/workspace'),
      },
    ],
  },
  {
    label: 'Library',
    sections: [
      {
        label: 'Agents',
        href: '/library/agents',
        icon: RobotIcon,
        matches: under('/library/agents'),
      },
      {
        label: 'Judges',
        href: '/library/judges',
        icon: GavelIcon,
        matches: under('/library/judges'),
      },
      {
        label: 'Scenarios',
        href: '/library/scenarios',
        icon: ChatsCircleIcon,
        matches: under('/library/scenarios'),
      },
      {
        label: 'Datasets',
        href: '/library/datasets',
        icon: DatabaseIcon,
        matches: under('/library/datasets'),
      },
    ],
  },
];

const FILTERED_LISTS = new Set(['/runs', '/trials', '/workspaces']);

const sections = groups.flatMap((group) => group.sections);

function activeSection(pathname: string): Section {
  return sections.find((section) => section.matches(pathname)) ?? sections[0]!;
}

export function screenTitle(pathname: string): string {
  if (/^\/runs\/[^/]+\/trials\/[^/]+\/workspace$/.test(pathname))
    return 'Candidate workspace';
  if (/^\/runs\/[^/]+\/trials\//.test(pathname)) return 'Trial';
  if (pathname.startsWith('/runs/')) return 'Run';
  return activeSection(pathname).label;
}

/** The repository and commit being shown, at the top of the sidebar. */
function ProjectLabel({ project }: { project?: ProjectInfo | null }) {
  if (!project)
    return (
      <span className="truncate text-sm font-semibold text-kumo-strong">
        EvalKit
      </span>
    );
  const repo = project.repo.split('/').slice(1).join('/') || project.repo;
  return (
    <span
      className="project-label flex min-w-0 flex-col leading-tight"
      title={`${project.repo}${project.project ? `/${project.project}` : ''} at ${project.commit}${project.ref ? ` (${project.ref})` : ''}${project.dirty ? ', with uncommitted changes' : ''}`}
    >
      <span className="truncate text-sm font-semibold text-kumo-strong">
        {repo}
        <span className="font-mono font-normal text-kumo-subtle">
          #{project.commit.slice(0, 7)}
        </span>
      </span>
      <span className="truncate text-xs text-kumo-subtle">
        {[project.project, project.ref, project.dirty ? 'dirty' : undefined]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </span>
  );
}

export function DashboardShell({
  children,
  header,
  project,
}: {
  children: ReactNode;
  /** Extra controls on the right of the page header. */
  header?: ReactNode;
  project?: ProjectInfo | null;
}) {
  const { pathname, search } = useLocation();
  const active = activeSection(pathname);
  // Runs, Trials and Workspaces share one set of filters; moving between
  // their lists keeps it.
  const hrefFor = (section: Section) =>
    FILTERED_LISTS.has(pathname) && FILTERED_LISTS.has(section.href)
      ? `${section.href}${search}`
      : section.href;
  return (
    <LinkProvider component={RouterLink}>
      <Sidebar.Provider collapsible="icon" defaultWidth={208} className="h-dvh">
        <Sidebar id="dashboard-navigation">
          <Sidebar.Header className="justify-between">
            <Link
              to="/scoreboard"
              className="min-w-0 group-data-[state=collapsed]/sidebar:hidden"
            >
              <ProjectLabel project={project} />
            </Link>
            <Sidebar.Trigger className="navigation-toggle" />
          </Sidebar.Header>
          <Sidebar.Content>
            <nav aria-label="Dashboard">
              {groups.map((group, index) => (
                <Sidebar.Group key={group.label ?? index}>
                  <Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
                  <Sidebar.Menu>
                    {group.sections.map((section) => (
                      <Sidebar.MenuButton
                        key={section.href}
                        href={hrefFor(section)}
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
