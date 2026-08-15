import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const sourceWebDirectory = join(repositoryRoot, 'apps/web');
const nextCli = join(sourceWebDirectory, 'node_modules/next/dist/bin/next');
const excludedCopySegments = new Set([
  '.next',
  '.turbo',
  'node_modules',
  'playwright-report',
  'test-results',
  'tsconfig.tsbuildinfo',
]);

interface FetchCacheEntry {
  data?: {
    status?: number;
    url?: string;
  };
  kind?: string;
  revalidate?: number;
}

interface ManagedNextProcess extends ChildProcess {
  runtimeOutput(): string;
}

export interface CatalogFetchCacheEntry {
  revalidate: number | undefined;
  status: number | undefined;
  url: string;
}

export interface CatalogCacheRuntime {
  baseUrl: string;
  failNext(search: string): void;
  fetchCacheEntries(search: string): Promise<CatalogFetchCacheEntry[]>;
  rootRouteIsPrerendered: boolean;
  stop(): Promise<void>;
  upstreamAttempts(search: string): number;
}

export async function startCatalogCacheRuntime(): Promise<CatalogCacheRuntime> {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), 'hop-barley-catalog-cache-'),
  );
  const webDirectory = join(temporaryRoot, 'web');
  const upstream = await startCountingUpstream();
  let nextProcess: ManagedNextProcess | undefined;

  try {
    await copyWebApplication(webDirectory);
    await runNext(
      ['build', '--webpack'],
      webDirectory,
      upstream.origin,
      'production build',
    );

    const prerenderManifest = JSON.parse(
      await readFile(
        join(webDirectory, '.next/prerender-manifest.json'),
        'utf8',
      ),
    ) as { routes?: Record<string, unknown> };
    const rootRouteIsPrerendered = Boolean(prerenderManifest.routes?.['/']);
    const port = await reservePort();
    nextProcess = startNext(webDirectory, upstream.origin, port);
    await waitForReady(`http://127.0.0.1:${port}`, nextProcess);
    upstream.reset();

    return {
      baseUrl: `http://127.0.0.1:${port}`,
      failNext: (search) => upstream.failNext(search),
      fetchCacheEntries: (search) =>
        readFetchCacheEntries(webDirectory, upstream.origin, search),
      rootRouteIsPrerendered,
      stop: async () => {
        await stopChild(nextProcess);
        await closeServer(upstream.server);
        await rm(temporaryRoot, { force: true, recursive: true });
      },
      upstreamAttempts: (search) => upstream.attempts(search),
    };
  } catch (error) {
    await stopChild(nextProcess);
    await closeServer(upstream.server);
    await rm(temporaryRoot, { force: true, recursive: true });
    throw error;
  }
}

async function copyWebApplication(target: string) {
  await cp(sourceWebDirectory, target, {
    filter(source) {
      const pathFromWebRoot = relative(sourceWebDirectory, source);
      if (pathFromWebRoot === '') return true;
      return !pathFromWebRoot
        .split(sep)
        .some((segment) => excludedCopySegments.has(segment));
    },
    recursive: true,
  });
  await symlink(
    join(sourceWebDirectory, 'node_modules'),
    join(target, 'node_modules'),
  );
}

function runNext(
  arguments_: string[],
  cwd: string,
  apiOrigin: string,
  label: string,
) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [nextCli, ...arguments_], {
      cwd,
      env: runtimeEnvironment(apiOrigin),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output: string[] = [];
    child.stdout?.on('data', (chunk) => output.push(String(chunk)));
    child.stderr?.on('data', (chunk) => output.push(String(chunk)));
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(
        new Error(
          `${label} failed (${signal ?? `exit ${String(code)}`}):\n${output.join('').slice(-12_000)}`,
        ),
      );
    });
  });
}

function startNext(cwd: string, apiOrigin: string, port: number) {
  const output: string[] = [];
  const child = spawn(
    process.execPath,
    [nextCli, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd,
      env: runtimeEnvironment(apiOrigin),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout?.on('data', (chunk) => output.push(String(chunk)));
  child.stderr?.on('data', (chunk) => output.push(String(chunk)));
  return Object.assign(child, {
    runtimeOutput: () => output.join('').slice(-12_000),
  });
}

function runtimeEnvironment(apiOrigin: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    API_INTERNAL_URL: `${apiOrigin}/api/v1`,
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: 'production',
  };
}

async function waitForReady(baseUrl: string, child: ManagedNextProcess) {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `production server exited before readiness with ${String(child.exitCode)}:\n${child.runtimeOutput()}`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/?page=201`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(
    `production server did not become ready: ${String(lastError)}\n${child.runtimeOutput()}`,
  );
}

async function readFetchCacheEntries(
  webDirectory: string,
  apiOrigin: string,
  search: string,
): Promise<CatalogFetchCacheEntry[]> {
  const directory = join(webDirectory, '.next/cache/fetch-cache');
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        return JSON.parse(
          await readFile(join(directory, name), 'utf8'),
        ) as FetchCacheEntry;
      } catch {
        return null;
      }
    }),
  );
  const expectedPrefix = `${apiOrigin}/api/v1/products?`;

  return entries.flatMap((entry) => {
    if (
      entry?.kind !== 'FETCH' ||
      !entry.data?.url?.startsWith(expectedPrefix)
    ) {
      return [];
    }
    const url = new URL(entry.data.url);
    if (url.searchParams.get('search') !== search) return [];
    return [
      {
        revalidate: entry.revalidate,
        status: entry.data.status,
        url: entry.data.url,
      },
    ];
  });
}

async function startCountingUpstream() {
  const attempts = new Map<string, number>();
  const failures = new Set<string>();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method !== 'GET' || url.pathname !== '/api/v1/products') {
      response.writeHead(404).end();
      return;
    }

    const search = url.searchParams.get('search') ?? '';
    const attempt = (attempts.get(search) ?? 0) + 1;
    attempts.set(search, attempt);
    if (failures.delete(search)) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'planned upstream failure' }));
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify([
        {
          currency: 'USD',
          description: `Production cache response ${attempt}`,
          id: '10000000-0000-4000-8000-000000000001',
          name: `${search} response ${attempt}`,
          priceMinor: 499,
          slug: 'catalog-cache-runtime-probe',
        },
      ]),
    );
  });
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Counting upstream did not expose a TCP port.');
  }

  return {
    attempts: (search: string) => attempts.get(search) ?? 0,
    failNext: (search: string) => failures.add(search),
    origin: `http://127.0.0.1:${address.port}`,
    reset: () => {
      attempts.clear();
      failures.clear();
    },
    server,
  };
}

function listen(server: Server) {
  return new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });
}

async function reservePort() {
  const server = createServer();
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeServer(server);
    throw new TypeError('Port reservation did not expose a TCP port.');
  }
  const port = address.port;
  await closeServer(server);
  return port;
}

function closeServer(server: Server) {
  return new Promise<void>((resolvePromise, reject) => {
    if (!server.listening) {
      resolvePromise();
      return;
    }
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

async function stopChild(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((resolvePromise) =>
    child.once('exit', () => resolvePromise()),
  );
  child.kill('SIGTERM');
  let forcedStop: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      exited,
      new Promise<void>((resolvePromise) => {
        forcedStop = setTimeout(() => {
          child.kill('SIGKILL');
          resolvePromise();
        }, 5_000);
      }),
    ]);
  } finally {
    if (forcedStop) clearTimeout(forcedStop);
  }
}
