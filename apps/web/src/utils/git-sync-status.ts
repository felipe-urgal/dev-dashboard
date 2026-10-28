import type {
  GitBranch,
  GitCommit,
  GitSyncOperation,
  GitSyncProgressEvent,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

export { formatRelativeTime } from './relative-time';

export type SyncTone = 'loading' | 'success' | 'warning' | 'pending' | 'idle';

export interface GitSyncInput {
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
  busy: boolean;
  checking: boolean;
  operation: GitSyncOperation | null;
  verificationError: string;
}

type MainSyncState =
  | 'checking'
  | 'unavailable'
  | 'syncing'
  | 'incomplete'
  | 'synced'
  | 'dirty'
  | 'pending';

function findBranch(
  workspace: ProjectGitWorkspace | null,
  predicate: (branch: GitBranch) => boolean,
): GitBranch | undefined {
  return workspace?.branches.find(predicate);
}

function remoteMain(
  workspace: ProjectGitWorkspace | null,
  remote: 'origin' | 'upstream',
): GitBranch | undefined {
  return findBranch(
    workspace,
    (branch) =>
      branch.kind === 'remote' &&
      branch.remote === remote &&
      branch.shortName === 'main',
  );
}

function hasRemote(
  workspace: ProjectGitWorkspace | null,
  name: string,
): boolean {
  return (workspace?.remotes ?? []).some((remote) => remote.name === name);
}

function localMainBranch(
  workspace: ProjectGitWorkspace | null,
): GitBranch | undefined {
  return findBranch(
    workspace,
    (branch) => branch.kind === 'local' && branch.name === 'main',
  );
}

/** A main está igual ao origin (e à upstream, quando há fork). */
function isMainSynchronized(workspace: ProjectGitWorkspace | null): boolean {
  const localHash = localMainBranch(workspace)?.latestCommit?.hash;
  const originHash = remoteMain(workspace, 'origin')?.latestCommit?.hash;
  if (!localHash || !originHash || localHash !== originHash) return false;

  const upstream = remoteMain(workspace, 'upstream');
  if (!hasRemote(workspace, 'upstream') || !upstream) return true;

  return upstream.latestCommit?.hash === localHash;
}

function isMainAvailable(workspace: ProjectGitWorkspace | null): boolean {
  return Boolean(localMainBranch(workspace)) && hasRemote(workspace, 'origin');
}

export function deriveMainSync(input: GitSyncInput): {
  state: MainSyncState;
  label: string;
  tone: SyncTone;
  /** O botão de sincronizar pode ser acionado. */
  canSync: boolean;
} {
  const { workspace } = input;
  const synchronized = isMainSynchronized(workspace);
  const available = isMainAvailable(workspace);
  const syncing = input.busy && input.operation === 'main';

  let state: MainSyncState;
  if (!workspace || input.checking) state = 'checking';
  else if (!available) state = 'unavailable';
  else if (syncing) state = 'syncing';
  else if (input.verificationError) state = 'incomplete';
  else if (synchronized) state = 'synced';
  else if (!input.overview.clean) state = 'dirty';
  else state = 'pending';

  const labels: Record<MainSyncState, [string, SyncTone]> = {
    checking: ['Verificando…', 'loading'],
    unavailable: ['Sincronização indisponível', 'warning'],
    syncing: ['Sincronizando…', 'loading'],
    incomplete: ['Verificação incompleta', 'warning'],
    synced: ['Tudo em dia', 'success'],
    dirty: ['Alterações locais pendentes', 'warning'],
    pending: ['Sincronização pendente', 'pending'],
  };
  const [label, tone] = labels[state];

  const canSync =
    !input.busy &&
    !input.checking &&
    available &&
    input.overview.clean &&
    !(synchronized && !input.verificationError);

  return { state, label, tone, canSync };
}

export function deriveCurrentBranchSync(input: GitSyncInput): {
  show: boolean;
  name: string;
  remote: string | undefined;
  label: string;
  tone: SyncTone;
  canUpdate: boolean;
  busy: boolean;
} {
  const current = findBranch(
    input.workspace,
    (branch) => branch.kind === 'local' && branch.current,
  );
  const name = current?.name ?? input.overview.branch ?? 'HEAD';
  const remote = current?.upstream ?? input.overview.upstream;
  const ahead = current?.ahead ?? input.overview.ahead ?? 0;
  const behind = current?.behind ?? input.overview.behind ?? 0;
  const busy = input.busy && input.operation === 'current-branch';
  const show = Boolean(current && current.name !== 'main');

  let label: string;
  let tone: SyncTone;
  if (!input.workspace || input.checking) {
    [label, tone] = ['Verificando…', 'loading'];
  } else if (!remote) {
    [label, tone] = ['Remoto não configurado', 'warning'];
  } else if (busy) {
    [label, tone] = ['Atualizando…', 'loading'];
  } else if (!input.overview.clean) {
    [label, tone] = ['Alterações locais pendentes', 'warning'];
  } else if (ahead > 0 && behind > 0) {
    [label, tone] = ['Commits locais e remotos pendentes', 'warning'];
  } else if (behind > 0) {
    [label, tone] = [
      behind === 1
        ? '1 commit novo no remoto'
        : `${behind} commits novos no remoto`,
      'pending',
    ];
  } else {
    [label, tone] = [
      ahead > 0 ? 'Sem commits remotos novos' : 'Branch atualizada',
      'success',
    ];
  }

  const canUpdate =
    !input.busy &&
    !input.checking &&
    input.overview.clean &&
    Boolean(remote) &&
    (behind > 0 || Boolean(input.verificationError));

  return { show, name, remote, label, tone, canUpdate, busy };
}

export type FlowTone = 'ok' | 'warn' | 'acc' | 'idle';

export interface FlowNode {
  id: 'upstream' | 'main' | 'origin';
  name: string;
  sub: string;
  commit?: GitCommit | undefined;
  badge: string;
  tone: FlowTone;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Os nós do fluxo `upstream → main → origin`, só com o que existe. */
export function buildFlowNodes(input: GitSyncInput): FlowNode[] {
  const { workspace, overview } = input;
  const main = localMainBranch(workspace);
  const origin = remoteMain(workspace, 'origin');
  const upstream = remoteMain(workspace, 'upstream');
  const withUpstream = hasRemote(workspace, 'upstream') && Boolean(upstream);
  const synchronized = isMainSynchronized(workspace);
  const syncing = input.busy && input.operation === 'main';

  const onMain = overview.branch === 'main';
  const upstreamBehind = onMain
    ? (workspace?.upstreamComparison?.behind ?? 0)
    : 0;
  const mainBehind = main?.behind ?? 0;
  const mainAhead = main?.ahead ?? 0;

  let mainBadge: string;
  let mainTone: FlowTone;
  if (syncing) [mainBadge, mainTone] = ['integrando…', 'acc'];
  else if (synchronized) [mainBadge, mainTone] = ['em dia', 'ok'];
  else if (upstreamBehind > 0) {
    [mainBadge, mainTone] = [`${upstreamBehind} atrás`, 'warn'];
  } else if (mainBehind > 0) {
    [mainBadge, mainTone] = [`${mainBehind} atrás`, 'warn'];
  } else if (mainAhead > 0) {
    [mainBadge, mainTone] = [`${mainAhead} à frente`, 'acc'];
  } else {
    [mainBadge, mainTone] = ['diferente', 'warn'];
  }

  const nodes: FlowNode[] = [];
  if (withUpstream) {
    nodes.push({
      id: 'upstream',
      name: 'upstream/main',
      sub: 'repositório principal',
      commit: upstream?.latestCommit,
      badge: '',
      tone: 'idle',
    });
  }
  nodes.push({
    id: 'main',
    name: 'main',
    sub: 'local',
    commit: main?.latestCommit,
    badge: mainBadge,
    tone: mainTone,
  });
  nodes.push({
    id: 'origin',
    name: 'origin/main',
    sub: withUpstream ? 'seu fork' : 'remoto',
    commit: origin?.latestCommit,
    badge: synchronized ? 'em dia' : syncing ? '' : 'desatualizado',
    tone: synchronized ? 'ok' : syncing ? 'idle' : 'warn',
  });
  return nodes;
}

/** Frase que resume o que está diferente entre main, origin e upstream. */
export function describeMainDifference(input: GitSyncInput): string {
  const { workspace, overview } = input;
  const main = localMainBranch(workspace);
  const upstreamBehind =
    overview.branch === 'main'
      ? (workspace?.upstreamComparison?.behind ?? 0)
      : 0;

  if (upstreamBehind > 0) {
    return `main está ${plural(upstreamBehind, 'commit', 'commits')} atrás da upstream`;
  }
  if ((main?.behind ?? 0) > 0) {
    return `main está ${plural(main?.behind ?? 0, 'commit', 'commits')} atrás de origin/main`;
  }
  if ((main?.ahead ?? 0) > 0) {
    return `main tem ${plural(main?.ahead ?? 0, 'commit', 'commits')} a mais que origin/main`;
  }
  return 'main e as referências remotas estão em commits diferentes';
}

const STEP_LABELS: Record<string, string> = {
  'fetch-upstream': 'Buscar upstream',
  'fetch-origin': 'Buscar origin',
  'source-fallback': 'Usar origin como referência',
  'checkout-main': 'Selecionar a main',
  'merge-main': 'Integrar na main',
  'push-origin': 'Enviar para origin',
  'abort-merge': 'Abortar o merge',
  'restore-branch': 'Voltar para a branch',
};

export interface TimelineStep {
  id: string;
  label: string;
  status: GitSyncProgressEvent['status'];
  command?: string | undefined;
  message: string;
  durationMs: number | null;
}

export interface TimelineResult {
  steps: TimelineStep[];
  outcome: 'running' | 'success' | 'error' | null;
  totalMs: number | null;
}

function toMs(value: string): number {
  return new Date(value).getTime();
}

/** Linha do tempo da última execução, a partir dos eventos de progresso. */
export function buildTimeline(events: GitSyncProgressEvent[]): TimelineResult {
  const lastRunId = events.at(-1)?.runId;
  if (!lastRunId) return { steps: [], outcome: null, totalMs: null };

  const run = events.filter((event) => event.runId === lastRunId);
  const byStep = new Map<string, GitSyncProgressEvent[]>();
  for (const event of run) {
    byStep.set(event.stepId, [...(byStep.get(event.stepId) ?? []), event]);
  }

  const steps: TimelineStep[] = [];
  for (const [id, stepEvents] of byStep) {
    if (id === 'operation') continue;

    const first = stepEvents[0]!;
    const last = stepEvents.at(-1)!;
    const finished = last.status !== 'running';
    const duration = toMs(last.occurredAt) - toMs(first.occurredAt);

    steps.push({
      id,
      label: STEP_LABELS[id] ?? last.message,
      status: last.status,
      command: last.command ?? first.command,
      message: last.message,
      durationMs: finished && duration >= 0 ? duration : null,
    });
  }

  const operation = byStep.get('operation')?.at(-1);
  const outcome: TimelineResult['outcome'] = !operation
    ? steps.some((step) => step.status === 'running')
      ? 'running'
      : null
    : operation.status === 'error'
      ? 'error'
      : operation.status === 'success'
        ? 'success'
        : 'running';

  const start = toMs(run[0]!.occurredAt);
  const end = toMs(run.at(-1)!.occurredAt);
  const totalMs = outcome && outcome !== 'running' ? end - start : null;

  return { steps, outcome, totalMs };
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '';
  if (milliseconds < 100) return '<0,1 s';
  return `${(milliseconds / 1_000).toFixed(1).replace('.', ',')} s`;
}
