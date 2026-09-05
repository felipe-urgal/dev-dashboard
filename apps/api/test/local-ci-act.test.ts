import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildActJobCommand,
  buildActListCommand,
  createLocalCiCatalog,
} from '../src/services/local-ci-act.js';

const available = {
  state: 'available' as const,
  actVersion: '0.2.0',
  dockerVersion: '28.0.0',
};

function catalog() {
  return createLocalCiCatalog({
    availability: available,
    jobs: [
      {
        workflowFile: '.github/workflows/ci.yml',
        workflow: 'CI',
        jobId: 'validate',
        job: 'Validate',
        events: ['pull_request', 'push'],
      },
    ],
  });
}

test('marca Local CI permanentemente como aproximação', () => {
  const result = catalog();
  assert.equal(result.provider, 'act');
  assert.equal(result.approximation, true);
});

test('constrói argv somente para job e evento presentes no catálogo', () => {
  assert.deepEqual(
    buildActJobCommand(catalog(), {
      workflowFile: '.github/workflows/ci.yml',
      jobId: 'validate',
      event: 'pull_request',
    }),
    {
      program: 'act',
      args: [
        'pull_request',
        '--job',
        'validate',
        '--workflows',
        '.github/workflows/ci.yml',
      ],
    },
  );
});

test('rejeita job, evento e workflow arbitrários', () => {
  assert.throws(
    () =>
      buildActJobCommand(catalog(), {
        workflowFile: '.github/workflows/ci.yml',
        jobId: 'shell --secret-file /tmp/x',
        event: 'pull_request',
      }),
    /inválido/,
  );

  assert.throws(
    () =>
      buildActJobCommand(catalog(), {
        workflowFile: '../outside.yml',
        jobId: 'validate',
        event: 'pull_request',
      }),
    /Workflow fora/,
  );

  assert.throws(
    () =>
      buildActJobCommand(catalog(), {
        workflowFile: '.github/workflows/ci.yml',
        jobId: 'validate',
        event: '--secret',
      }),
    /inválido/,
  );
});

test('descarta tokens de catálogo que poderiam ser interpretados como opções do act', () => {
  const result = createLocalCiCatalog({
    availability: available,
    jobs: [
      {
        workflowFile: '.github/workflows/ci.yml',
        workflow: 'CI',
        jobId: '--secret',
        job: 'Malicioso',
        events: ['pull_request'],
      },
      {
        workflowFile: '.github/workflows/security.yml',
        workflow: 'Security',
        jobId: 'scan',
        job: 'Scan',
        events: ['--secret', 'workflow_dispatch'],
      },
    ],
  });

  assert.deepEqual(result.jobs, [
    {
      workflowFile: '.github/workflows/security.yml',
      workflow: 'Security',
      jobId: 'scan',
      job: 'Scan',
      events: ['workflow_dispatch'],
    },
  ]);
});

test('catálogo limita jobs, eventos, labels, versions e paths', () => {
  const jobs = Array.from({ length: 600 }, (_, index) => ({
    workflowFile: `.github/workflows/job-${index}.yml`,
    workflow: `Workflow ${index}`,
    jobId: `job-${index}`,
    job: `Job ${index}`,
    events: Array.from({ length: 100 }, (_, event) => `event-${event}`),
  }));
  jobs.unshift({
    workflowFile: `.github/workflows/${'x'.repeat(1_100)}.yml`,
    workflow: 'Path longo',
    jobId: 'long-path',
    job: 'Long Path',
    events: ['push'],
  });
  jobs.unshift({
    workflowFile: '.github/workflows/long-label.yml',
    workflow: 'x'.repeat(300),
    jobId: 'long-label',
    job: 'Long Label',
    events: ['push'],
  });

  const result = createLocalCiCatalog({
    availability: {
      state: 'available',
      actVersion: 'x'.repeat(300),
      dockerVersion: '28.0.0',
    },
    jobs,
  });

  assert.equal(result.jobs.length, 512);
  assert.equal(result.jobs[0]?.events.length, 64);
  assert.equal(result.availability.actVersion, undefined);
  assert.equal(result.availability.dockerVersion, '28.0.0');
  assert.equal(
    result.jobs.some((job) => job.jobId === 'long-path'),
    false,
  );
  assert.equal(
    result.jobs.some((job) => job.jobId === 'long-label'),
    false,
  );
});

test('não constrói execução quando act ou Docker estão indisponíveis', () => {
  for (const state of ['act-missing', 'docker-unavailable'] as const) {
    const unavailable = createLocalCiCatalog({
      availability: { state },
      jobs: catalog().jobs,
    });

    assert.throws(
      () =>
        buildActJobCommand(unavailable, {
          workflowFile: '.github/workflows/ci.yml',
          jobId: 'validate',
          event: 'pull_request',
        }),
      /indisponível/,
    );
  }
});

test('listagem usa somente workflow relativo conhecido pela convenção GitHub', () => {
  assert.deepEqual(buildActListCommand(), { program: 'act', args: ['--list'] });
  assert.deepEqual(buildActListCommand('.github/workflows/security.yaml'), {
    program: 'act',
    args: ['--list', '--workflows', '.github/workflows/security.yaml'],
  });
  assert.throws(() => buildActListCommand('/tmp/ci.yml'), /Workflow fora/);
  assert.throws(() => buildActListCommand('C:\\tmp\\ci.yml'), /Workflow fora/);
});
