import type {
  ProjectDiagnosticReport,
  ProjectGitOverview,
  TestExecutionHistory,
  TestExecutionRecord,
} from '@dev-dashboard/contracts';

export type ReleaseReadinessState = 'pass' | 'warning' | 'block' | 'unknown';
export type ReleaseReadinessCheckId = 'git' | 'tests' | 'doctor';
export type ReleaseReadinessActionTarget = 'synchronization' | 'tests' | 'doctor';

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
  const action = { label: 'Abrir Sincronização', target: 'synchronization' as const };
  if (!overview.repository) {
    return { id: 'git', state: 'unknown', summary: 'Estado Git indisponível', evidence: 'O projeto não possui um repositório Git detectado.', observedAt, action };
  }
  if (!overview.clean) {
    return { id: 'git', state: 'block', summary: 'Working tree possui alterações', evidence: `${overview.files.length} arquivo(s) com alteração local.`, observedAt, action };
  }
  if (overview.detached || !overview.branch) {
    return { id: 'git', state: 'warning', summary: 'HEAD não está em uma branch normal', evidence: 'A revisão foi lida em estado detached ou sem branch identificável.', observedAt, action };
  }
  if (!overview.upstream) {
    return { id: 'git', state: 'unknown', summary: 'Branch sem referência remota comparável', evidence: `${overview.branch} não possui upstream configurado; não é possível provar sincronização remota.`, observedAt, action };
  }
  if (overview.ahead > 0 && overview.behind > 0) {
    return { id: 'git', state: 'block', summary: 'Branch divergiu da referência remota', evidence: `${overview.ahead} commit(s) à frente e ${overview.behind} atrás de ${overview.upstream}.`, observedAt, action };
  }
  if (overview.behind > 0) {
    return { id: 'git', state: 'block', summary: 'Branch está atrás da referência remota', evidence: `${overview.behind} commit(s) atrás de ${overview.upstream}.`, observedAt, action };
  }
  if (overview.ahead > 0) {
    return { id: 'git', state: 'block', summary: 'Existem commits locais ainda não publicados', evidence: `${overview.ahead} commit(s) à frente de ${overview.upstream}.`, observedAt, action };
  }
  return { id: 'git', state: 'pass', summary: 'Git pronto para entrega', evidence: `${overview.branch} está limpa e sincronizada com ${overview.upstream}.`, observedAt, action };
}

function hasComparableIdentity(
  record: TestExecutionRecord,
  expected: ReleaseReadinessTestIdentity,
): boolean {
  return record.gitRevision === expected.gitRevision &&
    record.gitDirtyFingerprint === expected.gitDirtyFingerprint &&
    record.environmentInstanceId === expected.environmentInstanceId;
}

function latestComparableFullSuite(
  history: TestExecutionHistory,
  expected: ReleaseReadinessTestIdentity,
): TestExecutionRecord | undefined {
  return history.items.find(
    (item) => item.scope === 'full-suite' && hasComparableIdentity(item, expected),
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
    return { id: 'tests', state: 'unknown', summary: 'Contexto atual de testes não é comparável', evidence: 'A revisão/fingerprint atual não foi fornecida ao Readiness.', observedAt: new Date(now).toISOString(), action };
  }

  const fullSuites = history.items.filter((item) => item.scope === 'full-suite');
  const latest = latestComparableFullSuite(history, expectedIdentity);
  if (!latest) {
    const evidence = fullSuites.length > 0
      ? 'Há suíte completa registrada, mas nenhuma pertence à revisão/working tree/ambiente atual.'
      : history.items.length > 0
        ? 'Há execuções direcionadas, mas targeted não comprova a suíte completa.'
        : 'Nenhuma execução completa foi registrada.';
    return { id: 'tests', state: 'unknown', summary: 'Sem suíte completa comparável', evidence, observedAt: new Date(now).toISOString(), action };
  }

  const observedAt = latest.finishedAt ?? latest.startedAt;
  const age = now - Date.parse(observedAt);
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) {
    return { id: 'tests', state: 'unknown', summary: 'Resultado de testes está desatualizado', evidence: `A última suíte completa comparável foi observada em ${observedAt}.`, observedAt, action };
  }
  if (latest.status === 'failed' || (latest.exitCode !== undefined && latest.exitCode !== 0)) {
    return { id: 'tests', state: 'block', summary: 'Última suíte completa comparável falhou', evidence: `Execução ${latest.id} terminou com falha no contexto atual.`, observedAt, action };
  }
  if (latest.status !== 'stopped' || latest.exitCode !== 0) {
    return { id: 'tests', state: 'unknown', summary: 'Suíte completa comparável sem resultado conclusivo', evidence: `Execução ${latest.id} está em estado ${latest.status}.`, observedAt, action };
  }
  return { id: 'tests', state: 'pass', summary: 'Suíte completa comparável passou recentemente', evidence: `Execução ${latest.id} terminou com exit code 0 no contexto atual.`, observedAt, action };
}

export function evaluateDoctorReadiness(
  report: ProjectDiagnosticReport,
): ReleaseReadinessCheck {
  const action = { label: 'Abrir Doctor', target: 'doctor' as const };
  if (report.overallStatus === 'blocked') {
    return { id: 'doctor', state: 'block', summary: 'Project Doctor encontrou bloqueadores', evidence: `${report.summary.failed} check(s) falharam.`, observedAt: report.generatedAt, action };
  }
  if (report.overallStatus === 'attention') {
    return { id: 'doctor', state: 'warning', summary: 'Project Doctor requer atenção', evidence: `${report.summary.warnings} warning(s) ativo(s).`, observedAt: report.generatedAt, action };
  }
  return { id: 'doctor', state: 'pass', summary: 'Project Doctor saudável', evidence: `${report.summary.passed} check(s) passaram sem bloqueadores.`, observedAt: report.generatedAt, action };
}

export function buildReleaseReadinessSnapshot(
  checks: ReleaseReadinessCheck[],
  generatedAt: string,
): ReleaseReadinessSnapshot {
  const state = checks.reduce<ReleaseReadinessState>(
    (current, check) => STATE_PRIORITY[check.state] > STATE_PRIORITY[current] ? check.state : current,
    'pass',
  );
  return { state, generatedAt, checks };
}
