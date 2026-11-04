import { randomUUID } from 'node:crypto';
import type { ContainerNetwork, Fixture, FixtureAddress } from '@evalkit/core';
import { docker, ensureRuntime } from './docker.js';
import {
  collect,
  OutputBuffer,
  startLocalProcess,
  STOP_GRACE_MS,
  type LocalProcess,
} from './local-process.js';

/** How long a fixture has to answer `ready`. */
export const FIXTURE_READY_MS = 60_000;
const POLL_MS = 250;
/** Forwards a port to the host; busybox's nc serves each connection in its own process. */
const PROXY_IMAGE = 'busybox:stable';
const NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export type FixtureSet = {
  /** Starts every fixture, once; later calls wait for the same start. Throws when one never becomes ready. */
  ensure(): Promise<void>;
  /** True once `ensure` was called. */
  readonly started: boolean;
  /**
   * The fixtures as a run reaches them: from the host, or from a container
   * on `network`.
   */
  addresses(from?: {
    container: ContainerNetwork;
  }): Record<string, FixtureAddress>;
  /** The internal network containers share with the fixtures' proxies, created on first use. */
  network(runtime: string): Promise<string>;
  /** Each fixture's output so far. */
  logs(): Array<{ name: string; content: string }>;
  /** Runs each `stop` command, then stops the fixtures, their proxies and network. */
  stop(): Promise<void>;
};

type Running = {
  name: string;
  fixture: Fixture;
  port: number | undefined;
  output: OutputBuffer;
  process?: LocalProcess;
};

