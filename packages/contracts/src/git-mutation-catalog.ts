/**
 * Catálogo fechado de operações Git reconhecidas pelo dashboard.
 *
 * Cada mutação Git existente (branch, sincronização, commit, arquivos,
 * desfazer) é descrita aqui por um identificador estável, rótulo e descrição
 * em português, nível de risco e exigência de confirmação. API e frontend
 * consomem a mesma lista — nenhum dos dois deve manter rótulo ou risco
 * duplicado.
 *
 * `id` reaproveita, quando possível, o identificador já usado pelo tipo de
 * operação correspondente (`GitMutationOperation`) para reduzir mapeamentos.
 */
export type GitMutationRiskLevel =
  'read-only' | 'write-safe' | 'write-remote' | 'destructive';

export interface GitMutationCatalogEntry {
  /** Identificador estável, único no catálogo. */
  id: string;
  /** Rótulo curto exibido na interface. */
  label: string;
  /** Descrição de uma frase do impacto da operação. */
  description: string;
  /** Nível de risco: read-only | write-safe | write-remote | destructive. */
  risk: GitMutationRiskLevel;
  /** Se a operação exige um token de confirmação antes de ser executada. */
  requiresConfirmation: boolean;
}

export const GIT_MUTATION_CATALOG: readonly GitMutationCatalogEntry[] = [
  {
    id: 'create-branch',
    label: 'Criar branch',
    description: 'Cria uma nova branch local a partir do HEAD atual.',
    risk: 'write-safe',
    requiresConfirmation: true,
  },
  {
    id: 'switch-branch',
    label: 'Trocar branch',
    description: 'Troca a branch atual do repositório.',
    risk: 'write-safe',
    requiresConfirmation: true,
  },
  {
    id: 'track-branch',
    label: 'Rastrear branch remota',
    description: 'Configura o upstream para acompanhar uma branch remota.',
    risk: 'write-safe',
    requiresConfirmation: true,
  },
  {
    id: 'delete-remote-branch',
    label: 'Excluir branch remota',
    description: 'Remove uma branch do remoto configurado.',
    risk: 'write-remote',
    requiresConfirmation: true,
  },
  {
    id: 'pull',
    label: 'Atualizar branch (pull)',
    description:
      'Traz commits do upstream para a branch atual por fast-forward.',
    risk: 'write-safe',
    requiresConfirmation: true,
  },
  {
    id: 'push',
    label: 'Enviar branch (push)',
    description: 'Publica commits locais no remoto configurado.',
    risk: 'write-remote',
    requiresConfirmation: true,
  },
  {
    id: 'commit',
    label: 'Registrar commit',
    description: 'Cria um commit com as alterações staged.',
    risk: 'write-safe',
    requiresConfirmation: true,
  },
  {
    id: 'amend',
    label: 'Alterar último commit',
    description: 'Reescreve o commit mais recente com o conteúdo staged atual.',
    risk: 'write-safe',
    requiresConfirmation: true,
  },
  {
    id: 'save',
    label: 'Salvar alterações',
    description:
      'Adiciona todas as alterações e cria um commit com prefixo automático.',
    risk: 'write-safe',
    requiresConfirmation: true,
  },
  {
    id: 'discard-file',
    label: 'Descartar alterações do arquivo',
    description:
      'Reverte um arquivo rastreado ao conteúdo do último commit, perdendo as alterações locais.',
    risk: 'destructive',
    requiresConfirmation: true,
  },
  {
    id: 'remove-untracked-file',
    label: 'Remover arquivo não rastreado',
    description: 'Apaga permanentemente um arquivo novo ainda não versionado.',
    risk: 'destructive',
    requiresConfirmation: true,
  },
  {
    id: 'sync-integrate',
    label: 'Sincronizar com referência remota',
    description:
      'Integra uma referência remota na branch atual por fast-forward, rebase ou merge.',
    risk: 'write-remote',
    requiresConfirmation: true,
  },
  {
    id: 'sync-main',
    label: 'Sincronizar main com upstream',
    description:
      'Atualiza a main local a partir do upstream e publica em origin/main.',
    risk: 'write-remote',
    requiresConfirmation: true,
  },
  {
    id: 'branch-rename',
    label: 'Renomear branch',
    description: 'Renomeia uma branch local existente.',
    risk: 'write-safe',
    requiresConfirmation: true,
  },
  {
    id: 'branch-delete',
    label: 'Excluir branch local',
    description: 'Remove uma branch local do repositório.',
    risk: 'destructive',
    requiresConfirmation: true,
  },
  {
    id: 'branch-publish',
    label: 'Publicar branch local',
    description:
      'Envia uma branch local ainda não publicada para o remoto origin.',
    risk: 'write-remote',
    requiresConfirmation: true,
  },
  {
    id: 'branch-force-push-with-lease',
    label: 'Reenviar branch com lease',
    description:
      'Reescreve a branch remota somente se ela ainda estiver no commit confirmado.',
    risk: 'destructive',
    requiresConfirmation: true,
  },
  {
    id: 'undo-commit',
    label: 'Desfazer commit',
    description: 'Desfaz o commit mais recente por reset ou revert.',
    risk: 'destructive',
    requiresConfirmation: true,
  },
  {
    id: 'undo-file',
    label: 'Desfazer arquivo',
    description:
      'Reverte um arquivo ao estado do commit anterior, descartando alterações locais.',
    risk: 'destructive',
    requiresConfirmation: true,
  },
];

export const GIT_MUTATION_CATALOG_BY_ID: ReadonlyMap<
  string,
  GitMutationCatalogEntry
> = new Map(GIT_MUTATION_CATALOG.map((entry) => [entry.id, entry]));

export function findGitMutationCatalogEntry(
  id: string,
): GitMutationCatalogEntry | undefined {
  return GIT_MUTATION_CATALOG_BY_ID.get(id);
}
