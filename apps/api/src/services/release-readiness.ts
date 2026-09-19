import type {
  GitPullRequestLookup,
  ProjectDiagnosticReport,
  ProjectGitOverview,
  TestExecutionHistory,
  TestExecutionRecord,
} from '@dev-dashboard/contracts';

import type { MigrationOverview } from './migration-provider.js';

export type ReleaseReadinessState = 'pass' | 'warning' | 'block' | 'unknown';
export type ReleaseReadinessCheckId =
  'git' | 'tests' | 'pull-request' | 'doctor' | 'migrations';
export type ReleaseReadinessActionTarget =
  'synchronization' | 'tests' | 'pull-request' | 'doctor' | 'migrations';

export interface ReleaseReadinessCheck {
  id: ReleaseReadinessCheckId;
  state: ReleaseReadinessState;
  summary: string;
  evidence: string;
  observedAt: string;
  action: { label: string; target: ReleaseReadinessActionTarget };
}

export interface ReleaseReadinessSnapshot {
  state: ReleaseReadinessState;
  generatedAt: string;
  checks: ReleaseReadinessCheck[];
}

export interface ReleaseReadinessTestIdentity {
  gitRevision: string;
  gitDirtyFingerprint: string;
  environmentInstanceId?: string;
}

const STATE_PRIORITY: Record<ReleaseReadinessState, number> = {
  pass: 0,
  warning: 1,
  unknown: 2,
  block: 3,
};

export function evaluateGitReadiness(
  overview: ProjectGitOverview,
  observedAt: string,
): ReleaseReadinessCheck {
  const action = {
    label: 'Abrir Sincronização',
    target: 'synchronization' as const,
  };
  if (!overview.repository) {
    return {
      id: 'git',
      state: 'unknown',
      summary: 'Estado Git indisponível',
      evidence: 'O projeto não possui um repositório Git detectado.',
      observedAt,
      action,
    };
  }
  if (!overview.clean) {
    return {
      id: 'git',
      state: 'block',
      summary: 'Working tree possui alterações',
      evidence: `${overview.files.length} arquivo(s) com alteração local.`,
      observedAt,
      action,
    };
  }
  if (overview.detached || !overview.branch) {
    return {
      id: 'git',
      state: 'warning',
      summary: 'HEAD não está em uma branch normal',
      evidence:
        'A revisão foi lida em estado detached ou sem branch identificável.',
      observedAt,
      action,
    };
  }
  if (!overview.upstream) {
    return {
      id: 'git',
      state: 'unknown',
      summary: 'Branch sem referência remota comparável',
      evidence: `${overview.branch} não possui upstream configurado; não é possível provar sincronização remota.`,
      observedAt,
      action,
    };
  }
  if (overview.ahead > 0 && overview.behind > 0) {
    return {
      id: 'git',
      state: 'block',
      summary: 'Branch divergiu da referência remota',
      evidence: `${overview.ahead} commit(s) à frente e ${overview.behind} atrás de ${overview.upstream}.`,
      observedAt,
      action,
    };
  }
  if (overview.behind > 0) {
    return {
      id: 'git',
      state: 'block',
      summary: 'Branch está atrás da referência remota',
      evidence: `${overview.behind} commit(s) atrás de ${overview.upstream}.`,
      observedAt,
      action,
    };
  }
  if (overview.ahead > 0) {
    return {
      id: 'git',
      state: 'block',
      summary: 'Existem commits locais ainda não publicados',
      evidence: `${overview.ahead} commit(s) à frente de ${overview.upstream}.`,
      observedAt,
      action,
    };
  }
  return {
    id: 'git',
    state: 'pass',
    summary: 'Git pronto para entrega',
    evidence: `${overview.branch} está limpa e sincronizada com ${overview.upstream}.`,
    observedAt,
    action,
  };
}

function pullRequestRemoteLabel(status: string): string {
  if (status === 'unauthenticated') return 'autenticação ausente';
  if (status === 'rate-limited') return 'rate limit atingido';
  return 'provider indisponível';
}

