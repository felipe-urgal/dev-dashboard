import type {
  DeploymentPendingChanges,
  ProductionPolicies,
  ProjectGitOverview,
  TestExecutionRecord,
} from '@dev-dashboard/contracts';

export type ReadinessTone = 'ok' | 'warn' | 'info';

export interface ReadinessItem {
  id: string;
  tone: ReadinessTone;
  label: string;
  detail?: string;
  action?: { id: 'run-tests'; label: string };
}

export interface ProductionReadinessInput {
  /** Branch do contrato de produção. */
  branch: string;
  git: ProjectGitOverview | null;
  /** Execuções de teste mais recentes primeiro; `null` = não consultado. */
  tests: readonly TestExecutionRecord[] | null;
  changes: DeploymentPendingChanges | null;
  /** Saúde informada pelo runtime; `null` quando não há como saber. */
  health: 'ready' | 'degraded' | 'unavailable' | null;
  policies?: ProductionPolicies | undefined;
  hasBackupCommand: boolean;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function testsItem(
  tests: readonly TestExecutionRecord[],
  revision: string | undefined,
): ReadinessItem {
  const action = { id: 'run-tests', label: 'Rodar testes' } as const;
  const forRevision = revision
    ? tests.filter((record) => record.gitRevision === revision)
    : [];
  const latest = forRevision[0];

  if (!latest) {
    return {
      id: 'tests',
      tone: 'warn',
      label: 'Nenhum teste rodou nesta revisão',
      detail: 'Os testes só avisam: você pode publicar sem rodá-los.',
      action,
    };
  }
  if (latest.status === 'running' || latest.status === 'starting') {
    return { id: 'tests', tone: 'info', label: 'Testes em andamento' };
  }
  if (
    latest.cancelled ||
    (latest.status === 'stopped' && latest.exitCode === undefined)
  ) {
    return {
      id: 'tests',
      tone: 'warn',
      label: 'A última execução de testes foi cancelada',
      action,
    };
  }
  if (latest.status === 'failed' && latest.exitCode === undefined) {
    return {
      id: 'tests',
      tone: 'warn',
      label: 'A última execução de testes foi interrompida',
      action,
    };
  }
  if (latest.status === 'failed' || (latest.exitCode ?? 0) !== 0) {
    return {
      id: 'tests',
      tone: 'warn',
      label: 'Os testes falharam nesta revisão',
      action,
    };
  }
  if (latest.scope === 'targeted') {
    const count = latest.targetFiles?.length ?? (latest.targetFile ? 1 : 0);
    return {
      id: 'tests',
      tone: 'warn',
      label: 'Só parte da suíte passou nesta revisão',
      detail: `${plural(count, 'arquivo', 'arquivos')} executado${count === 1 ? '' : 's'}.`,
      action: { id: 'run-tests', label: 'Rodar a suíte completa' },
    };
  }
  return {
    id: 'tests',
    tone: 'ok',
    label: 'A suíte completa passou nesta revisão',
  };
}

/**
 * Avisos antes de publicar. Nada aqui bloqueia o deploy: os bloqueios reais
 * (árvore suja, branch errada, revisão ausente) são aplicados pela API ao
 * preparar o plano; este checklist só antecipa o que o usuário deve saber.
 */
export function buildProductionReadiness(
  input: ProductionReadinessInput,
): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const { git } = input;

  if (input.tests) {
    items.push(testsItem(input.tests, git?.latestCommit?.hash));
  }

  if (git) {
    items.push(
      git.clean
        ? { id: 'clean', tone: 'ok', label: 'Árvore de trabalho limpa' }
        : {
            id: 'clean',
            tone: 'warn',
            label: 'Há alterações locais não commitadas',
            detail: 'O deploy é recusado enquanto a árvore estiver suja.',
          },
    );

    items.push(
      git.branch === input.branch
        ? { id: 'branch', tone: 'ok', label: `Na branch ${input.branch}` }
        : {
            id: 'branch',
            tone: 'warn',
            label: `Você está em ${git.branch ?? 'HEAD destacado'}`,
            detail: `O deploy usa a branch ${input.branch}.`,
          },
    );

    if (git.ahead > 0 || git.behind > 0) {
      const parts: string[] = [];
      if (git.ahead > 0)
        parts.push(
          `${plural(git.ahead, 'commit local', 'commits locais')} sem enviar`,
        );
      if (git.behind > 0)
        parts.push(
          `${plural(git.behind, 'commit', 'commits')} do origin ainda não baixado${git.behind === 1 ? '' : 's'}`,
        );
      items.push({
        id: 'sync',
        tone: 'warn',
        label: 'Seu clone não está igual ao origin',
        detail: `${parts.join(' · ')}.`,
      });
    }
  }

  const migrations =
    input.changes?.state === 'available' ? input.changes.migrations : 0;
  if (migrations > 0) {
    const when =
      input.policies?.migrations === 'before-deploy'
        ? 'serão aplicadas antes do deploy'
        : input.policies?.migrations === 'startup'
          ? 'serão aplicadas quando a aplicação iniciar'
          : 'não têm política de aplicação definida no contrato';
    items.push({
      id: 'migrations',
      tone: 'warn',
      label: `${plural(migrations, 'migration', 'migrations')} neste deploy`,
      detail: `Elas ${when}.`,
    });
  }

  const backup = input.policies?.backup;
  if (
    backup === 'required-before-deploy' ||
    backup === 'required-before-migration'
  ) {
    items.push(
      input.hasBackupCommand
        ? {
            id: 'backup',
            tone: 'info',
            label: 'Backup automático antes de publicar',
          }
        : {
            id: 'backup',
            tone: 'warn',
            label: 'Backup exigido, mas o contrato não define prod:backup',
          },
    );
  } else if (backup === 'external') {
    items.push({
      id: 'backup',
      tone: 'info',
      label: 'O backup é feito fora do Dev Dashboard',
    });
  }

  if (input.health) {
    items.push(
      input.health === 'ready'
        ? { id: 'health', tone: 'ok', label: 'Produção saudável agora' }
        : {
            id: 'health',
            tone: 'warn',
            label:
              input.health === 'degraded'
                ? 'Produção está degradada agora'
                : 'Produção está indisponível agora',
          },
    );
  }

  return items;
}
