#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const apiPort = process.env.DEV_DASHBOARD_API_PORT?.trim() || '4343';
const origin =
  process.env.DEV_DASHBOARD_LOCAL_ORIGIN?.trim() ||
  `http://127.0.0.1:${apiPort}`;

function configDir() {
  const explicit = process.env.DEV_DASHBOARD_CONFIG_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) return path.join(path.resolve(xdg), 'dev-dashboard');
  return path.join(homedir(), '.config', 'dev-dashboard');
}

async function token() {
  return (await readFile(path.join(configDir(), 'api-token'), 'utf8')).trim();
}

async function request(pathname, options = {}) {
  const response = await fetch(new URL(pathname, origin), {
    ...options,
    headers: {
      'x-dev-dashboard-token': await token(),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function projectFor(value) {
  const { projects = [] } = await request('/api/projects');
  const project = projects.find(
    (item) => item.id === value || item.name === value || item.path === value,
  );
  if (!project) throw new Error(`Projeto não encontrado na API: ${value}`);
  return project;
}

function endpoint(projectId, suffix) {
  return `/api/projects/${encodeURIComponent(projectId)}/git${suffix}`;
}

async function confirmation(projectId, operation, target) {
  const payload = await request(endpoint(projectId, '/mutations/confirmations'), {
    method: 'POST',
    body: JSON.stringify({ operation, target }),
  });
  return payload.confirmation.token;
}

async function workspace(projectId) {
  return (await request(endpoint(projectId, '/workspace'))).workspace;
}

function printWorkspace(value) {
  for (const branch of value.branches ?? []) {
    process.stdout.write([
      branch.kind,
      branch.current ? '*' : ' ',
      branch.shortName,
      branch.remote ?? '',
      branch.upstream ?? '',
      branch.ahead ?? 0,
      branch.behind ?? 0,
    ].join('\t') + '\n');
  }
}

async function createBranch(project, name) {
  const token = await confirmation(project.id, 'create-branch', name);
  const payload = await request(endpoint(project.id, '/branches'), {
    method: 'POST',
    body: JSON.stringify({ name, confirmationToken: token }),
  });
  process.stdout.write(`Branch criada: ${payload.branch.branch}\n`);
}

async function switchBranch(project, name) {
  const token = await confirmation(project.id, 'switch-branch', name);
  const payload = await request(endpoint(project.id, '/switch'), {
    method: 'POST',
    body: JSON.stringify({ name, confirmationToken: token }),
  });
  process.stdout.write(`Branch atual: ${payload.branch.branch}\n`);
}

async function deleteBranch(project, name) {
  const prepared = await request(endpoint(project.id, '/branches/delete/confirmations'), {
    method: 'POST',
    body: JSON.stringify({ branch: name }),
  });
  const payload = await request(endpoint(project.id, '/branches/delete'), {
    method: 'POST',
    body: JSON.stringify({
      branch: name,
      confirmationToken: prepared.confirmation.token,
    }),
  });
  process.stdout.write(`Branch removida: ${payload.branch.branch}\n`);
}

async function commit(project, message, amend) {
  const operation = amend ? 'amend' : 'commit';
  const token = await confirmation(project.id, operation, message);
  const suffix = amend ? '/commit/amend' : '/commit';
  const payload = await request(endpoint(project.id, suffix), {
    method: 'POST',
    body: JSON.stringify({
      message,
      ...(amend ? {} : { includeAllChanges: true }),
      confirmationToken: token,
    }),
  });
  process.stdout.write(`${payload.commit.shortHash} ${payload.commit.subject}\n`);
}

async function sync(project, reference, strategy) {
  const prepared = await request(endpoint(project.id, '/sync/confirmations'), {
    method: 'POST',
    body: JSON.stringify({ reference, strategy }),
  });
  const payload = await request(endpoint(project.id, '/sync'), {
    method: 'POST',
    body: JSON.stringify({
      reference,
      strategy,
      confirmationToken: prepared.confirmation.token,
    }),
  });
  const result = payload.result;
  process.stdout.write(
    `${result.branch}: ${result.changed ? 'atualizada' : 'sem alterações'} via ${result.reference} (${result.strategy})\n`,
  );
}

async function publishCurrent(project) {
  const ws = await workspace(project.id);
  const current = (ws.branches ?? []).find((item) => item.kind === 'local' && item.current);
  if (!current) throw new Error('Branch atual não encontrada.');
  const prepared = await request(endpoint(project.id, '/branches/publish/confirmations'), {
    method: 'POST',
    body: JSON.stringify({ branch: current.shortName }),
  });
  await request(endpoint(project.id, '/branches/publish'), {
    method: 'POST',
    body: JSON.stringify({
      branch: current.shortName,
      confirmationToken: prepared.confirmation.token,
    }),
  });
  return current.shortName;
}

async function createPr(project, title, baseBranch) {
  await publishCurrent(project);
  const input = {
    actionId: 'pull-request-create',
    targetRemote: 'origin',
    baseBranch,
    title,
    description: '',
    draft: false,
  };
  const prepared = await request(endpoint(project.id, '/pull-request/confirmations'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const payload = await request(endpoint(project.id, '/pull-request/actions'), {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      confirmationToken: prepared.confirmation.token,
    }),
  });
  process.stdout.write(`PR #${payload.result.number}: ${payload.result.url}\n`);
}

async function undoCommit(project) {
  const prepared = await request(endpoint(project.id, '/undo/confirmations'), {
    method: 'POST',
    body: JSON.stringify({ operation: 'commit', target: 'HEAD' }),
  });
  const payload = await request(endpoint(project.id, '/undo/commit'), {
    method: 'POST',
    body: JSON.stringify({ confirmationToken: prepared.confirmation.token }),
  });
  process.stdout.write(
    `Desfeito ${payload.undo.undone.shortHash}: ${payload.undo.undone.subject} (${payload.undo.strategy})\n`,
  );
}

async function overview(project) {
  const payload = await request(endpoint(project.id, ''));
  const git = payload.git;
  process.stdout.write(
    `Branch: ${git.branch ?? '(detached)'} | ahead ${git.ahead} | behind ${git.behind} | ${git.clean ? 'limpo' : 'alterado'}\n`,
  );
  for (const file of git.files ?? []) {
    process.stdout.write(`${file.status}\t${file.path}\n`);
  }
}

async function diff(project) {
  const payload = await request(endpoint(project.id, '/diff?scope=combined'));
  for (const file of payload.diff.files ?? []) {
    process.stdout.write(
      `${file.status}\t+${file.additions}\t-${file.deletions}\t${file.path}\n`,
    );
  }
}

async function history(project) {
  const payload = await request(endpoint(project.id, '/exclusive-branch-commits?page=1&pageSize=10'));
  const history = payload.history;
  process.stdout.write(`Branch: ${history.branch} | ${history.total} commit(s) exclusivo(s)\n`);
  for (const item of history.commits ?? []) {
    process.stdout.write(
      `${item.shortHash}\t${item.authoredAt}\t${item.authorName}\t${item.subject}\n`,
    );
  }
}

async function main() {
  const [command, projectValue, ...args] = process.argv.slice(2);
  if (!command || !projectValue) throw new Error('Uso: terminal-git-api <comando> <projeto> [...]');
  const project = await projectFor(projectValue);

  switch (command) {
    case 'workspace':
      printWorkspace(await workspace(project.id));
      return;
    case 'create-branch':
      if (!args[0]) throw new Error('Informe o nome da branch.');
      await createBranch(project, args[0]);
      return;
    case 'switch-branch':
      if (!args[0]) throw new Error('Informe a branch.');
      await switchBranch(project, args[0]);
      return;
    case 'delete-branch':
      if (!args[0]) throw new Error('Informe a branch.');
      await deleteBranch(project, args[0]);
      return;
    case 'commit':
      if (!args[0]) throw new Error('Informe a mensagem.');
      await commit(project, args[0], false);
      return;
    case 'amend':
      if (!args[0]) throw new Error('Informe a mensagem.');
      await commit(project, args[0], true);
      return;
    case 'sync':
      if (!args[0]) throw new Error('Informe a referência.');
      await sync(project, args[0], args[1] || 'ff-only');
      return;
    case 'create-pr':
      if (!args[0]) throw new Error('Informe o título.');
      await createPr(project, args[0], args[1] || 'main');
      return;
    case 'undo-commit':
      await undoCommit(project);
      return;
    case 'overview':
      await overview(project);
      return;
    case 'diff':
      await diff(project);
      return;
    case 'history':
      await history(project);
      return;
    default:
      throw new Error(`Comando Git inválido: ${command}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
