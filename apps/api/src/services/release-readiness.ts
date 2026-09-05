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
  action: {
    label: string;
    target: ReleaseReadinessActionTarget;
  };
}

export interface ReleaseReadinessSnapshot {
  state: ReleaseReadinessState;
  generatedAt: string;
  checks: ReleaseReadinessCheck[];
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

  if (overview.behind > 0) {
    return {
      id: 'git',
      state: 'block',
      summary: 'Branch está atrás da referência remota',
      evidence: `${overview.behind} commit(s) atrás do upstream configurado.`,
      observedAt,
      action,
    };
  }

  if (overview.detached || !overview.branch) {
    return {
      id: 'git',
      state: 'warning',
      summary: 'HEAD não está em uma branch normal',
      evidence: 'A revisão foi lida em estado detached ou sem branch identificável.',
      observedAt,
      action,
    };
  }

  return {
    id: 'git',
    state: 'pass',
    summary: 'Git pronto para entrega',
    evidence: `${overview.branch} limpa e sem commits remotos pendentes.`,
    observedAt,
    action,
  };
}

function latestFullSuite(history: TestExecutionHistory): TestExecutionRecord | undefined {
  return history.items.find((item) => item.scope === 'full-suite');
}

export function evaluateTestsReadiness(
  history: TestExecutionHistory,
  now: number,
  maxAgeMs: number,
): ReleaseReadinessCheck {
  const action = { label: 'Abrir Testes', target: 'tests' as const };
  const latest = latestFullSuite(history);

  if (!latest) {
    return {
      id: 'tests',
      state: 'unknown',
      summary: 'Sem suíte completa comparável',
      evidence:
        history.items.length > 0
          ? 'Há execuções direcionadas, mas targeted não comprova a suíte completa.'
          : 'Nenhuma execução completa foi registrada.',
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
      evidence: `A última suíte completa foi observada em ${observedAt}.`,
      observedAt,
      action,
    };
  }

  if (latest.status === 'failed' || (latest.exitCode !== undefined && latest.exitCode !== 0)) {
    return {
      id: 'tests',
      state: 'block',
      summary: 'Última suíte completa falhou',
      evidence: `Execução ${latest.id} terminou com falha.`,
      observedAt,
      action,
    };
  }

  if (latest.status !== 'stopped' || latest.exitCode !== 0) {
    return {
      id: 'tests',
      state: 'unknown',
      summary: 'Suíte completa sem resultado conclusivo',
      evidence: `Execução ${latest.id} está em estado ${latest.status}.`,
      observedAt,
      action,
    };
  }

  return {
    id: 'tests',
    state: 'pass',
    summary: 'Suíte completa passou recentemente',
    evidence: `Execução ${latest.id} terminou com exit code 0.`,
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

export function buildReleaseReadinessSnapshot(
  checks: ReleaseReadinessCheck[],
  generatedAt: string,
): ReleaseReadinessSnapshot {
  const state = checks.reduce<ReleaseReadinessState>((current, check) =>
    STATE_PRIORITY[check.state] > STATE_PRIORITY[current] ? check.state : current,
  'pass');

  return { state, generatedAt, checks };
}
