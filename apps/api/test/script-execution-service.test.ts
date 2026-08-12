import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import type { Project, ScriptExecutionEvent } from '@dev-dashboard/contracts';
import { ScriptDetectionService } from '../src/services/script-detection-service.js';
import {
  ScriptExecutionError,
  ScriptExecutionService,
} from '../src/services/script-execution-service.js';

async function fixture(script = 'node -e "console.log(123)"'): Promise<{
  root: string;
  project: Project;
  service: ScriptExecutionService;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'dashboard-script-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { lint: script, build: script } }),
  );
  await writeFile(path.join(root, 'package-lock.json'), '{}');
  const project = {
    id: 'projeto-1',
    workspaceId: 'workspace-1',
    name: 'Projeto',
    path: root,
    type: 'node',
    capabilities: [],
  } as Project;
  return {
    root,
    project,
    service: new ScriptExecutionService(new ScriptDetectionService(), root),
  };
}

test('executa item atual da allowlist sem shell e disponibiliza log', async (t) => {
  const { root, project, service } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const started = await service.start(project, 'package-script:lint');
  let current = started;
  for (
    let attempt = 0;
    attempt < 50 && current.status === 'running';
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    current = await service.get(project.id, started.id);
  }
  assert.equal(current.status, 'succeeded');
  assert.match((await service.log(project.id, started.id)).content, /123/);
  assert.deepEqual(await service.latest(project.id), current);
  assert.equal(await service.latest('outro-projeto'), null);
});

test('mascara credenciais no log antes de devolvê-lo', async (t) => {
  const { root, project, service } = await fixture(
    `node -e "console.log('token=segredo-do-projeto')"`,
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const started = await service.start(project, 'package-script:lint');
  let current = started;
  for (
    let attempt = 0;
    attempt < 50 && current.status === 'running';
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    current = await service.get(project.id, started.id);
  }

  const log = await service.log(project.id, started.id);
  assert.equal(log.content.includes('segredo-do-projeto'), false);
  assert.equal(log.masked, true);
  assert.ok(log.redactionCount >= 1);
});

test('exige confirmação vinculada para ação mutável', async (t) => {
  const { root, project, service } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => service.start(project, 'package-script:build'),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_CONFIRMATION_REQUIRED',
  );
  const confirmation = await service.prepareConfirmation(
    project,
    'package-script:build',
  );
  const started = await service.start(
    project,
    'package-script:build',
    confirmation.token,
  );
  let current = started;
  for (
    let attempt = 0;
    attempt < 50 && current.status === 'running';
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    current = await service.get(project.id, started.id);
  }
  assert.equal(current.status, 'succeeded');
  await assert.rejects(
    () => service.start(project, 'package-script:build', confirmation.token),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_CONFIRMATION_REQUIRED',
  );
});

test('valida variáveis redetectadas, vincula a confirmação e usa ambiente estruturado', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dashboard-rake-variables-'));
  const rails = path.join(root, 'bin', 'rails');
  await mkdir(path.dirname(rails), { recursive: true });
  await mkdir(path.join(root, 'lib', 'tasks'), { recursive: true });
  await writeFile(rails, '#!/bin/sh\nprintf "%s|%s\\n" "$FILE" "$LIMIT"\n');
  await chmod(rails, 0o755);
  await writeFile(
    path.join(root, 'lib', 'tasks', 'imports.rake'),
    `
desc 'Importa registros'
task import: :environment do
  file = ENV['FILE']
  raise 'Use bin/rails import FILE=tmp/import.csv' if file.blank?
  limit = ENV.fetch('LIMIT', 100)
end
`,
  );
  const project = {
    id: 'rails-1',
    name: 'Rails',
    path: root,
    type: 'rails',
    source: 'standalone',
    enabled: true,
    capabilities: ['scripts'],
  } as Project;
  const service = new ScriptExecutionService(
    new ScriptDetectionService(),
    root,
  );
  t.after(() => {
    service.close();
    return rm(root, { recursive: true, force: true });
  });

  await assert.rejects(
    () => service.prepareConfirmation(project, 'rails-task:import'),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_VARIABLES_INVALID',
  );
  await assert.rejects(
    () =>
      service.prepareConfirmation(project, 'rails-task:import', {
        FILE: 'ok',
        EXTRA: 'não',
      }),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_VARIABLES_INVALID',
  );
  const mismatched = await service.prepareConfirmation(
    project,
    'rails-task:import',
    { FILE: 'tmp/um.csv' },
  );
  await assert.rejects(
    () =>
      service.start(project, 'rails-task:import', mismatched.token, {
        FILE: 'tmp/outro.csv',
      }),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_CONFIRMATION_REQUIRED',
  );

  const variables = { FILE: 'tmp/import.csv', LIMIT: '25' };
  const confirmation = await service.prepareConfirmation(
    project,
    'rails-task:import',
    variables,
  );
  const started = await service.start(
    project,
    'rails-task:import',
    confirmation.token,
    variables,
  );
  let current = started;
  for (
    let attempt = 0;
    attempt < 50 && current.status === 'running';
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    current = await service.get(project.id, started.id);
  }
  assert.equal(current.status, 'succeeded');
  assert.match(
    (await service.log(project.id, started.id)).content,
    /tmp\/import\.csv\|25/,
  );
});

