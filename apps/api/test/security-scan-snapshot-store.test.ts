import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { SecurityScanSnapshotStore } from '../src/services/security-scan-snapshot-store.js';
import type { SecurityScanResult } from '../src/services/trivy-security-scanner.js';

function project(projectPath: string): Project {
  return {
    id: 'project-security',
    name: 'Security',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'workspace-1',
    enabled: true,
    capabilities: [],
  };
}

function result(observedAt = '2026-09-21T10:00:00.000Z'): SecurityScanResult {
  return {
    provider: 'trivy',
    observedAt,
    findings: [
      {
        provider: 'trivy',
        category: 'misconfiguration',
        ruleId: 'CFG-1',
        severity: 'high',
        title: 'Configuração insegura',
        file: 'config/app.yml',
        remediation: 'Ajuste a configuração.',
        reference: 'https://example.com/security/CFG-1',
        fingerprint: 'a'.repeat(64),
        observedAt,
      },
    ],
  };
}

test('persiste somente allowlist sanitizada e restaura snapshot fresh', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'security-snapshot-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const knownProject = project('/tmp/security-project');
  const now = new Date('2026-09-21T11:00:00.000Z');
  const store = new SecurityScanSnapshotStore(directory, { now: () => now });

  const unsafe = {
    ...result(),
    rawStdout: 'SECRET=value',
    findings: [
      {
        ...result().findings[0],
        Match: 'SECRET=value',
        Code: { Lines: [{ Content: 'SECRET=value' }] },
      },
    ],
  } as unknown as SecurityScanResult;

  const saved = await store.save(knownProject, unsafe);
  assert.equal(saved.freshness.state, 'fresh');
  assert.equal(saved.freshness.ageMs, 3_600_000);

  const files = await readdir(directory);
  assert.equal(files.length, 1);
  const persisted = await readFile(path.join(directory, files[0]!), 'utf8');
  assert.equal(persisted.includes('SECRET=value'), false);
  assert.equal(persisted.includes('rawStdout'), false);
  assert.equal(persisted.includes('"Match"'), false);
  assert.equal(persisted.includes('"Code"'), false);

  const restored = await store.get(knownProject);
  assert.equal(restored?.result.findings[0]?.ruleId, 'CFG-1');
  assert.equal(restored?.freshness.state, 'fresh');
});

test('marca snapshot stale sem apagar evidência persistida', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'security-snapshot-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const knownProject = project('/tmp/security-project');
  const writer = new SecurityScanSnapshotStore(directory, {
    now: () => new Date('2026-09-21T11:00:00.000Z'),
  });
  await writer.save(knownProject, result());

  const reader = new SecurityScanSnapshotStore(directory, {
    now: () => new Date('2026-09-22T11:00:01.000Z'),
  });
  const restored = await reader.get(knownProject);

  assert.equal(restored?.freshness.state, 'stale');
  assert.equal(restored?.freshness.maxAgeMs, 86_400_000);
  assert.equal(restored?.freshness.ageMs, 90_001_000);
});

test('não reaproveita snapshot quando o mesmo projectId aponta para outro path', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'security-snapshot-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new SecurityScanSnapshotStore(directory, {
    now: () => new Date('2026-09-21T11:00:00.000Z'),
  });
  await store.save(project('/tmp/security-project-a'), result());

  assert.equal(await store.get(project('/tmp/security-project-b')), undefined);
});

test('timestamp futuro nunca é promovido a fresh', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'security-snapshot-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const knownProject = project('/tmp/security-project');
  const store = new SecurityScanSnapshotStore(directory, {
    now: () => new Date('2026-09-21T11:00:00.000Z'),
  });

  const saved = await store.save(
    knownProject,
    result('2026-09-21T12:00:00.000Z'),
  );

  assert.equal(saved.freshness.state, 'stale');
  assert.equal(saved.freshness.ageMs, 0);
});
