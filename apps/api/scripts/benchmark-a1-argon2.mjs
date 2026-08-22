import { readFileSync } from 'node:fs';
import { resourceUsage } from 'node:process';
import { performance } from 'node:perf_hooks';
import { argon2id, hash } from 'argon2';

const EXPECTED_NODE = 'v24.5.0';
const EXPECTED_MEMORY_BYTES = 512 * 1024 * 1024;
const EXPECTED_CPU_MAX = '100000 100000';
const MAX_SINGLE_LATENCY_MS = 1_500;
const MAX_CONCURRENT_WALL_MS = 2_500;
const MAX_RSS_MIB = 384;
const MAX_EVENT_LOOP_LAG_MS = 250;
const PASSWORD = 'A1 resource gate passphrase 2026';
const OPTIONS = {
  hashLength: 32,
  memoryCost: 65_536,
  parallelism: 1,
  timeCost: 3,
  type: argon2id,
  version: 0x13,
};
const PHC_PROFILE = /^\$argon2id\$v=19\$m=65536,p=1,t=3\$/;

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
  return performance.now() - started;
}

assert(process.version === EXPECTED_NODE, `Expected Node ${EXPECTED_NODE}.`);
assert(read('/etc/alpine-release').length > 0, 'Expected Alpine Linux.');
assert(
  Number(read('/sys/fs/cgroup/memory.max')) === EXPECTED_MEMORY_BYTES,
  'Expected a 512 MiB cgroup memory limit.',
);
assert(
  read('/sys/fs/cgroup/cpu.max') === EXPECTED_CPU_MAX,
  'Expected a one-CPU cgroup quota.',
);

await timedHash();

const singleLatenciesMs = [];
for (let attempt = 0; attempt < 3; attempt += 1) {
  singleLatenciesMs.push(await timedHash());
}

let lastProbe = performance.now();
let maxEventLoopLagMs = 0;
const probe = setInterval(() => {
  const now = performance.now();
  maxEventLoopLagMs = Math.max(maxEventLoopLagMs, now - lastProbe - 10);
  lastProbe = now;
}, 10);
const concurrentStarted = performance.now();
const concurrentLatenciesMs = await Promise.all([timedHash(), timedHash()]);
const concurrentWallMs = performance.now() - concurrentStarted;
clearInterval(probe);

const maxSingleLatencyMs = Math.max(...singleLatenciesMs);
const maxRssMiB = resourceUsage().maxRSS / 1024;
assert(
  maxSingleLatencyMs <= MAX_SINGLE_LATENCY_MS,
  `Single-hash latency ${maxSingleLatencyMs.toFixed(1)}ms exceeds gate.`,
);
assert(
  concurrentWallMs <= MAX_CONCURRENT_WALL_MS,
  `Concurrent wall time ${concurrentWallMs.toFixed(1)}ms exceeds gate.`,
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
    limits: { cpu: 1, memoryMiB: 512 },
    profile: { algorithm: 'argon2id', version: 19, m: 65_536, t: 3, p: 1 },
    measurements: {
      concurrentLatenciesMs: concurrentLatenciesMs.map((value) =>
        Number(value.toFixed(1)),
      ),
      concurrentWallMs: Number(concurrentWallMs.toFixed(1)),
      maxEventLoopLagMs: Number(maxEventLoopLagMs.toFixed(1)),
      maxRssMiB: Number(maxRssMiB.toFixed(1)),
      singleLatenciesMs: singleLatenciesMs.map((value) =>
        Number(value.toFixed(1)),
      ),
    },
  }),
);
