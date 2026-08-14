import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const WORKSPACE_ARTIFACT_ALLOWLIST = Object.freeze([
  'apps/web/.next',
  'apps/web/dist',
  'apps/web/tsconfig.tsbuildinfo',
  'apps/api/dist',
  'apps/api/tsconfig.tsbuildinfo',
  'apps/api/tsconfig.build.tsbuildinfo',
  'apps/api/src/generated/prisma',
  'apps/e2e/dist',
  'apps/e2e/tsconfig.tsbuildinfo',
  'packages/api-client/dist',
  'packages/api-client/tsconfig.tsbuildinfo',
  'packages/eslint-config/dist',
  'packages/eslint-config/tsconfig.tsbuildinfo',
  'packages/typescript-config/dist',
  'packages/typescript-config/tsconfig.tsbuildinfo',
]);

export function assertRepositoryRoot(repositoryRoot) {
  const resolvedRoot = resolve(repositoryRoot);

  if (!existsSync(resolvedRoot)) {
    throw new Error(`Repository root does not exist: ${resolvedRoot}`);
  }

  const canonicalRoot = realpathSync(resolvedRoot);
  if (canonicalRoot !== resolvedRoot) {
    throw new Error('Repository root must be a canonical, non-symlink path.');
  }

  const packagePath = join(canonicalRoot, 'package.json');
  const workspacePath = join(canonicalRoot, 'pnpm-workspace.yaml');
  const gitPath = join(canonicalRoot, '.git');
  if (
    !existsSync(packagePath) ||
    !existsSync(workspacePath) ||
    !existsSync(gitPath)
  ) {
    throw new Error(
      'Repository root must contain package.json, pnpm-workspace.yaml and .git.',
    );
  }

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (packageJson.name !== 'hop-and-barley-store') {
    throw new Error(
      'Repository root package identity does not match Hop & Barley.',
    );
  }

  return canonicalRoot;
}

function assertSafeRelativePath(relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    normalize(relativePath) !== relativePath ||
    relativePath === '.' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`)
  ) {
    throw new Error(`Unsafe artifact allowlist path: ${String(relativePath)}`);
  }
}

function assertNoSymlinkComponents(repositoryRoot, relativePath) {
  let currentPath = repositoryRoot;

  for (const segment of relativePath.split('/')) {
    currentPath = join(currentPath, segment);
    if (existsSync(currentPath) && lstatSync(currentPath).isSymbolicLink()) {
      throw new Error(`Artifact path traverses a symlink: ${relativePath}`);
    }
  }
}

export function resolveArtifactTargets({
  allowlist = WORKSPACE_ARTIFACT_ALLOWLIST,
  repositoryRoot,
}) {
  const canonicalRoot = assertRepositoryRoot(repositoryRoot);

  return allowlist.map((relativePath) => {
    assertSafeRelativePath(relativePath);
    const absolutePath = resolve(canonicalRoot, relativePath);
    const relativeToRoot = relative(canonicalRoot, absolutePath);

    if (
      relativeToRoot.length === 0 ||
      relativeToRoot === '..' ||
      relativeToRoot.startsWith(`..${sep}`) ||
      isAbsolute(relativeToRoot)
    ) {
      throw new Error(`Artifact path escapes repository root: ${relativePath}`);
    }

    assertNoSymlinkComponents(canonicalRoot, relativePath);
    return { absolutePath, relativePath };
  });
}

export function cleanWorkspaceArtifacts({ repositoryRoot }) {
  const targets = resolveArtifactTargets({
    allowlist: WORKSPACE_ARTIFACT_ALLOWLIST,
    repositoryRoot,
  });
  const removed = [];

  for (const target of targets) {
    if (!existsSync(target.absolutePath)) continue;
    rmSync(target.absolutePath, { force: true, recursive: true });
    removed.push(target.relativePath);
  }

  return { checked: targets.map((target) => target.relativePath), removed };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const result = cleanWorkspaceArtifacts({ repositoryRoot: process.cwd() });
  process.stdout.write(
    `Cleaned ${result.removed.length} allowlisted workspace artifact(s).\n`,
  );
}
