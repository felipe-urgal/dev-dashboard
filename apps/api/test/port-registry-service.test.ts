import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  DeclaredProjectPort,
  ObservedPort,
  ReservedPort,
} from '@dev-dashboard/contracts';

import {
  allocatePort,
  reconcilePorts,
} from '../src/services/port-registry-service.js';

const HOME_MUSIC_WEB: DeclaredProjectPort = {
  projectId: 'home-music',
  port: 5_173,
  role: 'web',
  source: 'project-profile',
  confidence: 'certain',
};

test('reconcilia porta declarada livre e processo esperado sem heurística de nome', () => {
  const free = reconcilePorts({ declared: [HOME_MUSIC_WEB] });
  assert.equal(free.entries[0]?.state, 'available');

  const observed: ObservedPort = {
    port: 5_173,
    owner: { kind: 'project', projectId: 'home-music', processId: 'server-1' },
  };
  const expected = reconcilePorts({
    declared: [HOME_MUSIC_WEB],
    observed: [observed],
  });
  assert.equal(expected.entries[0]?.state, 'expected');
});

test('marca conflito quando porta declarada está ocupada por processo externo', () => {
  const result = reconcilePorts({
    declared: [HOME_MUSIC_WEB],
    observed: [
      {
        port: 5_173,
        owner: { kind: 'external', pid: 28_313, name: 'python' },
      },
    ],
  });

  assert.equal(result.entries[0]?.state, 'conflict');
  assert.match(result.entries[0]?.explanation ?? '', /outro owner/);
});

test('diagnostica declaração duplicada e reserva alheia antes de observar a porta', () => {
  const duplicate = reconcilePorts({
    declared: [
      HOME_MUSIC_WEB,
      {
        projectId: 'portfolio-copilot',
        port: 5_173,
        role: 'web',
        source: 'manual',
        confidence: 'certain',
      },
    ],
  });
  assert.equal(duplicate.entries[0]?.state, 'duplicate-declaration');

  const reserved: ReservedPort = {
    port: 5_173,
    scope: 'user',
    owner: 'portfolio-copilot',
    role: 'web',
  };
  const conflict = reconcilePorts({
    reserved: [reserved],
    declared: [HOME_MUSIC_WEB],
  });
  assert.equal(conflict.entries[0]?.state, 'reserved-by-other');
});

test('distingue uso inesperado, owner desconhecido e declaration stale', () => {
  const unexpected = reconcilePorts({
    observed: [
      {
        port: 8_787,
        owner: { kind: 'project', projectId: 'home-music' },
      },
    ],
  });
  assert.equal(unexpected.entries[0]?.state, 'unexpected');

  const unknown = reconcilePorts({
    observed: [{ port: 6_379, owner: { kind: 'unknown' } }],
  });
  assert.equal(unknown.entries[0]?.state, 'unknown-owner');

  const stale = reconcilePorts({
    declared: [{ ...HOME_MUSIC_WEB, active: false }],
  });
  assert.equal(stale.entries[0]?.state, 'stale-declaration');
});

test('allocator pula reserved, declared e observed e escolhe deterministicamente', () => {
  const result = allocatePort(
    {
      reserved: [
        { port: 5_300, scope: 'user', owner: 'portfolio-copilot', role: 'web' },
      ],
      declared: [
        {
          projectId: 'outro-projeto',
          port: 5_301,
          role: 'web',
          source: 'manual',
          confidence: 'certain',
        },
      ],
      observed: [
        { port: 5_302, owner: { kind: 'external', pid: 42, name: 'node' } },
      ],
    },
    { preferredPort: 5_300, maxPort: 5_304, projectId: 'novo-worktree', role: 'web' },
  );

  assert.equal(result?.port, 5_303);
  assert.match(result?.explanation ?? '', /primeira livre/);
});

test('allocator permite reserva/declaration do próprio projeto e nunca escolhe porta privilegiada', () => {
  const result = allocatePort(
    {
      reserved: [{ port: 5_173, scope: 'user', owner: 'home-music', role: 'web' }],
      declared: [HOME_MUSIC_WEB],
    },
    { preferredPort: 443, maxPort: 5_173, projectId: 'home-music', role: 'web' },
  );

  assert.equal(result?.port, 1_024);
  assert.ok((result?.port ?? 0) >= 1_024);
});
