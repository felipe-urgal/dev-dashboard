import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isLinuxProcessIdentity,
  parseLinuxProcessStartTicks,
  readLinuxProcessIdentity,
} from '../src/services/linux-process-identity.js';

const BOOT = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

function stat(
  pid: number,
  comm = 'worker with ) tricky name',
  tick = '123456789',
) {
  // field 3 = S, field 22 = starttime. 19 tokens from field 3 to 22.
  return (
    pid +
    ' (' +
    comm +
    ') S ' +
    [...Array.from({ length: 18 }, () => '0'), tick, '0'].join(' ') +
    '\n'
  );
}

test('parses Linux start ticks despite comm spaces and closing parentheses', () => {
  assert.equal(parseLinuxProcessStartTicks(stat(128)), '123456789');
  assert.equal(parseLinuxProcessStartTicks(stat(128, 'normal', '999')), '999');
  assert.equal(parseLinuxProcessStartTicks('invalid'), null);
  assert.equal(parseLinuxProcessStartTicks('0 (bad) S 1 2'), null);
  assert.equal(parseLinuxProcessStartTicks('123 (too short) S 1 2 3'), null);
});

test('validates process incarnation without PID-alone identity', () => {
  assert.equal(
    isLinuxProcessIdentity({ bootId: BOOT, startTicks: '12345' }),
    true,
  );
  assert.equal(isLinuxProcessIdentity({ bootId: BOOT, startTicks: -1 }), false);
  assert.equal(
    isLinuxProcessIdentity({ bootId: 'other', startTicks: '123' }),
    false,
  );
  assert.equal(isLinuxProcessIdentity(null), false);
});

test('self-identity is best effort on Linux, invalid PID always unknown', () => {
  assert.equal(readLinuxProcessIdentity(0), null);
  assert.equal(readLinuxProcessIdentity(-7), null);
  assert.equal(readLinuxProcessIdentity(Number.POSITIVE_INFINITY), null);
  const own = readLinuxProcessIdentity(process.pid);
  if (process.platform === 'linux' && own !== null) {
    assert.equal(isLinuxProcessIdentity(own), true);
  }
});
