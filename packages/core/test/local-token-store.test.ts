import assert from 'node:assert/strict';

import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { test } from 'node:test';

import {
  LocalTokenStore,
  LocalTokenStoreError,
  secureTokenEqual,
} from '../src/index.js';

async function createFixture(): Promise<{
  configDirectory: string;
  cleanup: () => Promise<void>;
}> {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-token-'),
  );

  return {
    configDirectory: path.join(fixtureRoot, 'config'),

    cleanup: async () => {
      await rm(fixtureRoot, {
        recursive: true,
        force: true,
      });
    },
  };
}

test('creates and reuses a restricted local token', async (context) => {
  const fixture = await createFixture();

  context.after(fixture.cleanup);

  const store = new LocalTokenStore(fixture.configDirectory);

  const firstToken = await store.getOrCreate();
  const secondToken = await store.getOrCreate();

  assert.match(firstToken, /^[a-f0-9]{64}$/);
  assert.equal(secondToken, firstToken);

  const directoryStats = await stat(fixture.configDirectory);

  assert.equal(directoryStats.mode & 0o777, 0o700);

  const tokenStats = await stat(store.filePath);

  assert.equal(tokenStats.mode & 0o777, 0o600);
});

test('creates one token during concurrent first use', async (context) => {
  const fixture = await createFixture();

  context.after(fixture.cleanup);

  const stores = Array.from(
    {
      length: 16,
    },
    () => new LocalTokenStore(fixture.configDirectory),
  );

  const tokens = await Promise.all(stores.map((store) => store.getOrCreate()));

  assert.equal(new Set(tokens).size, 1);

  assert.match(tokens[0] ?? '', /^[a-f0-9]{64}$/);
});

test('rejects an invalid token file', async (context) => {
  const fixture = await createFixture();

  context.after(fixture.cleanup);

  const store = new LocalTokenStore(fixture.configDirectory);

  await mkdir(fixture.configDirectory, {
    recursive: true,
    mode: 0o700,
  });

  await writeFile(store.filePath, 'invalid-token\n', {
    encoding: 'utf8',
    mode: 0o600,
  });

  await assert.rejects(store.read(), (error: unknown) => {
    assert.ok(error instanceof LocalTokenStoreError);

    assert.equal(error.code, 'INVALID_TOKEN_FILE');

    return true;
  });
});

test('compares tokens without accepting different lengths', () => {
  const token = 'a'.repeat(64);

  assert.equal(secureTokenEqual(token, token), true);

  assert.equal(secureTokenEqual('b'.repeat(64), token), false);

  assert.equal(secureTokenEqual('short', token), false);

  assert.equal(secureTokenEqual(undefined, token), false);
});
