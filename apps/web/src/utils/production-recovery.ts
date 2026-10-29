import type { ProductionPolicies } from '@dev-dashboard/contracts';

export interface RecoveryGuide {
  summary: string;
  steps: string[];
}

export interface RecoveryGuideInput {
  policy: ProductionPolicies['rollback'] | undefined;
  hasBackupCommand: boolean;
  hasRestoreCheck: boolean;
}

const REVERT_STEP =
  'Reverta os commits do deploy problemático (git revert), envie ao origin e use "Publicar" para subir a versão corrigida.';
const HEALTH_STEP = 'Confirme que a produção voltou a ficar saudável.';

/**
 * Passo a passo para voltar atrás, conforme a política de rollback do
 * contrato. É só orientação: o Dev Dashboard não executa rollback.
 */
export function buildRecoveryGuide(input: RecoveryGuideInput): RecoveryGuide {
  switch (input.policy) {
    case 'restore-backup-when-schema-changed':
      return {
        summary:
          'Se o deploy mexeu no schema do banco, o backup precisa ser restaurado antes de voltar a versão.',
        steps: [
          'Confira no log se este deploy aplicou migrations.',
          input.hasBackupCommand
            ? 'Se aplicou, restaure o backup feito antes do deploy (o prod:backup roda antes de cada publicação).'
            : 'Se aplicou, restaure o backup mais recente do banco.',
          ...(input.hasRestoreCheck
            ? ['Valide o backup restaurado com prod:restore-check.']
            : []),
          REVERT_STEP,
          HEALTH_STEP,
        ],
      };
    case 'manual-restore':
      return {
        summary:
          'A restauração é manual: o contrato não automatiza o rollback.',
        steps: [
          input.hasBackupCommand
            ? 'Restaure manualmente o backup gerado pelo prod:backup deste deploy.'
            : 'Restaure manualmente o último backup do banco e dos dados.',
          ...(input.hasRestoreCheck
            ? ['Valide a restauração com prod:restore-check.']
            : []),
          REVERT_STEP,
          HEALTH_STEP,
        ],
      };
    case 'provider-only-when-schema-compatible':
      return {
        summary:
          'Dá para voltar pelo provedor, desde que o schema continue compatível com a versão anterior.',
        steps: [
          'Confira se este deploy aplicou migrations; se aplicou, avalie se a versão anterior ainda funciona com o schema atual.',
          'No provedor (por exemplo, Vercel → Deployments), promova o deployment anterior estável.',
          'Depois, reverta os commits no Git para a branch refletir o que está em produção.',
          HEALTH_STEP,
        ],
      };
    default:
      return {
        summary:
          'O contrato não define uma política de rollback para este projeto.',
        steps: [
          'Defina `policies.rollback` em .dev-dashboard/production.json para ter um passo a passo aqui.',
          REVERT_STEP,
          HEALTH_STEP,
        ],
      };
  }
}
