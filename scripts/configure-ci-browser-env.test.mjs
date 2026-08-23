import assert from 'node:assert/strict';
import test from 'node:test';

import { configureCiBrowserEnvironment } from './configure-ci-browser-env.mjs';

test('masks every generated credential before exporting the exact same values', () => {
  const generated = [
    Buffer.alloc(32, 0x11),
    Buffer.alloc(32, 0x22),
    Buffer.alloc(24, 0x33),
  ];
  const events = [];
  let generationIndex = 0;

  const settings = configureCiBrowserEnvironment({
    appendEnvironment(path, content) {
      events.push({ content, path, type: 'append' });
    },
    githubEnvironmentPath: '/disposable/github-env',
    randomBytesForCi(size) {
      const value = generated[generationIndex];
      generationIndex += 1;
      assert.equal(value.length, size);
      return value;
    },
    writeMask(value) {
      events.push({ type: 'mask', value });
    },
  });

  const credentialValues = [
    settings.AUTH_CSRF_KEYRING,
    settings.CART_CSRF_KEYRING,
    settings.POSTGRES_PASSWORD,
  ];
  assert.equal(new Set(credentialValues).size, 3);
  assert.deepEqual(
    events.slice(0, 3),
    credentialValues.map((value) => ({ type: 'mask', value })),
  );
  assert.equal(events[3]?.type, 'append');
  assert.equal(events.length, 4);

  const exportedSettings = Object.fromEntries(
    events[3].content
      .trimEnd()
      .split('\n')
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  assert.deepEqual(exportedSettings, settings);
  assert.equal(
    settings.API_DATABASE_URL,
    `postgresql://hopbarley:${settings.POSTGRES_PASSWORD}@postgres:5432/hopbarley?schema=public`,
  );
});