export function evaluatePullRequestReadiness(
  overview: ProjectGitOverview,
  lookup: GitPullRequestLookup | undefined,
  observedAt: string,
): ReleaseReadinessCheck {
  const action = {
    label: 'Abrir Pull Request',
    target: 'pull-request' as const,
  };

  if (
    !overview.repository ||
    overview.detached ||
    !overview.branch ||
    !overview.latestCommit
  ) {
    return {
      id: 'pull-request',
      state: 'unknown',
      summary: 'PR remoto não é comparável ao checkout atual',
      evidence: 'Branch ou revisão local não pôde ser determinada.',
      observedAt,
      action,
    };
  }

  if (!lookup) {
    return {
      id: 'pull-request',
      state: 'unknown',
      summary: 'Estado remoto da Pull Request indisponível',
      evidence: 'A consulta ao provider remoto não pôde ser concluída.',
      observedAt,
      action,
    };
  }

  const pullRequest = lookup.existing;
  if (!pullRequest) {
    return {
      id: 'pull-request',
      state: 'unknown',
      summary: 'Nenhuma Pull Request aberta para a branch',
      evidence: `${overview.branch} não possui PR aberta comprovada no provider.`,
      observedAt,
      action,
    };
  }

  if (pullRequest.sourceBranch !== overview.branch) {
    return {
      id: 'pull-request',
      state: 'unknown',
      summary: 'Pull Request pertence a outra branch',
      evidence: `A PR #${pullRequest.number} aponta para ${pullRequest.sourceBranch}, não ${overview.branch}.`,
      observedAt,
      action,
    };
  }

  const cockpit = pullRequest.cockpit;
  if (!cockpit) {
    return {
      id: 'pull-request',
      state: 'unknown',
      summary: 'Cockpit remoto sem evidência suficiente',
      evidence: `A PR #${pullRequest.number} foi encontrada, mas checks/reviews não foram hidratados.`,
      observedAt,
      action,
    };
  }

  if (cockpit.remoteStatus !== 'available') {
    return {
      id: 'pull-request',
      state: 'unknown',
      summary: 'Cockpit remoto indisponível',
      evidence: `PR #${pullRequest.number}: ${pullRequestRemoteLabel(cockpit.remoteStatus)}.`,
      observedAt,
      action,
    };
  }

  if (!cockpit.headSha || cockpit.headSha !== overview.latestCommit.hash) {
    return {
      id: 'pull-request',
      state: 'unknown',
      summary: 'PR remoto não corresponde ao HEAD local',
      evidence: cockpit.headSha
        ? `PR #${pullRequest.number} observa ${cockpit.headSha.slice(0, 12)}, enquanto o checkout está em ${overview.latestCommit.shortHash}.`
        : `PR #${pullRequest.number} não informou um head SHA comparável.`,
      observedAt,
      action,
    };
  }

  if (pullRequest.ciStatus === 'failure') {
    return {
      id: 'pull-request',
      state: 'block',
      summary: 'CI remoto falhou para o HEAD atual',
      evidence: `PR #${pullRequest.number} está em ${overview.latestCommit.shortHash} e possui checks com falha.`,
      observedAt,
      action,
    };
  }

  if (cockpit.mergeable === false) {
    return {
      id: 'pull-request',
      state: 'block',
      summary: 'Pull Request não está mergeável',
      evidence: `PR #${pullRequest.number} possui conflito ou bloqueio remoto de merge no HEAD atual.`,
      observedAt,
      action,
    };
  }

  if (cockpit.reviewState === 'changes-requested') {
    return {
      id: 'pull-request',
      state: 'block',
      summary: 'Review remoto solicitou mudanças',
      evidence: `PR #${pullRequest.number} possui mudanças solicitadas para o HEAD atual.`,
      observedAt,
      action,
    };
  }

  if (pullRequest.ciStatus === 'pending') {
    return {
      id: 'pull-request',
      state: 'warning',
      summary: 'CI remoto ainda está em execução',
      evidence: `PR #${pullRequest.number} corresponde a ${overview.latestCommit.shortHash}, mas os checks ainda não terminaram.`,
      observedAt,
      action,
    };
  }

  if (cockpit.draft) {
    return {
      id: 'pull-request',
      state: 'warning',
      summary: 'Pull Request ainda está em draft',
      evidence: `PR #${pullRequest.number} corresponde ao HEAD atual, mas segue marcada como draft.`,
      observedAt,
      action,
    };
  }

  if (cockpit.reviewState === 'review-required') {
    return {
      id: 'pull-request',
      state: 'warning',
      summary: 'Pull Request ainda aguarda review',
      evidence: `PR #${pullRequest.number} possui reviewer solicitado para o HEAD atual.`,
      observedAt,
      action,
    };
  }

  if (pullRequest.ciStatus !== 'success') {
    return {
      id: 'pull-request',
      state: 'unknown',
      summary: 'CI remoto sem resultado conclusivo',
      evidence: `PR #${pullRequest.number} corresponde ao HEAD atual, mas não há resultado remoto verificável.`,
      observedAt,
      action,
    };
  }

  return {
    id: 'pull-request',
    state: 'pass',
    summary: 'PR remoto corresponde ao HEAD e CI passou',
    evidence: `PR #${pullRequest.number} está em ${overview.latestCommit.shortHash} com CI remoto verde.`,
    observedAt,
    action,
  };
}

function hasComparableIdentity(
  record: TestExecutionRecord,
  expected: ReleaseReadinessTestIdentity,
): boolean {
  return (
    record.gitRevision === expected.gitRevision &&
    record.gitDirtyFingerprint === expected.gitDirtyFingerprint &&
    record.environmentInstanceId === expected.environmentInstanceId
  );
}

function latestComparableFullSuite(
  history: TestExecutionHistory,
  expected: ReleaseReadinessTestIdentity,
): TestExecutionRecord | undefined {
  return history.items.find(
    (item) =>
      item.scope === 'full-suite' && hasComparableIdentity(item, expected),
  );
}

