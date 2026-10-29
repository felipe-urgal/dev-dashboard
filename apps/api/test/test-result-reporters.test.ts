import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseNodeTap,
  parseRspecJson,
  parseVitestJson,
  planStructuredReporter,
} from '../src/services/test-result-reporters.js';

const PROJECT = '/work/app';

test('parseRspecJson resume a execução e lista cada falha com arquivo e linha', () => {
  const result = parseRspecJson(
    JSON.stringify({
      examples: [
        {
          status: 'passed',
          file_path: './spec/models/user_spec.rb',
          line_number: 3,
          full_description: 'User valida nome',
        },
        {
          status: 'failed',
          file_path: './spec/models/order_spec.rb',
          line_number: 42,
          full_description: 'Order calcula total',
          exception: {
            class: 'RSpec::Expectations::ExpectationNotMetError',
            message: 'expected 3, got 2',
            backtrace: ['./spec/models/order_spec.rb:43:in `block`'],
          },
        },
        { status: 'pending', file_path: './spec/x_spec.rb', line_number: 1 },
      ],
      summary: {
        duration: 1.5,
        example_count: 3,
        failure_count: 1,
        pending_count: 1,
      },
    }),
    PROJECT,
  );

  assert.ok(result);
  assert.deepEqual(result.summary, {
    total: 3,
    passed: 1,
    failed: 1,
    pending: 1,
    durationMs: 1500,
  });
  assert.deepEqual(result.failedFiles, ['spec/models/order_spec.rb']);
  assert.equal(result.failures[0]?.name, 'Order calcula total');
  assert.deepEqual(result.failures[0]?.location, {
    path: 'spec/models/order_spec.rb',
    line: 42,
  });
  assert.equal(result.failures[0]?.message, 'expected 3, got 2');
});

test('parseVitestJson converte caminhos absolutos em relativos ao projeto', () => {
  const result = parseVitestJson(
    JSON.stringify({
      numTotalTests: 3,
      numPassedTests: 2,
      numFailedTests: 1,
      numPendingTests: 0,
      testResults: [
        {
          name: `${PROJECT}/src/a.test.ts`,
          startTime: 1000,
          endTime: 1400,
          assertionResults: [
            { fullName: 'soma ok', status: 'passed' },
            {
              fullName: 'soma falha',
              status: 'failed',
              failureMessages: ['AssertionError: expected 1 to be 2\n  at a.test.ts:5'],
              location: { line: 5, column: 3 },
            },
          ],
        },
      ],
    }),
    PROJECT,
  );

  assert.ok(result);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.summary.durationMs, 400);
  assert.deepEqual(result.failedFiles, ['src/a.test.ts']);
  assert.equal(result.failures[0]?.message, 'AssertionError: expected 1 to be 2');
  assert.equal(result.failures[0]?.location?.line, 5);
});

test('parseNodeTap lê falhas de testes e ignora a falha agregada do arquivo', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: passa',
    'ok 1 - passa',
    '  ---',
    '  duration_ms: 0.8',
    "  type: 'test'",
    '  ...',
    '# Subtest: falha de verdade',
    'not ok 2 - falha de verdade',
    '  ---',
    '  duration_ms: 0.6',
    "  type: 'test'",
    `  location: '${PROJECT}/test/a.test.js:12:3'`,
    "  failureType: 'testCodeFailure'",
    "  error: '1 == 2'",
    "  code: 'ERR_ASSERTION'",
    '  expected: 2',
    '  actual: 1',
    '  stack: |-',
    `    TestContext.<anonymous> (${PROJECT}/test/a.test.js:12:3)`,
    '  ...',
    'not ok 3 - agregado do arquivo',
    '  ---',
    "  failureType: 'subtestsFailed'",
    "  error: '1 subtest failed'",
    '  ...',
    '1..3',
    '# tests 3',
    '# pass 1',
    '# fail 1',
    '# skipped 1',
    '# duration_ms 52.5',
  ].join('\n');

  const result = parseNodeTap(tap, PROJECT);

  assert.ok(result);
  assert.deepEqual(result.summary, {
    total: 3,
    passed: 1,
    failed: 1,
    pending: 1,
    durationMs: 53,
  });
  assert.equal(result.failures.length, 1);
  assert.deepEqual(result.failures[0]?.location, {
    path: 'test/a.test.js',
    line: 12,
  });
  assert.equal(result.failures[0]?.expected, '2');
  assert.equal(result.failures[0]?.actual, '1');
  assert.deepEqual(result.failedFiles, ['test/a.test.js']);
});

test('planStructuredReporter acrescenta o reporter sem tirar a saída do terminal', async () => {
  const rspec = await planStructuredReporter('rspec', {
    command: 'bin/rspec',
    args: ['spec/a_spec.rb'],
  });
  assert.ok(rspec);
  assert.deepEqual(rspec.resolved.args.slice(0, 5), [
    'spec/a_spec.rb',
    '--format',
    'progress',
    '--format',
    'json',
  ]);

  const vitest = await planStructuredReporter('vitest', {
    command: 'npm',
    args: ['run', 'test'],
  });
  assert.ok(vitest);
  assert.deepEqual(vitest.resolved.args.slice(0, 4), [
    'run',
    'test',
    '--',
    '--reporter=default',
  ]);

  const node = await planStructuredReporter(
    'node-test',
    { command: 'npm', args: ['run', 'test'] },
    { NODE_OPTIONS: '--no-warnings' },
  );
  assert.ok(node);
  assert.deepEqual(node.resolved.args, ['run', 'test']);
  assert.match(
    node.env.NODE_OPTIONS ?? '',
    /^--no-warnings --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=/,
  );

  assert.equal(
    await planStructuredReporter('pytest', { command: 'pytest', args: [] }),
    null,
  );
});
