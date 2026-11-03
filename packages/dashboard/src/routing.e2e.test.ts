import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const port = 5174;
const baseUrl = `http://127.0.0.1:${port}`;
let server: Bun.Subprocess;
let browser: Browser;

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await Bun.sleep(100);
  }
  throw new Error('Dashboard preview server did not start');
}

/** Kumo renders breadcrumbs twice (phone and wide layouts); click the visible copy. */
async function clickVisible(page: Page, selector: string): Promise<void> {
  await page.$$eval(selector, (nodes) => {
    const node = nodes.find(
      (candidate) => (candidate as HTMLElement).offsetParent !== null,
    );
    if (!(node instanceof HTMLElement))
      throw new Error('No visible element matched');
    node.click();
  });
}

async function waitForPath(page: Page, pathname: string): Promise<void> {
  await page.waitForFunction(
    (expected) => location.pathname === expected,
    {},
    pathname,
  );
}

beforeAll(async () => {
  await Bun.$`bun run --filter @evalkit/dashboard build`;
  server = Bun.spawn(
    ['bunx', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: import.meta.dir.replace('/src', ''),
      stdout: 'ignore',
      stderr: 'pipe',
    },
  );
  await waitForServer();
  // GitHub-hosted Ubuntu runners cannot use Chrome's sandbox. Only the
  // localhost dashboard test browser runs without it; keep local defaults.
  browser = await puppeteer.launch({
    headless: true,
    args: process.env.CI === 'true' ? ['--no-sandbox'] : [],
  });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  server?.kill();
});

