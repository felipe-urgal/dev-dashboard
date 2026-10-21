import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  Project,
  ServiceCatalogEntry,
  ServiceCatalogSnapshot,
} from '@dev-dashboard/contracts';
import {
  ServiceDiagnosticsService,
  ServiceDiagnosticsError,
} from '../src/services/service-diagnostics-service.js';

const NOW = new Date('2026-10-20T14:00:00Z');
const environment = 'environment:primary:loto';
const project: Project = {
  id: 'loto',
  name: 'Loto',
  path: '/fake/loto',
  source: 'workspace',
  workspaceId: 'lab',
  type: 'node',
  enabled: true,
  capabilities: [],
};
const caps = {
  observe: 'supported',
  start: 'unsupported',
  stop: 'unsupported',
  restart: 'unsupported',
  'boot-policy': 'unsupported',
} as const;

function entry(
  overrides: Partial<ServiceCatalogEntry> = {},
): ServiceCatalogEntry {
  return {
    id: 'systemd:user:fixture.service',
    name: 'fixture.service',
    displayName: 'Fixture',
    provider: 'systemd',
    scope: 'user',
    evidence: { source: 'systemd', identity: 'systemd:user:fixture.service' },
    capabilities: caps,
    state: 'running',
    readiness: 'unknown',
    ownership: 'unmanaged',
    ports: [],
    observedAt: NOW.toISOString(),
    ...overrides,
  };
}

function setup(
  options: {
    value?: ServiceCatalogEntry;
    stale?: boolean;
    denied?: boolean;
    journalFailure?: boolean;
    catalogFailure?: boolean;
    activityFailure?: boolean;
  } = {},
) {
  const value = options.value ?? entry();
  const journalCalls: string[] = [];
  const composeCalls: string[] = [];
  const snapshot: ServiceCatalogSnapshot = {
    status: 'ready',
    truncated: false,
    observedAt: NOW.toISOString(),
    providers: [],
    ports: [],
    entries: [value],
  };
  const service = new ServiceDiagnosticsService(
    {
      projects: {
        findProject: (id: string) => (id === project.id ? project : null),
      },
      bindings: {
        byProject: (id: string) =>
          id === 'loto'
            ? [
                {
                  id: 'a'.repeat(36),
                  projectId: 'loto',
                  environmentInstanceId: environment,
                  serviceRef: value.id,
                  relation: 'observed' as const,
                  enabled: true,
                  requiredForStart: false,
                  dependencies: [],
                  createdAt: NOW.toISOString(),
                  updatedAt: NOW.toISOString(),
                },
              ]
            : [],
      },
      catalog: {
        inspect: async () => {
          if (options.catalogFailure) throw Error('private catalog credential');
          return snapshot;
        },
      },
      compose: {
        logs: async (_project, input) => {
          composeCalls.push(input.service ?? '');
          return {
            content: 'log file',
            masked: false,
            truncated: false,
            redactionCount: 0,
            readAt: NOW.toISOString(),
          };
        },
      },
      processes: {
        listProcesses: async () => [
          {
            id: 'test-process',
            projectId: 'loto',
            kind: 'server' as const,
            environmentInstanceId: environment,
            status: 'running' as const,
          },
        ],
        readServerLog: async () => ({
          projectId: 'loto',
          processId: 'test-process',
          content: 'api started',
          sizeBytes: 11,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: NOW.toISOString(),
        }),
        readWorkerLog: async () => {
          throw Error('not required');
        },
        readTestLog: async () => {
          throw Error('not required');
        },
      },
      journal: {
        read: async (scope, name) => {
          journalCalls.push(scope + ':' + name);
          if (options.journalFailure)
            throw Error('secret journal path /home/private/access-token');
          return options.denied
            ? {
                status: 'unavailable' as const,
                masked: false,
                truncated: false,
                diagnostic: 'Journal indisponível por permissão',
              }
            : {
                status: 'available' as const,
                masked: true,
                truncated: false,
                content: 'PASSWORD=[REDACTED]\n',
              };
        },
      },
      activity: {
        readProject: async () => {
          if (options.activityFailure) throw Error('internal private activity');
          return {
            generatedAt: NOW.toISOString(),
            partial: false,
            unavailableDomains: [],
            events: [
              {
                id: 'evt1',
                type: 'compose.confirmed-start',
                status: 'succeeded' as const,
                projectId: 'loto',
                domain: 'compose' as const,
                occurredAt: NOW.toISOString(),
                summary: 'sensitive private value not copied',
                resourceRef: { kind: 'compose-service', id: value.id },
              },
            ],
            jobs: [],
          };
        },
      },
    },
    { now: () => (options.stale ? new Date('2026-10-20T14:10:00Z') : NOW) },
  );
  return { service, journalCalls, composeCalls };
}

