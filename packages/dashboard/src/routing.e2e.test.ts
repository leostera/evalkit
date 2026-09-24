import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import puppeteer, { type Browser } from 'puppeteer';

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
  browser = await puppeteer.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  server?.kill();
});

describe('dashboard URL routing', () => {
  test('navigates from suites to runs and trial URLs', async () => {
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
              fixtures: [],
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
              },
            ],
          }),
        });
      } else if (url.pathname.includes('/events')) {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ events: [] }),
        });
      } else if (url.pathname.includes('/trials/trial-1')) {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ manifest: {}, summary: {} }),
        });
      } else {
        void request.continue();
      }
    });

    await page.goto(`${baseUrl}/suites`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('tbody tr button');
    await page.$eval('tbody tr button', (button) =>
      (button as HTMLElement).click(),
    );
    expect(new URL(page.url()).pathname).toBe('/suites/starter');
    await page.waitForSelector('.nested tbody tr');
    await page.click('.nested tbody tr');
    expect(new URL(page.url()).pathname).toBe('/evals/starter%23greeting');
    await page.goBack({ waitUntil: 'networkidle0' });
    expect(new URL(page.url()).pathname).toBe('/suites/starter');

    await page.evaluate(() => {
      const button = [...document.querySelectorAll('nav a')].find(
        (node) => node.textContent === 'runs',
      );
      if (!(button instanceof HTMLElement))
        throw new Error('runs navigation missing');
      button.click();
    });
    expect(new URL(page.url()).pathname).toBe('/runs');
    await page.waitForSelector('.table-wrap > table > tbody > tr');
    await page.click('.table-wrap > table > tbody > tr');
    expect(new URL(page.url()).pathname).toBe('/runs/run-123');
    await page.waitForSelector('.nested tbody tr button');
    await page.click('.nested tbody tr button');
    expect(new URL(page.url()).pathname).toBe(
      '/trials/0197f17c-4d89-7f81-9d42-6c497e6f6b22',
    );
    await page.reload({ waitUntil: 'networkidle0' });
    expect(new URL(page.url()).pathname).toBe(
      '/trials/0197f17c-4d89-7f81-9d42-6c497e6f6b22',
    );
    await page.goBack({ waitUntil: 'networkidle0' });
    expect(new URL(page.url()).pathname).toBe('/runs/run-123');
    await page.goForward({ waitUntil: 'networkidle0' });
    expect(new URL(page.url()).pathname).toBe(
      '/trials/0197f17c-4d89-7f81-9d42-6c497e6f6b22',
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
                fixtures: [],
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
      await page.goto(`${baseUrl}/suites`, { waitUntil: 'networkidle0' });
      await page.waitForSelector(
        'section[aria-label="Standalone evals"] tbody tr',
      );
      expect(
        await page.$eval(
          'section[aria-label="Standalone evals"] tbody tr',
          (row) => row.textContent,
        ),
      ).toContain('Echo Worker');
      const runButton = 'section[aria-label="Standalone evals"] button';
      expect(
        await page.$eval(
          runButton,
          (button) => (button as HTMLButtonElement).disabled,
        ),
      ).toBe(true);
      await page.select('select[aria-label="model"]', '0');
      await page.select('select[aria-label="mode"]', '0');
      expect(
        await page.$eval(
          runButton,
          (button) => (button as HTMLButtonElement).disabled,
        ),
      ).toBe(false);
      await page.click(runButton);
      expect(new URL(page.url()).pathname).toBe('/suites');
      await page.click('nav a[href="/runs"]');
      await page.waitForFunction(
        () =>
          location.pathname === '/runs' &&
          [
            ...document.querySelectorAll('.table-wrap > table > tbody > tr'),
          ].some((row) => row.textContent?.includes('running')),
      );
      await page.click('nav a[href="/suites"]');
      await page.waitForFunction(
        () =>
          location.pathname === '/suites' &&
          document
            .querySelector('section[aria-label="Standalone evals"] tbody tr')
            ?.textContent?.includes('running'),
      );
      await page.click('section[aria-label="Standalone evals"] tbody tr');
      expect(new URL(page.url()).pathname).toBe('/evals/echo');
    } finally {
      await page.close();
    }
  }, 30_000);
});