describe('dashboard URL routing', () => {
  test('walks scenario, run and workspace pages and back up; old links redirect', async () => {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      const responses: Record<string, unknown> = {
        '/v1/matrix': { matrix: null },
        '/v1/catalog': {
          evals: [
            {
              id: 'greeting',
              path: 'starter#greeting',
              name: 'Greeting',
              repeat: 2,
              agent: { kind: 'test', runtimes: [] },
              datasets: [],
              scorers: [],
            },
          ],
        },
        '/v1/evals': {
          evals: [
            {
              id: 'greeting',
              name: 'Greeting',
              suiteId: 'starter',
            },
          ],
        },
        '/v1/suites': {
          suites: [
            {
              id: 'starter',
              name: 'Starter',
              evalIds: ['greeting'],
            },
          ],
        },
        '/v1/runs': {
          runs: [
            {
              id: 'run-123',
              evalId: 'greeting',
              suiteId: 'starter',
              status: 'passed',
              startedAt: new Date().toISOString(),
              batch: { id: 'batch-1', index: 0, size: 2 },
              score: 1,
            },
            {
              id: 'run-456',
              evalId: 'greeting',
              suiteId: 'starter',
              status: 'failed',
              startedAt: new Date(Date.now() - 1000).toISOString(),
              batch: { id: 'batch-1', index: 1, size: 2 },
              score: 0,
            },
          ],
        },
        '/v1/runs/run-123': {
          scores: [
            {
              name: 'greets',
              kind: 'predicate',
              value: 1,
              passed: true,
              passAt: 1,
              explanation: 'Says hello',
              durationMs: 1,
            },
          ],
          checkpoints: [],
          manifest: {},
          summary: {},
        },
      };
      const body = responses[url.pathname];
      if (body) {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      } else if (
        url.pathname.startsWith('/v1/') &&
        url.pathname.endsWith('/workspace')
      ) {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else if (url.pathname.endsWith('/artifacts')) {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ artifacts: [] }),
        });
      } else if (url.pathname.includes('/events')) {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ events: [] }),
        });
      } else {
        void request.continue();
      }
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0' });
    await waitForPath(page, '/scoreboard');
    await page.focus('button.navigation-toggle');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#dashboard-navigation[data-state="collapsed"]');
    expect(
      await page.$eval('button.navigation-toggle', (button) =>
        button.getAttribute('aria-expanded'),
      ),
    ).toBe('false');
    await page.waitForFunction(
      () =>
        document.querySelector('#dashboard-navigation')?.getBoundingClientRect()
          .width === 57,
    );
    await page.keyboard.press('Enter');
    await page.waitForSelector('#dashboard-navigation[data-state="expanded"]');

    // Library › Scenarios: expand the suite and open its scenario.
    await page.click('nav a[href="/library/scenarios"]');
    await waitForPath(page, '/library/scenarios');
    await page.waitForSelector('tbody tr button.table-link');
    await page.click('tbody tr button.table-link');
    await page.waitForSelector('.nested tbody tr a.table-link');
    await page.click('.nested tbody tr a.table-link');
    await waitForPath(page, '/library/scenarios/greeting');
    await page.waitForSelector('.scenario-definition');
    const crumbs = () =>
      page.$$eval('.hierarchy-breadcrumbs', (nodes) =>
        nodes.map((node) => node.textContent).join(' '),
      );
    expect(await crumbs()).toContain('Scenarios');
    expect(
      await page.$eval('.scenario-definition', (node) => node.textContent),
    ).toContain('Starter');

    // Scenario: its runs; open one.
    // The whole row opens the run, not only its ID link.
    await page.click(
      'section[aria-label="Runs"] tbody tr:first-child td:nth-child(2)',
    );
    await waitForPath(page, '/runs/run-123');
    await page.waitForSelector('.run-verdicts');
    await page.waitForSelector('.trajectory');
    expect(await crumbs()).toContain('Run run-123');
    expect(
      await page.$eval('.run-facts', (node) => node.textContent),
    ).toContain('Batch1 of 2');
    // What it did beside how it scored; a passing verdict starts closed,
    // and ?verdict= opens the one it names.
    const toggle = '[data-verdict="score:greets"] .verdict-toggle';
    expect(
      await page.$eval('.run-verdicts h2', (node) => node.textContent),
    ).toBe('How it scored');
    expect(
      await page.$eval(toggle, (node) => node.getAttribute('aria-expanded')),
    ).toBe('false');
    await page.goto(`${baseUrl}/runs/run-123?verdict=score%3Agreets`, {
      waitUntil: 'networkidle0',
    });
    await page.waitForFunction(
      (selector) =>
        document.querySelector(selector)?.getAttribute('aria-expanded') ===
        'true',
      {},
      toggle,
    );
    expect(
      await page.$eval(
        '.run-verdicts .verdict-panel',
        (node) => node.textContent,
      ),
    ).toContain('Says hello');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.trajectory');

    // The run page fits the window; its columns scroll on their own.
    expect(
      await page.evaluate(
        () => document.scrollingElement!.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);

    // Run: its sections from the menu and with `]`, then back up through
    // the breadcrumbs. Attachments are called logs since 0.10.
    await page.click('nav[aria-label="Run sections"] a[href$="/metrics"]');
    await waitForPath(page, '/runs/run-123/metrics');
    await page.waitForSelector('section[aria-label="Metrics"]');
    await page.keyboard.press(']');
    await waitForPath(page, '/runs/run-123/workspace');
    await page.waitForSelector('.workspace-inspector');
    await page.goto(`${baseUrl}/runs/run-123/attachments`, {
      waitUntil: 'networkidle0',
    });
    await waitForPath(page, '/runs/run-123/logs');
    await page.click('nav[aria-label="Run sections"] a[href$="/workspace"]');
    await waitForPath(page, '/runs/run-123/workspace');
    await page.click('nav[aria-label="Run sections"] a[href="/runs/run-123"]');
    await waitForPath(page, '/runs/run-123');
    await page.waitForSelector('.run-verdicts');
    await clickVisible(page, '.hierarchy-breadcrumbs a[href="/runs"]');
    await waitForPath(page, '/runs');

    // Runs and Workspaces share their filters, kept in the URL.
    await page.waitForSelector('.data-table > table > tbody > tr');
    await page.type('input[aria-label="Filter runs"]', 'greeting');
    await page.waitForFunction(
      () => new URLSearchParams(location.search).get('q') === 'greeting',
    );
    await page.click(
      '.data-table > table > tbody > tr a[href="/runs/run-123"]',
    );
    await waitForPath(page, '/runs/run-123');
    await page.goBack({ waitUntil: 'networkidle0' });
    expect(new URL(page.url()).searchParams.get('q')).toBe('greeting');
    await page.click('nav a[href^="/workspaces"]');
    await waitForPath(page, '/workspaces');
    expect(new URL(page.url()).searchParams.get('q')).toBe('greeting');
    await page.waitForSelector(
      '.data-table tbody tr a[href="/runs/run-123/workspace"]',
    );

    // A batch label narrows the list to the runs launched with it.
    await page.goto(`${baseUrl}/runs`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.batch-label');
    await page.click('.batch-label');
    await page.waitForFunction(
      () => new URLSearchParams(location.search).get('batch') === 'batch-1',
    );
    expect(
      await page.$$eval(
        '.data-table > table > tbody > tr',
        (rows) => rows.length,
      ),
    ).toBe(2);

    // Links from before 0.9: a trial's ID is its run's, an old run's its batch.
    await page.goto(`${baseUrl}/runs/old-run/trials/run-123/workspace`, {
      waitUntil: 'networkidle0',
    });
    await waitForPath(page, '/runs/run-123/workspace');
    // A run of one trial kept the run's ID.
    await page.goto(`${baseUrl}/runs/run-123/trials/gone-trial`, {
      waitUntil: 'networkidle0',
    });
    await waitForPath(page, '/runs/run-123');
    await page.goto(`${baseUrl}/runs/batch-1`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(
      () =>
        location.pathname === '/runs' &&
        new URLSearchParams(location.search).get('batch') === 'batch-1',
    );
    await page.goto(`${baseUrl}/trials?q=greeting`, {
      waitUntil: 'networkidle0',
    });
    await page.waitForFunction(
      () => location.pathname === '/runs' && location.search === '?q=greeting',
    );
  }, 30_000);

  test('shows a newly started eval without a page reload', async () => {
    const page = await browser.newPage();
    let started = false;
    try {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (path === '/v1/runs' && request.method() === 'POST') {
          expect(JSON.parse(request.postData() ?? '{}')).toEqual({
            path: 'echo',
            parameters: { model: 'glm', mode: 'with-docs' },
          });
          started = true;
          void request.respond({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({ accepted: true }),
          });
          return;
        }
        const bodies: Record<string, unknown> = {
          '/v1/matrix': {
            matrix: {
              id: 'benchmark',
              parameters: {
                model: ['glm', 'scout'],
                mode: ['with-docs', 'without-docs'],
              },
            },
          },
          '/v1/catalog': {
            evals: [
              {
                id: 'echo',
                path: 'echo',
                name: 'Echo Worker',
                repeat: 1,
                agent: { kind: 'worker', runtimes: [] },
                datasets: [],
                scorers: [],
              },
            ],
          },
          '/v1/suites': { suites: [] },
          '/v1/runs': {
            runs: started
              ? [
                  {
                    id: '0197f17c-4d89-7f81-9d42-6c497e6f6b22',
                    evalId: 'echo',
                    matrixId: 'benchmark',
                    parameters: { model: 'glm', mode: 'with-docs' },
                    status: 'running',
                    startedAt: new Date().toISOString(),
                  },
                ]
              : [],
          },
        };
        if (path in bodies) {
          void request.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(bodies[path]),
          });
        } else {
          void request.continue();
        }
      });
      await page.goto(`${baseUrl}/library/scenarios`, {
        waitUntil: 'networkidle0',
      });
      await page.waitForSelector(
        'section[aria-label="Scenarios without a suite"] tbody tr',
      );
      expect(
        await page.$eval(
          'section[aria-label="Scenarios without a suite"] tbody tr',
          (row) => row.textContent,
        ),
      ).toContain('Echo Worker');
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            'section[aria-label="Scenarios without a suite"] tbody tr',
          ).length === 4,
      );
      expect(
        await page.$$('section[aria-label="Scenarios without a suite"] select'),
      ).toHaveLength(0);
      const runButton =
        'section[aria-label="Scenarios without a suite"] tbody tr:first-child button:not(.table-link)';
      expect(
        await page.$eval(
          'section[aria-label="Scenarios without a suite"] thead',
          (head) => head.textContent,
        ),
      ).toContain('model');
      expect(
        await page.$eval(
          'section[aria-label="Scenarios without a suite"] thead',
          (head) => head.textContent,
        ),
      ).toContain('mode');
      expect(
        await page.$eval(
          'section[aria-label="Scenarios without a suite"] tbody tr:first-child',
          (row) => row.textContent,
        ),
      ).toContain('with-docs');
      expect(
        await page.$eval(
          runButton,
          (button) => (button as HTMLButtonElement).disabled,
        ),
      ).toBe(false);
      await page.click(runButton);
      expect(new URL(page.url()).pathname).toBe('/library/scenarios');
      await page.click('nav a[href="/runs"]');
      await page.waitForFunction(
        () =>
          location.pathname === '/runs' &&
          [
            ...document.querySelectorAll('.data-table > table > tbody > tr'),
          ].some((row) => row.textContent?.includes('running')),
      );
      await page.click('nav a[href="/library/scenarios"]');
      await page.waitForFunction(
        () =>
          location.pathname === '/library/scenarios' &&
          document
            .querySelector(
              'section[aria-label="Scenarios without a suite"] tbody tr',
            )
            ?.textContent?.includes('running'),
      );
      await page.click(
        'section[aria-label="Scenarios without a suite"] tbody tr a.table-link',
      );
      expect(new URL(page.url()).pathname).toBe('/library/scenarios/echo');
    } finally {
      await page.close();
    }
  }, 30_000);

  test('pages large matrices without rendering every cell and runs the selected row', async () => {
    const page = await browser.newPage();
    const submissions: unknown[] = [];
    try {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (!pathname.startsWith('/v1/')) {
          void request.continue();
          return;
        }
        if (pathname === '/v1/runs' && request.method() === 'POST') {
          submissions.push(JSON.parse(request.postData() ?? '{}'));
          void request.respond({
            status: 202,
            contentType: 'application/json',
            body: '{}',
          });
          return;
        }
        const response: Record<string, unknown> = {
          '/v1/matrix': {
            matrix: {
              id: 'benchmark',
              parameters: {
                model: Array.from(
                  { length: 51 },
                  (_, index) => `model-${index}`,
                ),
                mode: ['with-docs', 'without-docs'],
              },
            },
          },
          '/v1/catalog': {
            evals: [
              {
                id: 'echo',
                path: 'echo',
                repeat: 3,
                agent: { kind: 'worker', runtimes: [] },
                datasets: [],
                scorers: [],
              },
            ],
          },
          '/v1/suites': { suites: [] },
          '/v1/runs': {
            runs: [
              {
                id: 'r50',
                evalId: 'echo',
                matrixId: 'benchmark',
                parameters: { model: 'model-50', mode: 'with-docs' },
                status: 'passed',
                startedAt: '2026-01-01T00:00:00Z',
              },
            ],
          },
        };
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response[pathname]),
        });
      });
      await page.goto(`${baseUrl}/library/scenarios`, {
        waitUntil: 'networkidle0',
      });
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            'section[aria-label="Scenarios without a suite"] tbody tr',
          ).length === 50,
      );
      expect(await page.$eval('.pager', (nav) => nav.textContent)).toContain(
        '1–50 of 102',
      );
      await page.click('.pager button[aria-label="Next page"]');
      expect(await page.$eval('.pager', (nav) => nav.textContent)).toContain(
        '51–100 of 102',
      );
      expect(
        await page.$eval(
          'section[aria-label="Scenarios without a suite"] tbody tr:first-child',
          (row) => row.textContent,
        ),
      ).toContain('model-25');
      // Filtering includes off-page cells and their latest-run status.
      const filter = 'input[aria-label="Filter matrix cells"]';
      await page.type(filter, 'passed');
      expect(
        await page.$eval('.search-count', (span) => span.textContent),
      ).toContain('1 of 102');
      expect(
        await page.$eval(
          'section[aria-label="Scenarios without a suite"] tbody tr:first-child td:nth-child(2)',
          (cell) => cell.textContent?.trim(),
        ),
      ).toBe('model-50');
      await page.$eval(filter, (input) => (input as HTMLInputElement).select());
      await page.keyboard.type('model-2');
      expect(
        await page.$eval('.search-count', (span) => span.textContent),
      ).toContain('22 of 102');
      expect(await page.$('.pager')).toBeNull();
      await page.click(
        'section[aria-label="Scenarios without a suite"] th:nth-child(2) button',
      );
      expect(
        await page.$eval(
          'section[aria-label="Scenarios without a suite"] tbody tr:first-child td:nth-child(2)',
          (cell) => cell.textContent?.trim(),
        ),
      ).toBe('model-2');
      await page.click(
        'section[aria-label="Scenarios without a suite"] th:nth-child(2) button',
      );
      expect(
        await page.$eval(
          'section[aria-label="Scenarios without a suite"] tbody tr:first-child td:nth-child(2)',
          (cell) => cell.textContent?.trim(),
        ),
      ).toBe('model-29');
      const posted = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/v1/runs' &&
          response.request().method() === 'POST',
      );
      await page.click(
        'section[aria-label="Scenarios without a suite"] tbody tr:first-child button:not(.table-link)',
      );
      await posted;
      expect(submissions).toEqual([
        { path: 'echo', parameters: { model: 'model-29', mode: 'with-docs' } },
      ]);
    } finally {
      await page.close();
    }
  }, 30_000);

  test('filters and sorts runs by saved matrix parameters', async () => {
    const page = await browser.newPage();
    try {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        const bodies: Record<string, unknown> = {
          '/v1/matrix': { matrix: null },
          '/v1/catalog': {
            evals: [
              {
                id: 'echo',
                path: 'echo',
                repeat: 1,
                agent: { kind: 'worker', runtimes: [] },
                datasets: [],
                scorers: [],
              },
            ],
          },
          '/v1/suites': { suites: [] },
          '/v1/runs': {
            runs: [
              {
                id: 'run-low',
                evalId: 'echo',
                matrixId: 'models',
                parameters: { model: 'scout', retries: 2 },
                status: 'passed',
                startedAt: '2026-01-01',
              },
              {
                id: 'run-high',
                evalId: 'echo',
                matrixId: 'models',
                parameters: { model: 'glm', retries: 10 },
                status: 'failed',
                startedAt: '2026-01-02',
              },
              {
                id: 'run-plain',
                evalId: 'echo',
                status: 'running',
                startedAt: '2026-01-03',
              },
            ],
          },
        };
        if (path in bodies)
          void request.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(bodies[path]),
          });
        else void request.continue();
      });
      await page.goto(`${baseUrl}/runs`, { waitUntil: 'networkidle0' });
      const rows = '.data-table > table > tbody > tr';
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.data-table > table > tbody > tr')
            .length === 3,
      );
      expect(
        await page.$eval('.data-table thead', (head) => head.textContent),
      ).toContain('retries');
      await page.$$eval('.data-table th button', (buttons) => {
        const retries = buttons.find((button) =>
          button.textContent?.startsWith('retries'),
        );
        if (!(retries instanceof HTMLElement))
          throw new Error('no retries column');
        retries.click(); // ascending, numeric
      });
      expect(
        await page.$eval(`${rows}:nth-child(3)`, (row) => row.textContent),
      ).toContain('10');
      const input = 'input[aria-label="Filter runs"]';
      await page.type(input, 'model glm');
      expect(
        await page.$eval('.search-count', (span) => span.textContent),
      ).toContain('1 of 3 runs');
      expect(await page.$eval(rows, (row) => row.textContent)).toContain(
        'run-high',
      );
      await page.waitForFunction(
        () => new URLSearchParams(location.search).get('q') === 'model glm',
      );
      await page.$eval(input, (element) =>
        (element as HTMLInputElement).select(),
      );
      await page.keyboard.type('not-a-model');
      expect(await page.$eval(rows, (row) => row.textContent)).toContain(
        'No matching runs.',
      );
    } finally {
      await page.close();
    }
  }, 30_000);
});