test('resolved bound unit returns journal and matching activity ids, not summaries', async () => {
  const { service, journalCalls } = setup();
  const result = await service.read(
    'loto',
    'systemd:user:fixture.service',
    environment,
  );
  assert.equal(result.status, 'available');
  assert.equal(result.source, 'journal');
  assert.equal(result.stale, false);
  assert.equal(result.readiness, 'unknown');
  assert.deepEqual(journalCalls, ['user:fixture.service']);
  assert.equal(result.events.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /sensitive private value/);
});

test('unexpected journal provider error is isolated and keeps Activity evidence', async () => {
  const { service, journalCalls } = setup({ journalFailure: true });
  const result = await service.read('loto', 'systemd:user:fixture.service');
  assert.deepEqual(journalCalls, ['user:fixture.service']);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.source, 'journal');
  assert.equal(result.partial, true);
  assert.equal(result.content, undefined);
  assert.equal(result.events.length, 1);
  assert.match(result.diagnostic ?? '', /Journal reader failed/);
  assert.doesNotMatch(
    JSON.stringify(result),
    /secret|access-token|\/home\/private/,
  );
});

test('denied journal is unavailable not empty; stale timestamps and partial Activity visible', async () => {
  const { service } = setup({
    denied: true,
    stale: true,
    activityFailure: true,
  });
  const result = await service.read('loto', 'systemd:user:fixture.service');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.partial, true);
  assert.equal(result.stale, true);
  assert.match(result.diagnostic ?? '', /permissão/);
});

test('unknown service is denied before any owner log reader call', async () => {
  const { service, journalCalls, composeCalls } = setup();
  await assert.rejects(
    service.read('loto', 'systemd:system:other.service'),
    (error: unknown) =>
      error instanceof ServiceDiagnosticsError && error.code === 'NOT_FOUND',
  );
  await assert.rejects(service.read('other', 'systemd:user:fixture.service'));
  await assert.rejects(
    service.read(
      'loto',
      'systemd:user:fixture.service',
      'environment:primary:other',
    ),
  );
  assert.deepEqual(journalCalls, []);
  assert.deepEqual(composeCalls, []);
});

test('Compose ownership is rechecked and never reads another project log', async () => {
  const id = 'compose:loto:db';
  const owned = entry({
    id,
    provider: 'compose',
    name: 'db',
    scope: 'environment',
    evidence: { source: 'compose-owner', identity: id },
    projectId: 'loto',
    environmentInstanceId: environment,
    ownership: 'confirmed',
  });
  const good = setup({ value: owned });
  assert.equal((await good.service.read('loto', id)).status, 'available');
  assert.deepEqual(good.composeCalls, ['db']);
  const other = setup({ value: { ...owned, projectId: 'other' } });
  const response = await other.service.read('loto', id);
  assert.equal(response.status, 'unavailable');
  assert.deepEqual(other.composeCalls, []);
});

test('existing Process Manager reader is used for owned process', async () => {
  const id = 'process:test-process';
  const { service } = setup({
    value: entry({
      id,
      provider: 'managed-process',
      name: 'server · test-process',
      displayName: 'server',
      scope: 'environment',
      evidence: { source: 'process-manager', identity: id },
      projectId: 'loto',
      environmentInstanceId: environment,
      ownership: 'confirmed',
    }),
  });
  const result = await service.read('loto', id);
  assert.equal(result.status, 'available');
  assert.equal(result.content, 'api started');
  assert.equal(result.source, 'process');
});

test('catalog failures remain partial without leaking provider details', async () => {
  const { service, journalCalls } = setup({ catalogFailure: true });
  const snapshot = await service.read('loto', 'systemd:user:fixture.service');
  assert.equal(snapshot.status, 'unavailable');
  assert.equal(snapshot.partial, true);
  assert.deepEqual(journalCalls, []);
  assert.doesNotMatch(JSON.stringify(snapshot), /private catalog credential/);
});
