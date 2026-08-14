import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertRepositoryRoot,
  resolveArtifactTargets,
} from './clean-workspace-artifacts.mjs';

export const GENERATED_OUTPUT_PATHS = Object.freeze({
  client: 'packages/api-client/src/generated/schema.ts',
  openApi: 'apps/api/openapi.json',
});

function readRequired(path, label) {
  try {
    return readFileSync(path);
  } catch {
    throw new Error(`${label} is missing after generation: ${path}`);
  }
}

function readOptional(path) {
  try {
    return { bytes: readFileSync(path), exists: true };
  } catch {
    return { bytes: null, exists: false };
  }
}

function restoreSnapshot(path, snapshot) {
  if (!snapshot.exists) {
    rmSync(path, { force: true });
    return;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, snapshot.bytes);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function verifyGeneratedStability({
  generate,
  paths = GENERATED_OUTPUT_PATHS,
  repositoryRoot,
}) {
  if (typeof generate !== 'function') {
    throw new TypeError(
      'verifyGeneratedStability requires a generate callback.',
    );
  }

  const canonicalRoot = assertRepositoryRoot(repositoryRoot);
  const resolvedPaths = Object.fromEntries(
    resolveArtifactTargets({
      allowlist: [paths.client, paths.openApi],
      repositoryRoot: canonicalRoot,
    }).map(({ absolutePath, relativePath }) => [relativePath, absolutePath]),
  );
  const clientPath = resolvedPaths[paths.client];
  const openApiPath = resolvedPaths[paths.openApi];
  const initialClient = {
    bytes: readRequired(clientPath, 'Accepted generated client baseline'),
    exists: true,
  };
  const initialOpenApi = readOptional(openApiPath);

  try {
    await generate({ pass: 1, repositoryRoot: canonicalRoot });
    const firstClient = readRequired(clientPath, 'Generated client');
    const firstOpenApi = readRequired(openApiPath, 'Generated OpenAPI');

    if (!firstClient.equals(initialClient.bytes)) {
      throw new Error(
        'First generation changed the accepted generated client baseline.',
      );
    }

    await generate({ pass: 2, repositoryRoot: canonicalRoot });
    const secondClient = readRequired(clientPath, 'Generated client');
    const secondOpenApi = readRequired(openApiPath, 'Generated OpenAPI');

    if (!secondOpenApi.equals(firstOpenApi)) {
      throw new Error(
        `Generated output is not byte-stable between passes: ${paths.openApi}`,
      );
    }
    if (!secondClient.equals(firstClient)) {
      throw new Error(
        `Generated output is not byte-stable between passes: ${paths.client}`,
      );
    }

    return {
      clientSha256: sha256(secondClient),
      openApiSha256: sha256(secondOpenApi),
      passes: 2,
    };
  } catch (error) {
    restoreSnapshot(clientPath, initialClient);
    restoreSnapshot(openApiPath, initialOpenApi);
    throw error;
  }
}

export function runPnpmApiGenerate({ repositoryRoot }) {
  return new Promise((resolveRun, rejectRun) => {
    const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const child = spawn(executable, ['api:generate'], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(
        new Error(
          `pnpm api:generate failed (${signal ? `signal ${signal}` : `exit ${code}`}).`,
        ),
      );
    });
  });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const repositoryRoot = assertRepositoryRoot(process.cwd());
  const result = await verifyGeneratedStability({
    generate: () => runPnpmApiGenerate({ repositoryRoot }),
    repositoryRoot,
  });
  process.stdout.write(
    `Generated outputs are byte-stable across ${result.passes} passes.\n`,
  );
}
