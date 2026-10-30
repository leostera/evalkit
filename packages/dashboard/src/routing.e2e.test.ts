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
  test('walks scenario, run, trial and workspace pages and back up', async () => {
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
              trialCount: 2,
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
              status: 'completed',
              startedAt: new Date().toISOString(),
              completedTrials: 1,
              requestedTrials: 1,
              score: 1,
            },
          ],
        },
      };
      const body = responses[url.pathname];
      if (body) {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      } else if (url.pathname === '/v1/runs/run-123/trials') {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            trials: [
              {
                id: '0197f17c-4d89-7f81-9d42-6c497e6f6b22',
                index: 0,
                status: 'completed',
                startedAt: new Date().toISOString(),
                score: 1,
                scores: [],
              },
            ],
          }),
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
      } else if (
        url.pathname ===
        '/v1/runs/run-123/trials/0197f17c-4d89-7f81-9d42-6c497e6f6b22'
      ) {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ manifest: {}, summary: {} }),
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
    await page.click('section[aria-label="Runs"] tbody tr td:nth-child(2)');
    await waitForPath(page, '/runs/run-123');
    await page.waitForSelector('.run-overview');
    expect(await crumbs()).toContain('Run run-123');

    // Run: its trials; open one, then reload the trial page.
    const trial = '0197f17c-4d89-7f81-9d42-6c497e6f6b22';
    await page.waitForSelector('.nested tbody tr td:nth-child(2)');
    await page.click('.nested tbody tr td:nth-child(2)');
    await waitForPath(page, `/runs/run-123/trials/${trial}`);
    await page.waitForSelector('.trajectory');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.trajectory');
    expect(await crumbs()).toContain('Run run-123');

    // Trial: its workspace, then back up through the breadcrumbs.
    await page.click('.open-workspace');
    await waitForPath(page, `/runs/run-123/trials/${trial}/workspace`);
    await page.waitForSelector('.workspace-inspector');
    await clickVisible(
      page,
      `.hierarchy-breadcrumbs a[href="/runs/run-123/trials/${trial}"]`,
    );
    await waitForPath(page, `/runs/run-123/trials/${trial}`);
    await clickVisible(page, '.hierarchy-breadcrumbs a[href="/runs/run-123"]');
    await waitForPath(page, '/runs/run-123');
    await clickVisible(page, '.hierarchy-breadcrumbs a[href="/runs"]');
    await waitForPath(page, '/runs');

    // Runs, Trials and Workspaces share their filters, kept in the URL.
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
    await page.click('nav a[href^="/trials"]');
    await waitForPath(page, '/trials');
    expect(new URL(page.url()).searchParams.get('q')).toBe('greeting');
    await page.waitForSelector('input[aria-label="Filter trials"]');
    expect(
      await page.$eval(
        'input[aria-label="Filter trials"]',
        (input) => (input as HTMLInputElement).value,
      ),
    ).toBe('greeting');
    await page.click('nav a[href^="/workspaces"]');
    await waitForPath(page, '/workspaces');
    expect(new URL(page.url()).searchParams.get('q')).toBe('greeting');
    await page.waitForSelector(
      `.data-table tbody tr a[href="/runs/run-123/trials/${trial}/workspace"]`,
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
                trialCount: 1,
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
                    completedTrials: 0,
                    requestedTrials: 1,
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
                trialCount: 3,
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
                completedTrials: 1,
                requestedTrials: 1,
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
                trialCount: 1,
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
                completedTrials: 1,
                requestedTrials: 1,
              },
              {
                id: 'run-high',
                evalId: 'echo',
                matrixId: 'models',
                parameters: { model: 'glm', retries: 10 },
                status: 'failed',
                startedAt: '2026-01-02',
                completedTrials: 1,
                requestedTrials: 1,
              },
              {
                id: 'run-plain',
                evalId: 'echo',
                status: 'running',
                startedAt: '2026-01-03',
                completedTrials: 0,
                requestedTrials: 1,
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
