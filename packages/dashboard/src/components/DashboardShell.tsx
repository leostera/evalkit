import {
  LinkProvider,
  Sidebar,
  type LinkComponentProps,
} from '@cloudflare/kumo';
import {
  ClockCounterClockwiseIcon,
  FolderOpenIcon,
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
  /** Path prefixes that belong to this section. */
  matches: readonly string[];
};

const sections: readonly Section[] = [
  {
    label: 'Suites & evals',
    href: '/suites',
    icon: StackIcon,
    matches: ['/suites', '/evals'],
  },
  { label: 'Agents', href: '/agents', icon: RobotIcon, matches: ['/agents'] },
  {
    label: 'Fixtures',
    href: '/fixtures',
    icon: FolderOpenIcon,
    matches: ['/fixtures'],
  },
  {
    label: 'Runs',
    href: '/runs',
    icon: ClockCounterClockwiseIcon,
    matches: ['/runs', '/trials', '/workspaces'],
  },
];

function activeSection(pathname: string): Section {
  return (
    sections.find((section) =>
      section.matches.some((prefix) => pathname.startsWith(prefix)),
    ) ?? sections[0]!
  );
}

export function screenTitle(pathname: string): string {
  if (pathname.startsWith('/trials/')) return 'Trial detail';
  if (pathname.startsWith('/workspaces/')) return 'Candidate workspace';
  if (pathname.startsWith('/evals/')) return 'Eval detail';
  return activeSection(pathname).label;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const active = activeSection(pathname);
  return (
    <LinkProvider component={RouterLink}>
      <Sidebar.Provider collapsible="icon" defaultWidth={208} className="h-dvh">
        <Sidebar id="dashboard-navigation">
          <Sidebar.Header className="justify-between">
            <Link
              to="/suites"
              className="truncate text-sm font-semibold text-kumo-strong group-data-[state=collapsed]/sidebar:hidden"
            >
              EvalKit
            </Link>
            <Sidebar.Trigger className="navigation-toggle" />
          </Sidebar.Header>
          <Sidebar.Content>
            <nav aria-label="Dashboard">
              <Sidebar.Group>
                <Sidebar.Menu>
                  {sections.map((section) => (
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
            </nav>
          </Sidebar.Content>
        </Sidebar>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-kumo-line bg-kumo-base px-4 md:px-6">
            <Sidebar.Trigger className="md:hidden" />
            <h1 className="text-base font-semibold text-kumo-strong">
              {screenTitle(pathname)}
            </h1>
          </header>
          <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-4 md:px-6">
            {children}
          </div>
        </main>
      </Sidebar.Provider>
    </LinkProvider>
  );
}