test('reserva o projeto antes da detecção assíncrona', async (t) => {
  const { root, project, service } = await fixture(
    'node -e "setTimeout(() => {}, 200)"',
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = service.start(project, 'package-script:lint');
  await assert.rejects(
    () => service.start(project, 'package-script:lint'),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_ALREADY_RUNNING',
  );
  await first;
});

test('rejeita ação manipulada e lockfiles ambíguos', async (t) => {
  const { root, project, service } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => service.start(project, 'package-script:nao-existe'),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_NOT_FOUND',
  );
  await writeFile(path.join(root, 'yarn.lock'), '');
  await assert.rejects(
    () => service.start(project, 'package-script:lint'),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_MANAGER_AMBIGUOUS',
  );
});

test('restaura histórico terminal, pagina e mantém logs após reinício', async (t) => {
  const { root, project, service } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const started = await service.start(project, 'package-script:lint');
  let current = started;
  for (
    let attempt = 0;
    attempt < 50 && current.status === 'running';
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    current = await service.get(project.id, started.id);
  }
  const stateFile = path.join(root, 'scripts', `${started.id}.json`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const stored = JSON.parse(await readFile(stateFile, 'utf8')) as {
      execution: { status: string };
    };
    if (stored.execution.status !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const restored = new ScriptExecutionService(
    new ScriptDetectionService(),
    root,
  );
  assert.deepEqual(await restored.get(project.id, started.id), current);
  assert.equal((await restored.history(project.id, 1, 1)).total, 1);
  assert.match((await restored.log(project.id, started.id)).content, /123/);
});

test('reconcilia execução órfã e ignora registro corrompido', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dashboard-history-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'scripts');
  await mkdir(directory, { recursive: true });
  const execution = {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    projectId: 'projeto-1',
    actionId: 'package-script:lint',
    actionName: 'lint',
    risk: 'read-only',
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(directory, `${execution.id}.json`),
    JSON.stringify({ version: 1, execution }),
  );
  await writeFile(path.join(directory, `${execution.id}.log`), 'resultado\n');
  await writeFile(
    path.join(directory, 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb.json'),
    '{inválido',
  );
  const service = new ScriptExecutionService(
    new ScriptDetectionService(),
    root,
  );
  const restored = await service.get('projeto-1', execution.id);
  assert.equal(restored.status, 'failed');
  assert.ok(restored.finishedAt);
  assert.equal((await service.history('projeto-1')).total, 1);
});

test('remove por idade enquanto a API permanece ativa', async (t) => {
  const { root, project } = await fixture();
  const service = new ScriptExecutionService(
    new ScriptDetectionService(),
    root,
    {
      retentionMs: 100,
      sweepIntervalMs: 20,
    },
  );
  t.after(() => {
    service.close();
    return rm(root, { recursive: true, force: true });
  });

  const started = await service.start(project, 'package-script:lint');
  let current = started;
  for (
    let attempt = 0;
    attempt < 50 && current.status === 'running';
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    current = await service.get(project.id, started.id);
  }
  assert.equal(current.status, 'succeeded');

  for (
    let attempt = 0;
    attempt < 30 && (await service.history(project.id)).total > 0;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal((await service.history(project.id)).total, 0);
  await assert.rejects(
    () => service.get(project.id, started.id),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_EXECUTION_NOT_FOUND',
  );
});

test('publica estado e log somente para assinantes da execução reconhecida', async (t) => {
  const { root, project, service } = await fixture(
    `node -e "console.log('evento seguro'); setTimeout(() => {}, 80)"`,
  );
  t.after(() => {
    service.close();
    return rm(root, { recursive: true, force: true });
  });
  const started = await service.start(project, 'package-script:lint');
  const events: ScriptExecutionEvent[] = [];
  const closed = new Promise<void>((resolve) => {
    void service.subscribe(project.id, started.id, {
      send: (event) => events.push(event),
      close: resolve,
    });
  });
  await closed;
  assert.equal(events[0]?.type, 'state');
  assert.equal(
    events.some((event) => event.type === 'log'),
    true,
  );
  assert.equal(
    events.some(
      (event) =>
        event.type === 'state' &&
        'execution' in event &&
        event.execution.status === 'succeeded',
    ),
    true,
  );
  await assert.rejects(
    () =>
      service.subscribe('outro-projeto', started.id, {
        send: () => undefined,
        close: () => undefined,
      }),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_EXECUTION_NOT_FOUND',
  );
});

test('limita assinantes simultâneos por execução', async (t) => {
  const { root, project, service } = await fixture(
    `node -e "setTimeout(() => {}, 500)"`,
  );
  t.after(() => {
    service.close();
    return rm(root, { recursive: true, force: true });
  });
  const started = await service.start(project, 'package-script:lint');
  const subscriptions = await Promise.all(
    Array.from({ length: 5 }, () =>
      service.subscribe(project.id, started.id, {
        send: () => undefined,
        close: () => undefined,
      }),
    ),
  );
  await assert.rejects(
    () =>
      service.subscribe(project.id, started.id, {
        send: () => undefined,
        close: () => undefined,
      }),
    (error: unknown) =>
      error instanceof ScriptExecutionError &&
      error.code === 'SCRIPT_SUBSCRIBER_LIMIT',
  );
  for (const unsubscribe of subscriptions) unsubscribe();
});

test('publica logs durante saída contínua sem adiar até o encerramento', async (t) => {
  const { root, project, service } = await fixture(
    `node -e "let n = 0; const timer = setInterval(() => { console.log('tick-' + (++n)); if (n === 60) clearInterval(timer) }, 20)"`,
  );
  t.after(() => {
    service.close();
    return rm(root, { recursive: true, force: true });
  });
  const started = await service.start(project, 'package-script:lint');
  const events: ScriptExecutionEvent[] = [];
  const closed = new Promise<void>((resolve) => {
    void service.subscribe(project.id, started.id, {
      send: (event) => events.push(event),
      close: resolve,
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(
    events.some(
      (event) => event.type === 'log' && event.log.content.includes('tick-'),
    ),
    true,
    'a janela de frequência deve publicar mesmo quando a saída não para',
  );
  assert.equal((await service.get(project.id, started.id)).status, 'running');
  await closed;
  assert.match((await service.log(project.id, started.id)).content, /tick-60/);
});

test('trata erro assíncrono do stream de log como falha da execução', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dashboard-script-stream-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      scripts: { lint: `node -e "setTimeout(() => {}, 500)"` },
    }),
  );
  await writeFile(path.join(root, 'package-lock.json'), '{}');
  const project = {
    id: 'projeto-1',
    name: 'Projeto',
    path: root,
    type: 'node',
    capabilities: [],
  } as Project;
  let output: PassThrough | undefined;
  const service = new ScriptExecutionService(
    new ScriptDetectionService(),
    root,
    {
      createLogStream: () => {
        output = new PassThrough();
        queueMicrotask(() => output?.emit('open', 1));
        return output;
      },
    },
  );
  t.after(() => {
    service.close();
    return rm(root, { recursive: true, force: true });
  });

  const started = await service.start(project, 'package-script:lint');
  output?.emit('error', new Error('sem espaço disponível'));

  const current = await service.get(project.id, started.id);
  assert.equal(current.status, 'failed');
  assert.ok(current.finishedAt);
});