/** The port a fixture listens on: its own, or its `ready` URL's. */
export function fixturePort(fixture: Fixture): number | undefined {
  if (fixture.port !== undefined) return fixture.port;
  const url = readyUrl(fixture.ready);
  if (!url) return undefined;
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

function readyUrl(ready: string | undefined): URL | undefined {
  if (!ready || !/^https?:\/\//.test(ready)) return undefined;
  try {
    return new URL(ready);
  } catch {
    return undefined;
  }
}

/** Checks fixture definitions from the config. */
export function parseFixtures(
  fixtures: Readonly<Record<string, Fixture>>,
): Record<string, Fixture> {
  for (const [name, fixture] of Object.entries(fixtures)) {
    if (!NAME.test(name))
      throw new Error(
        `Fixture names are lowercase letters, digits and dashes, so runs can reach them as fixtures.<name>; received ${JSON.stringify(name)}`,
      );
    if (typeof fixture?.start !== 'string' || !fixture.start.trim())
      throw new Error(`Fixture ${name} needs a start command`);
    if (
      fixture.port !== undefined &&
      (!Number.isInteger(fixture.port) ||
        fixture.port < 1 ||
        fixture.port > 65_535)
    )
      throw new Error(`Fixture ${name} port must be from 1 to 65535`);
  }
  return { ...fixtures };
}

/**
 * The project's fixtures for one invocation: started on the host, in the
 * project root, the first time a run needs them, and stopped after its last.
 */
export function fixtureSet(
  fixtures: Readonly<Record<string, Fixture>>,
  options: { root: string },
): FixtureSet {
  const running: Running[] = Object.entries(parseFixtures(fixtures)).map(
    ([name, fixture]) => ({
      name,
      fixture,
      port: fixturePort(fixture),
      output: new OutputBuffer(),
    }),
  );
  const id = randomUUID().slice(0, 8);
  let starting: Promise<void> | undefined;
  let networking: { runtime: string; network: Promise<string> } | undefined;
  const proxies: Array<{ runtime: string; name: string }> = [];

  const shell = (command: string, output?: OutputBuffer) => {
    const started = startLocalProcess(['/bin/sh', '-c', command], {
      cwd: options.root,
      env: process.env,
    });
    if (output) started.onOutput((chunk) => output.append(chunk));
    return started;
  };

  const waitReady = async (entry: Running) => {
    const { ready } = entry.fixture;
    if (!ready) return;
    const url = readyUrl(ready);
    const deadline = Date.now() + FIXTURE_READY_MS;
    let exited = false;
    void entry.process?.wait().then(() => {
      exited = true;
    });
    while (Date.now() < deadline) {
      if (exited)
        throw new Error(
          `Fixture ${entry.name} exited before it was ready: ${entry.output.toString().trim().slice(-500)}`,
        );
      const answered = url
        ? await fetch(url, { signal: AbortSignal.timeout(1_000) }).then(
            () => true,
            () => false,
          )
        : (await collect(shell(ready))).exitCode === 0;
      if (answered) return;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    throw new Error(
      `Fixture ${entry.name} was not ready after ${FIXTURE_READY_MS / 1000}s (${ready}): ${entry.output.toString().trim().slice(-500)}`,
    );
  };

  return {
    get started() {
      return starting !== undefined;
    },
    ensure() {
      starting ??= (async () => {
        for (const entry of running) {
          entry.process = shell(entry.fixture.start, entry.output);
        }
        await Promise.all(running.map(waitReady));
      })();
      return starting;
    },
    addresses(from) {
      const addresses: Record<string, FixtureAddress> = {};
      for (const entry of running) {
        const origin = readyUrl(entry.fixture.ready);
        const scheme = origin?.protocol ?? 'http:';
        if (!from) {
          if (entry.port !== undefined)
            addresses[entry.name] = {
              url: `${scheme}//localhost:${entry.port}`,
            };
          continue;
        }
        if (entry.port === undefined || from.container === 'none') continue;
        addresses[entry.name] = {
          url:
            from.container === 'fixtures'
              ? `${scheme}//fixtures.${entry.name}:${entry.port}`
              : from.container === 'host'
                ? `${scheme}//localhost:${entry.port}`
                : `${scheme}//host.docker.internal:${entry.port}`,
        };
      }
      return addresses;
    },
    network(runtime) {
      if (networking && networking.runtime !== runtime)
        throw new Error(
          `Fixtures are on ${networking.runtime}'s network; one invocation uses one container runtime`,
        );
      networking ??= {
        runtime,
        network: (async () => {
          await ensureRuntime(runtime);
          const network = `evalkit-fixtures-${id}`;
          await docker(runtime, [
            'network',
            'create',
            '--internal',
            '--label',
            'evalkit.fixtures=true',
            network,
          ]);
          // An internal network cannot reach the host: a proxy on both
          // networks forwards each fixture's port to it.
          for (const entry of running) {
            if (entry.port === undefined) continue;
            const proxy = `${network}-${entry.name}`;
            await docker(runtime, [
              'run',
              '--detach',
              '--rm',
              '--name',
              proxy,
              '--label',
              'evalkit.fixtures=true',
              '--add-host',
              'host.docker.internal:host-gateway',
              PROXY_IMAGE,
              'nc',
              '-lk',
              '-p',
              String(entry.port),
              '-e',
              'nc',
              'host.docker.internal',
              String(entry.port),
            ]);
            proxies.push({ runtime, name: proxy });
            await docker(runtime, [
              'network',
              'connect',
              '--alias',
              `fixtures.${entry.name}`,
              network,
              proxy,
            ]);
          }
          return network;
        })(),
      };
      return networking.network;
    },
    logs: () =>
      running
        .filter((entry) => entry.process)
        .map((entry) => ({
          name: entry.name,
          content: entry.output.toString(),
        })),
    async stop() {
      for (const proxy of proxies.splice(0))
        await docker(proxy.runtime, ['rm', '--force', proxy.name]).catch(
          () => undefined,
        );
      if (networking) {
        const { runtime, network } = networking;
        networking = undefined;
        const name = await network.catch(() => undefined);
        if (name)
          await docker(runtime, ['network', 'rm', name]).catch(() => undefined);
      }
      await Promise.all(
        running.map(async (entry) => {
          if (!entry.process) return;
          if (entry.fixture.stop)
            await collect(shell(entry.fixture.stop, entry.output));
          await entry.process.killLocal('SIGTERM');
          const timer = setTimeout(
            () => void entry.process?.killLocal('SIGKILL'),
            STOP_GRACE_MS,
          );
          timer.unref?.();
          await entry.process.wait();
          clearTimeout(timer);
        }),
      );
    },
  };
}