export function evaluateTestsReadiness(
  history: TestExecutionHistory,
  now: number,
  maxAgeMs: number,
  expectedIdentity?: ReleaseReadinessTestIdentity,
): ReleaseReadinessCheck {
  const action = { label: 'Abrir Testes', target: 'tests' as const };
  if (!expectedIdentity) {
    return {
      id: 'tests',
      state: 'unknown',
      summary: 'Contexto atual de testes não é comparável',
      evidence: 'A revisão/fingerprint atual não foi fornecida ao Readiness.',
      observedAt: new Date(now).toISOString(),
      action,
    };
  }

  const fullSuites = history.items.filter(
    (item) => item.scope === 'full-suite',
  );
  const latest = latestComparableFullSuite(history, expectedIdentity);
  if (!latest) {
    const evidence =
      fullSuites.length > 0
        ? 'Há suíte completa registrada, mas nenhuma pertence à revisão/working tree/ambiente atual.'
        : history.items.length > 0
          ? 'Há execuções direcionadas, mas targeted não comprova a suíte completa.'
          : 'Nenhuma execução completa foi registrada.';
    return {
      id: 'tests',
      state: 'unknown',
      summary: 'Sem suíte completa comparável',
      evidence,
      observedAt: new Date(now).toISOString(),
      action,
    };
  }

  const observedAt = latest.finishedAt ?? latest.startedAt;
  const age = now - Date.parse(observedAt);
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) {
    return {
      id: 'tests',
      state: 'unknown',
      summary: 'Resultado de testes está desatualizado',
      evidence: `A última suíte completa comparável foi observada em ${observedAt}.`,
      observedAt,
      action,
    };
  }
  if (
    latest.status === 'failed' ||
    (latest.exitCode !== undefined && latest.exitCode !== 0)
  ) {
    return {
      id: 'tests',
      state: 'block',
      summary: 'Última suíte completa comparável falhou',
      evidence: `Execução ${latest.id} terminou com falha no contexto atual.`,
      observedAt,
      action,
    };
  }
  if (latest.status !== 'stopped' || latest.exitCode !== 0) {
    return {
      id: 'tests',
      state: 'unknown',
      summary: 'Suíte completa comparável sem resultado conclusivo',
      evidence: `Execução ${latest.id} está em estado ${latest.status}.`,
      observedAt,
      action,
    };
  }
  return {
    id: 'tests',
    state: 'pass',
    summary: 'Suíte completa comparável passou recentemente',
    evidence: `Execução ${latest.id} terminou com exit code 0 no contexto atual.`,
    observedAt,
    action,
  };
}

export function evaluateDoctorReadiness(
  report: ProjectDiagnosticReport,
): ReleaseReadinessCheck {
  const action = { label: 'Abrir Doctor', target: 'doctor' as const };
  if (report.overallStatus === 'blocked') {
    return {
      id: 'doctor',
      state: 'block',
      summary: 'Project Doctor encontrou bloqueadores',
      evidence: `${report.summary.failed} check(s) falharam.`,
      observedAt: report.generatedAt,
      action,
    };
  }
  if (report.overallStatus === 'attention') {
    return {
      id: 'doctor',
      state: 'warning',
      summary: 'Project Doctor requer atenção',
      evidence: `${report.summary.warnings} warning(s) ativo(s).`,
      observedAt: report.generatedAt,
      action,
    };
  }
  return {
    id: 'doctor',
    state: 'pass',
    summary: 'Project Doctor saudável',
    evidence: `${report.summary.passed} check(s) passaram sem bloqueadores.`,
    observedAt: report.generatedAt,
    action,
  };
}

export function evaluateMigrationsReadiness(
  overview: MigrationOverview,
): ReleaseReadinessCheck {
  const action = { label: 'Abrir Migrations', target: 'migrations' as const };
  if (overview.status === 'up-to-date') {
    return {
      id: 'migrations',
      state: 'pass',
      summary: 'Migrations estão atualizadas',
      evidence: overview.evidence,
      observedAt: overview.observedAt,
      action,
    };
  }
  if (overview.status === 'pending') {
    return {
      id: 'migrations',
      state: 'block',
      summary: 'Existem migrations pendentes',
      evidence: overview.evidence,
      observedAt: overview.observedAt,
      action,
    };
  }
  return {
    id: 'migrations',
    state: 'unknown',
    summary:
      overview.status === 'unavailable'
        ? 'Estado de migrations indisponível'
        : 'Estado de migrations inconclusivo',
    evidence: overview.evidence,
    observedAt: overview.observedAt,
    action,
  };
}

export function buildReleaseReadinessSnapshot(
  checks: ReleaseReadinessCheck[],
  generatedAt: string,
): ReleaseReadinessSnapshot {
  const state = checks.reduce<ReleaseReadinessState>(
    (current, check) =>
      STATE_PRIORITY[check.state] > STATE_PRIORITY[current]
        ? check.state
        : current,
    'pass',
  );
  return { state, generatedAt, checks };
}
