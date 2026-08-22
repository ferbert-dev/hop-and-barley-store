import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resourceUsage } from 'node:process';
import { argon2id, hash, verify } from 'argon2';

const EXPECTED_NODE = 'v24.5.0';
const EXPECTED_MEMORY_BYTES = 1024 * 1024 * 1024;
const EXPECTED_CPU_MAX = '100000 100000';
const MAX_SINGLE_LATENCY_MS = 1_500;
const MAX_CONCURRENT_WALL_MS = 2_500;
const MAX_RSS_MIB = 256;
const MAX_EVENT_LOOP_LAG_MS = 250;
const CONCURRENT_OPERATIONS = 5;
const PASSWORD = 'A1B resource gate passphrase 2026';
const OPTIONS = {
  hashLength: 32,
  memoryCost: 7_168,
  parallelism: 1,
  timeCost: 5,
  type: argon2id,
  version: 0x13,
};
const PHC_PROFILE = /^\$argon2id\$v=19\$m=7168,p=1,t=5\$/;

function read(path) {
  return readFileSync(path, 'utf8').trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function timedHash() {
  const started = performance.now();
  const encoded = await hash(PASSWORD, OPTIONS);
  assert(PHC_PROFILE.test(encoded), 'Argon2 PHC profile mismatch.');
  return { encoded, elapsedMs: performance.now() - started };
}

async function timedVerify(encoded, password, expected) {
  const started = performance.now();
  const matches = await verify(encoded, password);
  assert(matches === expected, 'Argon2 verify result mismatch.');
  return performance.now() - started;
}

assert(process.version === EXPECTED_NODE, `Expected Node ${EXPECTED_NODE}.`);
assert(read('/etc/alpine-release').length > 0, 'Expected Alpine Linux.');
assert(
  Number(read('/sys/fs/cgroup/memory.max')) === EXPECTED_MEMORY_BYTES,
  'Expected a 1 GiB cgroup memory limit.',
);
assert(
  read('/sys/fs/cgroup/cpu.max') === EXPECTED_CPU_MAX,
  'Expected a one-CPU cgroup quota.',
);

const { encoded } = await timedHash();
await timedVerify(encoded, `${PASSWORD} incorrect`, false);

const singleVerifyLatenciesMs = [];
for (let attempt = 0; attempt < 3; attempt += 1) {
  singleVerifyLatenciesMs.push(await timedVerify(encoded, PASSWORD, true));
}

let lastProbe = performance.now();
let maxEventLoopLagMs = 0;
const probe = setInterval(() => {
  const now = performance.now();
  maxEventLoopLagMs = Math.max(maxEventLoopLagMs, now - lastProbe - 10);
  lastProbe = now;
}, 10);
const concurrentStarted = performance.now();
const concurrentHashLatenciesMs = await Promise.all(
  Array.from(
    { length: CONCURRENT_OPERATIONS },
    async () => (await timedHash()).elapsedMs,
  ),
);
const concurrentHashWallMs = performance.now() - concurrentStarted;

const concurrentVerifyStarted = performance.now();
const concurrentVerifyLatenciesMs = await Promise.all(
  Array.from({ length: CONCURRENT_OPERATIONS }, () =>
    timedVerify(encoded, PASSWORD, true),
  ),
);
const concurrentVerifyWallMs = performance.now() - concurrentVerifyStarted;
clearInterval(probe);

const maxSingleLatencyMs = Math.max(...singleVerifyLatenciesMs);
const maxRssMiB = resourceUsage().maxRSS / 1024;
assert(
  maxSingleLatencyMs <= MAX_SINGLE_LATENCY_MS,
  `Single-hash latency ${maxSingleLatencyMs.toFixed(1)}ms exceeds gate.`,
);
assert(
  concurrentHashWallMs <= MAX_CONCURRENT_WALL_MS &&
    concurrentVerifyWallMs <= MAX_CONCURRENT_WALL_MS,
  `Concurrent wall time ${Math.max(concurrentHashWallMs, concurrentVerifyWallMs).toFixed(1)}ms exceeds gate.`,
);
assert(
  maxRssMiB <= MAX_RSS_MIB,
  `RSS ${maxRssMiB.toFixed(1)}MiB exceeds gate.`,
);
assert(
  maxEventLoopLagMs <= MAX_EVENT_LOOP_LAG_MS,
  `Event-loop lag ${maxEventLoopLagMs.toFixed(1)}ms exceeds gate.`,
);

console.log(
  JSON.stringify({
    gate: 'PASS',
    runtime: `${process.version} alpine`,
    limits: { cpu: 1, memoryMiB: 1_024 },
    profile: { algorithm: 'argon2id', version: 19, m: 7_168, t: 5, p: 1 },
    executorLimit: { active: CONCURRENT_OPERATIONS, queued: 0 },
    measurements: {
      concurrentHashLatenciesMs: concurrentHashLatenciesMs.map((value) =>
        Number(value.toFixed(1)),
      ),
      concurrentHashWallMs: Number(concurrentHashWallMs.toFixed(1)),
      concurrentVerifyLatenciesMs: concurrentVerifyLatenciesMs.map((value) =>
        Number(value.toFixed(1)),
      ),
      concurrentVerifyWallMs: Number(concurrentVerifyWallMs.toFixed(1)),
      maxEventLoopLagMs: Number(maxEventLoopLagMs.toFixed(1)),
      maxRssMiB: Number(maxRssMiB.toFixed(1)),
      singleVerifyLatenciesMs: singleVerifyLatenciesMs.map((value) =>
        Number(value.toFixed(1)),
      ),
    },
  }),
);
