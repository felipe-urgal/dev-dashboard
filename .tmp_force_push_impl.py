from pathlib import Path


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding='utf-8')


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text(encoding='utf-8')
    if old not in content:
        raise SystemExit(f'pattern not found in {path}: {old[:120]!r}')
    file.write_text(content.replace(old, new, 1), encoding='utf-8')


write('apps/api/src/services/git-branch-publish-service.ts', '''import type { GitMutationConfirmation } from '@dev-dashboard/contracts';

import {
  GIT_MUTATION_CONFIRMATION_TTL_MS,
  REMOTE_UNAVAILABLE_PATTERN,
} from './git-service/constants.js';
import { GitMutationError } from './git-service/errors.js';
import {
  requireOriginRemote,
  requireRepository,
  validateBranchName,
} from './git-service/mutation-guards.js';
import { commandFailureText, runGit } from './git-service/run.js';
import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';

const PUBLISH_OPERATION_ID = 'branch-publish';
const FORCE_PUSH_OPERATION_ID = 'branch-force-push-with-lease';

function forcePushTarget(branch: string, expectedRemoteSha: string): string {
  return `${branch}::${expectedRemoteSha}`;
}

export class GitBranchPublishService {
  private readonly confirmations = new GitMutationConfirmationService(
    GIT_MUTATION_CONFIRMATION_TTL_MS,
  );

  public preparePublishConfirmation(
    projectId: string,
    branch: string,
  ): GitMutationConfirmation {
    validateBranchName(branch);
    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      PUBLISH_OPERATION_ID,
      branch,
    );
    return { token, operation: 'push', target: branch, expiresAt };
  }

  public async prepareForcePushWithLeaseConfirmation(
    projectPath: string,
    projectId: string,
    branch: string,
  ): Promise<GitMutationConfirmation> {
    validateBranchName(branch);
    await requireRepository(projectPath);
    await requireOriginRemote(projectPath);
    await this.requireLocalBranch(projectPath, branch);
    await this.requireCurrentBranch(projectPath, branch);
    await this.requireRewriteAllowed(projectPath, branch);

    try {
      await runGit(projectPath, [
        'fetch',
        '--quiet',
        '--no-tags',
        'origin',
        `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
      ]);
    } catch (error) {
      const details = commandFailureText(error);
      if (/couldn.t find remote ref|remote ref does not exist|not found/i.test(details)) {
        throw new GitMutationError(
          'GIT_REMOTE_BRANCH_NOT_FOUND',
          `A branch remota "origin/${branch}" não foi encontrada.`,
        );
      }
      if (REMOTE_UNAVAILABLE_PATTERN.test(details)) {
        throw new GitMutationError(
          'GIT_REMOTE_UNAVAILABLE',
          'Não foi possível acessar o remote "origin".',
        );
      }
      throw new GitMutationError('GIT_PUSH_FAILED', details);
    }

    const expectedRemoteSha = await this.remoteTrackingSha(projectPath, branch);
    const target = forcePushTarget(branch, expectedRemoteSha);
    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      FORCE_PUSH_OPERATION_ID,
      target,
    );
    return { token, operation: 'push', target, expiresAt };
  }

  public async publishLocalBranch(
    projectPath: string,
    projectId: string,
    branch: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    validateBranchName(branch);
    await requireRepository(projectPath);
    this.consumeConfirmation(
      projectId,
      PUBLISH_OPERATION_ID,
      branch,
      confirmationToken,
      'Confirmação obrigatória para publicar a branch no origin.',
    );
    await requireOriginRemote(projectPath);
    await this.requireLocalBranch(projectPath, branch);

    try {
      await runGit(projectPath, [
        'push',
        '--set-upstream',
        'origin',
        `refs/heads/${branch}:refs/heads/${branch}`,
      ]);
    } catch (error) {
      const details = commandFailureText(error);
      if (/\\[rejected\\]|non-fast-forward|fetch first/i.test(details)) {
        throw new GitMutationError(
          'GIT_PUSH_REJECTED',
          'O origin tem commits que a branch local não possui; atualize a branch antes de publicar.',
        );
      }
      if (REMOTE_UNAVAILABLE_PATTERN.test(details)) {
        throw new GitMutationError(
          'GIT_REMOTE_UNAVAILABLE',
          'Não foi possível acessar o remote "origin".',
        );
      }
      throw new GitMutationError('GIT_PUSH_FAILED', details);
    }

    return { branch };
  }

  public async forcePushWithLease(
    projectPath: string,
    projectId: string,
    branch: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    validateBranchName(branch);
    await requireRepository(projectPath);
    await requireOriginRemote(projectPath);
    await this.requireLocalBranch(projectPath, branch);
    await this.requireCurrentBranch(projectPath, branch);
    await this.requireRewriteAllowed(projectPath, branch);

    // Não faz fetch aqui: o SHA remoto local continua sendo o lease preparado
    // e confirmado. Se o remoto mudar depois, o próprio Git recusa o push.
    const expectedRemoteSha = await this.remoteTrackingSha(projectPath, branch);
    this.consumeConfirmation(
      projectId,
      FORCE_PUSH_OPERATION_ID,
      forcePushTarget(branch, expectedRemoteSha),
      confirmationToken,
      'Confirmação obrigatória para reenviar a branch com lease.',
    );

    try {
      await runGit(projectPath, [
        'push',
        `--force-with-lease=refs/heads/${branch}:${expectedRemoteSha}`,
        'origin',
        `refs/heads/${branch}:refs/heads/${branch}`,
      ]);
    } catch (error) {
      const details = commandFailureText(error);
      if (/stale info|\\[rejected\\]|non-fast-forward|fetch first/i.test(details)) {
        throw new GitMutationError(
          'GIT_FORCE_WITH_LEASE_REJECTED',
          `O origin/${branch} mudou depois da confirmação. Atualize a branch e revise os commits antes de tentar novamente.`,
        );
      }
      if (REMOTE_UNAVAILABLE_PATTERN.test(details)) {
        throw new GitMutationError(
          'GIT_REMOTE_UNAVAILABLE',
          'Não foi possível acessar o remote "origin".',
        );
      }
      throw new GitMutationError('GIT_PUSH_FAILED', details);
    }

    return { branch };
  }

  private async requireLocalBranch(
    projectPath: string,
    branch: string,
  ): Promise<void> {
    try {
      await runGit(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${branch}`,
      ]);
    } catch {
      throw new GitMutationError(
        'GIT_BRANCH_NOT_FOUND',
        `A branch local "${branch}" não foi encontrada.`,
      );
    }
  }

  private async requireCurrentBranch(
    projectPath: string,
    branch: string,
  ): Promise<void> {
    const current = (await runGit(projectPath, ['branch', '--show-current'])).trim();
    if (current !== branch) {
      throw new GitMutationError(
        'GIT_FORCE_PUSH_CURRENT_BRANCH_REQUIRED',
        `Selecione a branch "${branch}" antes de reenviá-la com lease.`,
      );
    }
  }

  private async requireRewriteAllowed(
    projectPath: string,
    branch: string,
  ): Promise<void> {
    let protectedBranch = branch === 'main' || branch === 'master';
    try {
      const defaultRemote = (await runGit(projectPath, [
        'symbolic-ref',
        '--quiet',
        '--short',
        'refs/remotes/origin/HEAD',
      ])).trim();
      protectedBranch ||= defaultRemote === `origin/${branch}`;
    } catch {
      // origin/HEAD é opcional; main/master continuam protegidas.
    }

    if (protectedBranch) {
      throw new GitMutationError(
        'GIT_PROTECTED_BRANCH',
        `A branch protegida "${branch}" não pode ter o histórico remoto reescrito pelo dashboard.`,
      );
    }
  }

  private async remoteTrackingSha(
    projectPath: string,
    branch: string,
  ): Promise<string> {
    try {
      return (await runGit(projectPath, [
        'rev-parse',
        '--verify',
        `refs/remotes/origin/${branch}`,
      ])).trim();
    } catch {
      throw new GitMutationError(
        'GIT_REMOTE_BRANCH_NOT_FOUND',
        `A branch remota "origin/${branch}" não foi encontrada.`,
      );
    }
  }

  private consumeConfirmation(
    projectId: string,
    operationId: string,
    target: string,
    token: string | undefined,
    message: string,
  ): void {
    try {
      this.confirmations.consume(projectId, operationId, target, token);
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitMutationError(
          'GIT_MUTATION_CONFIRMATION_REQUIRED',
          message,
        );
      }
      throw error;
    }
  }
}
''')

write('apps/api/src/routes/git-workspace/branch-publish-routes.ts', '''import type { FastifyInstance } from 'fastify';

import {
  commonErrorResponseSchemas,
  gitBranchMutationResponseSchema,
  gitMutationConfirmationResponseSchema,
} from '../../http/response-schemas.js';
import { ApiError } from '../../http/api-error.js';
import type { GitBranchPublishService } from '../../services/git-branch-publish-service.js';
import { GitMutationError } from '../../services/git-service/errors.js';
import { withGitMutationHistory } from '../git-mutation-history-helpers.js';
import {
  findProject,
  projectParamsSchema,
  type GitWorkspaceRouteOptions,
  type ProjectParams,
} from './helpers.js';

const branchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branch'],
  properties: {
    branch: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const publishBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branch', 'confirmationToken'],
  properties: {
    branch: { type: 'string', minLength: 1, maxLength: 200 },
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

function translatePublishError(error: unknown): never {
  if (error instanceof GitMutationError) {
    const statusByCode: Record<string, number> = {
      GIT_NOT_REPOSITORY: 400,
      GIT_BRANCH_INVALID: 400,
      GIT_BRANCH_NOT_FOUND: 404,
      GIT_REMOTE_BRANCH_NOT_FOUND: 404,
      GIT_MUTATION_CONFIRMATION_REQUIRED: 409,
      GIT_REMOTE_NOT_CONFIGURED: 409,
      GIT_PUSH_REJECTED: 409,
      GIT_FORCE_PUSH_CURRENT_BRANCH_REQUIRED: 409,
      GIT_PROTECTED_BRANCH: 409,
      GIT_FORCE_WITH_LEASE_REJECTED: 409,
      GIT_REMOTE_UNAVAILABLE: 502,
      GIT_PUSH_FAILED: 500,
    };
    throw new ApiError({
      statusCode: statusByCode[error.code] ?? 400,
      code: error.code,
      message: error.message,
    });
  }

  throw new ApiError({
    statusCode: 500,
    code: 'GIT_PUSH_FAILED',
    message: error instanceof Error
      ? error.message
      : 'Não foi possível publicar a branch no origin.',
  });
}

function confirmationResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['confirmation'],
    properties: {
      confirmation: gitMutationConfirmationResponseSchema,
    },
  } as const;
}

function branchResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['branch'],
    properties: { branch: gitBranchMutationResponseSchema },
  } as const;
}

export function registerBranchPublishRoutes(
  app: FastifyInstance,
  options: GitWorkspaceRouteOptions,
  publishService: GitBranchPublishService,
): void {
  app.post<{ Params: ProjectParams; Body: { branch: string } }>(
    '/projects/:projectId/git/branches/publish/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: branchBodySchema,
        response: {
          201: confirmationResponseSchema(),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: publishService.preparePublishConfirmation(
            project.id,
            request.body.branch,
          ),
        });
      } catch (error) {
        translatePublishError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { branch: string; confirmationToken: string };
  }>(
    '/projects/:projectId/git/branches/publish',
    {
      schema: {
        params: projectParamsSchema,
        body: publishBodySchema,
        response: {
          200: branchResponseSchema(),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = findProject(options, request.params.projectId);
      try {
        return {
          branch: await withGitMutationHistory(
            options.gitMutationHistoryService,
            project,
            'branch-publish',
            () => publishService.publishLocalBranch(
              project.path,
              project.id,
              request.body.branch,
              request.body.confirmationToken,
            ),
          ),
        };
      } catch (error) {
        translatePublishError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { branch: string } }>(
    '/projects/:projectId/git/branches/force-push-with-lease/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: branchBodySchema,
        response: {
          201: confirmationResponseSchema(),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: await publishService.prepareForcePushWithLeaseConfirmation(
            project.path,
            project.id,
            request.body.branch,
          ),
        });
      } catch (error) {
        translatePublishError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { branch: string; confirmationToken: string };
  }>(
    '/projects/:projectId/git/branches/force-push-with-lease',
    {
      schema: {
        params: projectParamsSchema,
        body: publishBodySchema,
        response: {
          200: branchResponseSchema(),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = findProject(options, request.params.projectId);
      try {
        return {
          branch: await withGitMutationHistory(
            options.gitMutationHistoryService,
            project,
            'branch-force-push-with-lease',
            () => publishService.forcePushWithLease(
              project.path,
              project.id,
              request.body.branch,
              request.body.confirmationToken,
            ),
          ),
        };
      } catch (error) {
        translatePublishError(error);
      }
    },
  );
}
''')

write('apps/web/src/api/git-branch-publish.ts', '''import type { GitMutationConfirmation } from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface GitPublishConfirmationResponse {
  confirmation: GitMutationConfirmation;
}

interface GitBranchMutationResponse {
  branch: {
    branch: string;
  };
}

export async function prepareProjectGitBranchPublish(
  projectId: string,
  branch: string,
): Promise<GitMutationConfirmation> {
  const response = await requestJson<GitPublishConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/publish/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    },
  );
  return response.confirmation;
}

export async function publishProjectGitBranch(
  projectId: string,
  branch: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, confirmationToken }),
    },
  );
  return response.branch.branch;
}

export async function prepareProjectGitForcePushWithLease(
  projectId: string,
  branch: string,
): Promise<GitMutationConfirmation> {
  const response = await requestJson<GitPublishConfirmationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/force-push-with-lease/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    },
  );
  return response.confirmation;
}

export async function forcePushProjectGitBranchWithLease(
  projectId: string,
  branch: string,
  confirmationToken: string,
): Promise<string> {
  const response = await requestJson<GitBranchMutationResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/git/branches/force-push-with-lease`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, confirmationToken }),
    },
  );
  return response.branch.branch;
}
''')

write('apps/web/src/components/ProjectGitCommitPage.vue', '''<script setup lang="ts">
import {
  ArrowPathRoundedSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline';
import { computed } from 'vue';

import type { ProjectGitOverview } from '@dev-dashboard/contracts';

export type CommitMode = 'create' | 'amend';

const props = defineProps<{
  overview: ProjectGitOverview;
  busy: boolean;
  message: string;
  mode: CommitMode;
  forcePushBranch: string | null;
}>();

const emit = defineEmits<{
  'update:message': [value: string];
  'update:mode': [value: CommitMode];
  submit: [];
  'force-push': [];
}>();

const trackedChanges = computed(() =>
  props.overview.files.filter((file) => file.status !== 'untracked'),
);

const canSubmit = computed(() =>
  props.message.trim().length > 0
  && !props.busy
  && (
    props.mode === 'amend'
      ? Boolean(props.overview.latestCommit)
      : trackedChanges.value.length > 0
  ),
);

function selectMode(mode: CommitMode): void {
  emit('update:mode', mode);
  emit(
    'update:message',
    mode === 'amend'
      ? props.overview.latestCommit?.subject ?? ''
      : '',
  );
}

function updateMessage(event: Event): void {
  emit('update:message', (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <form class="git-commit-card" @submit.prevent="emit('submit')">
    <div
      class="git-commit-mode"
      role="radiogroup"
      aria-label="Operação de commit"
    >
      <button
        type="button"
        role="radio"
        :aria-checked="mode === 'create'"
        :class="{ active: mode === 'create' }"
        :disabled="busy"
        @click="selectMode('create')"
      >
        <CheckCircleIcon aria-hidden="true" />
        Novo commit
      </button>
      <button
        type="button"
        role="radio"
        :aria-checked="mode === 'amend'"
        :class="{ active: mode === 'amend' }"
        :disabled="busy || !overview.latestCommit"
        @click="selectMode('amend')"
      >
        <ArrowPathRoundedSquareIcon aria-hidden="true" />
        Alterar último commit
      </button>
    </div>

    <div class="git-commit-divider" />

    <section
      v-if="forcePushBranch"
      class="git-force-push-notice"
      aria-label="Atualização da branch remota"
    >
      <ExclamationTriangleIcon aria-hidden="true" />
      <div>
        <strong>O último commit foi reescrito</strong>
        <p>
          Para atualizar <code>origin/{{ forcePushBranch }}</code>, use o
          reenvio seguro. A operação será recusada se a branch remota tiver
          mudado depois da confirmação.
        </p>
      </div>
      <button
        type="button"
        :disabled="busy"
        @click="emit('force-push')"
      >
        Reenviar com lease
      </button>
    </section>

    <div class="git-commit-context">
      <span>Branch <strong>{{ overview.branch ?? 'HEAD' }}</strong></span>
      <span aria-hidden="true" />
      <span v-if="mode === 'create'">
        {{ trackedChanges.length }}
        {{ trackedChanges.length === 1 ? 'alteração rastreada' : 'alterações rastreadas' }}
      </span>
      <span v-else-if="overview.latestCommit">
        Último commit <strong>{{ overview.latestCommit.shortHash }}</strong>
      </span>
    </div>

    <label class="git-commit-message">
      <span>Mensagem do commit</span>
      <textarea
        :value="message"
        maxlength="500"
        :placeholder="mode === 'create'
          ? 'Descreva as alterações'
          : 'Atualize a mensagem do último commit'"
        :disabled="busy"
        @input="updateMessage"
      />
    </label>

    <div class="git-commit-footer">
      <p v-if="mode === 'create'">
        Inclui automaticamente todas as alterações rastreadas.
      </p>
      <p v-else>
        Adiciona todas as alterações atuais e substitui o último commit.
      </p>

      <button
        type="submit"
        class="git-commit-submit"
        :disabled="!canSubmit"
      >
        {{
          busy
            ? 'Processando…'
            : mode === 'create'
              ? 'Criar commit'
              : 'Alterar commit'
        }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.git-commit-card {
  width: 100%;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  padding: 20px;
  box-shadow: var(--shadow-1);
}

.git-commit-mode {
  display: inline-grid;
  grid-template-columns: 1fr 1.25fr;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.git-commit-mode button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 0;
  border-right: 1px solid var(--border);
  border-radius: 0;
  background: var(--surface-1);
  color: var(--text-muted);
  padding: 0 16px;
  font: inherit;
  font-weight: 600;
}

.git-commit-mode button:last-child {
  border-right: 0;
}

.git-commit-mode button:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.git-commit-mode button.active {
  background: var(--accent-soft);
  color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.git-commit-mode svg {
  width: 18px;
  height: 18px;
}

.git-commit-divider {
  height: 1px;
  margin: 20px 0;
  background: var(--border);
}

.git-force-push-notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: 20px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--warning-text) 45%, var(--border));
  border-radius: var(--radius-md);
  background: var(--warning-surface);
}

.git-force-push-notice > svg {
  width: 22px;
  height: 22px;
  color: var(--warning-text);
}

.git-force-push-notice p {
  margin: 3px 0 0;
  color: var(--text-muted);
}

.git-force-push-notice button {
  min-height: 38px;
  padding: 0 14px;
  border-color: var(--warning-text);
  color: var(--warning-text);
  background: var(--surface-1);
  font-weight: 700;
  white-space: nowrap;
}

.git-commit-context {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-muted);
}

.git-commit-context > span[aria-hidden='true'] {
  width: 1px;
  height: 20px;
  background: var(--border);
}

.git-commit-context strong {
  color: var(--text);
}

.git-commit-message {
  display: grid;
  gap: var(--space-2);
  margin-top: 20px;
  color: var(--text-muted);
}

.git-commit-message > span {
  font-weight: 500;
}

.git-commit-message textarea {
  min-height: 112px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text);
  padding: 14px 16px;
  font: inherit;
  line-height: 1.5;
}

.git-commit-message textarea:focus {
  outline: 2px solid var(--accent-soft);
  border-color: var(--accent);
}

.git-commit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-top: 10px;
}

.git-commit-footer p {
  margin: 0;
  color: var(--text-dim);
}

.git-commit-submit {
  min-width: 142px;
  min-height: 44px;
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  font-weight: 700;
}

.git-commit-submit:hover:not(:disabled) {
  filter: brightness(0.96);
}

.git-commit-submit:disabled {
  border-color: var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
}

@media (max-width: 720px) {
  .git-commit-card {
    padding: 16px;
  }

  .git-commit-mode {
    display: grid;
    width: 100%;
    grid-template-columns: 1fr;
  }

  .git-commit-mode button {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .git-commit-mode button:last-child {
    border-bottom: 0;
  }

  .git-force-push-notice {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .git-force-push-notice button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .git-commit-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .git-commit-submit {
    width: 100%;
  }
}
</style>
''')

write('apps/web/src/composables/useProjectGitPanelPolicy.ts', '''import type {
  Project,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import {
  createProjectGitBranch,
  prepareProjectGitMutation,
} from '../api';
import {
  forcePushProjectGitBranchWithLease,
  prepareProjectGitBranchPublish,
  prepareProjectGitForcePushWithLease,
  publishProjectGitBranch,
} from '../api/git-branch-publish';
import { confirmDialog } from '../stores/app-dialog';
import { useProjectGitPanel } from './useProjectGitPanel';

export function useProjectGitPanelPolicy(
  props: Readonly<{ project: Project }>,
  route: { query: Record<string, unknown> } | undefined,
  emit: (event: 'git-updated', overview: ProjectGitOverview) => void,
) {
  const panel = useProjectGitPanel(props, route, emit);

  async function runMutation(
    operation: 'create-branch' | 'switch-branch',
    target: string,
  ): Promise<void> {
    if (operation !== 'create-branch') {
      await panel.runMutation(operation, target);
      return;
    }

    if (panel.mutationRunning.value) return;
    const trimmed = target.trim();
    if (!trimmed) {
      panel.mutationErrorMessage.value = 'Informe o nome da branch.';
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Criar branch?',
      message:
        `A branch "${trimmed}" será criada a partir do HEAD atual. `
        + 'As alterações locais não commitadas serão mantidas na nova branch.',
      confirmLabel: 'Criar branch',
      tone: 'warning',
    });
    if (!confirmed) return;

    panel.mutationRunning.value = true;
    panel.mutationMessage.value = '';
    panel.mutationErrorMessage.value = '';

    try {
      const confirmation = await prepareProjectGitMutation(
        props.project.id,
        operation,
        trimmed,
      );
      const branch = await createProjectGitBranch(
        props.project.id,
        trimmed,
        confirmation.token,
      );
      panel.mutationMessage.value =
        `Branch "${branch}" criada e selecionada. Alterações locais preservadas.`;
      panel.createBranchName.value = '';
      await panel.reloadGitData();
    } catch (error) {
      panel.mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir a operação.';
    } finally {
      panel.mutationRunning.value = false;
    }
  }

  async function runPublishBranch(branch: string): Promise<void> {
    if (panel.mutationRunning.value || panel.remoteRefreshRunning.value) return;
    const trimmed = branch.trim();
    if (!trimmed) return;

    const confirmed = await confirmDialog({
      title: 'Publicar branch?',
      message:
        `A branch "${trimmed}" será enviada para origin e passará a rastrear `
        + `origin/${trimmed}.`,
      confirmLabel: 'Publicar',
      tone: 'warning',
    });
    if (!confirmed) return;

    panel.mutationRunning.value = true;
    panel.mutationMessage.value = '';
    panel.mutationErrorMessage.value = '';

    try {
      const confirmation = await prepareProjectGitBranchPublish(
        props.project.id,
        trimmed,
      );
      const publishedBranch = await publishProjectGitBranch(
        props.project.id,
        trimmed,
        confirmation.token,
      );
      panel.mutationMessage.value =
        `Branch "${publishedBranch}" publicada em origin/${publishedBranch}.`;
      await panel.reloadGitData();
    } catch (error) {
      panel.mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível publicar a branch no origin.';
    } finally {
      panel.mutationRunning.value = false;
    }
  }

  async function runForcePushWithLease(): Promise<void> {
    const branch = panel.amendedBranch.value;
    if (!branch || panel.mutationRunning.value) return;

    const confirmed = await confirmDialog({
      title: 'Reenviar branch com lease?',
      message:
        `O histórico de origin/${branch} será atualizado para o commit alterado. `
        + 'O envio será recusado automaticamente se alguém tiver publicado novos commits depois da confirmação.',
      confirmLabel: 'Reenviar com lease',
      tone: 'warning',
    });
    if (!confirmed) return;

    panel.mutationRunning.value = true;
    panel.mutationMessage.value = '';
    panel.mutationErrorMessage.value = '';

    try {
      const confirmation = await prepareProjectGitForcePushWithLease(
        props.project.id,
        branch,
      );
      const pushedBranch = await forcePushProjectGitBranchWithLease(
        props.project.id,
        branch,
        confirmation.token,
      );
      panel.amendedBranch.value = null;
      panel.mutationMessage.value =
        `Branch "${pushedBranch}" atualizada em origin/${pushedBranch} com lease.`;
      await panel.reloadGitData();
    } catch (error) {
      panel.mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível reenviar a branch com lease.';
    } finally {
      panel.mutationRunning.value = false;
    }
  }

  return {
    ...panel,
    runMutation,
    runPublishBranch,
    runForcePushWithLease,
  };
}
''')

replace(
    'apps/web/src/composables/useProjectGitPanel.ts',
    "  const commitMode = ref<CommitMode>('create');\n  let generation = 0;",
    "  const commitMode = ref<CommitMode>('create');\n  const amendedBranch = ref<string | null>(null);\n  let generation = 0;",
)
replace(
    'apps/web/src/composables/useProjectGitPanel.ts',
    "    const amend = commitMode.value === 'amend';\n    const confirmed = await confirmDialog({",
    "    const amend = commitMode.value === 'amend';\n    const branchBeforeCommit = overview.value?.branch;\n    const upstreamBeforeCommit = overview.value?.upstream;\n    const confirmed = await confirmDialog({",
)
replace(
    'apps/web/src/composables/useProjectGitPanel.ts',
    "      mutationMessage.value = amend\n        ? `Commit \"${commit.shortHash}\" alterado: ${commit.subject}`\n        : `Commit \"${commit.shortHash}\" criado: ${commit.subject}`;\n      commitMessage.value = '';",
    "      mutationMessage.value = amend\n        ? `Commit \"${commit.shortHash}\" alterado: ${commit.subject}`\n        : `Commit \"${commit.shortHash}\" criado: ${commit.subject}`;\n      if (\n        amend\n        && branchBeforeCommit\n        && branchBeforeCommit !== 'main'\n        && branchBeforeCommit !== 'master'\n        && upstreamBeforeCommit === `origin/${branchBeforeCommit}`\n      ) {\n        amendedBranch.value = branchBeforeCommit;\n      }\n      commitMessage.value = '';",
)
replace(
    'apps/web/src/composables/useProjectGitPanel.ts',
    "      commitMessage.value = '';\n      commitMode.value = 'create';\n      activeTab.value = tabFromQuery();",
    "      commitMessage.value = '';\n      commitMode.value = 'create';\n      amendedBranch.value = null;\n      activeTab.value = tabFromQuery();",
)
replace(
    'apps/web/src/composables/useProjectGitPanel.ts',
    "    commitMessage,\n    commitMode,\n    generation,",
    "    commitMessage,\n    commitMode,\n    amendedBranch,\n    generation,",
)

replace(
    'apps/web/src/components/ProjectGitPanel.vue',
    "  commitMessage,\n  commitMode,\n  generation,",
    "  commitMessage,\n  commitMode,\n  amendedBranch,\n  generation,",
)
replace(
    'apps/web/src/components/ProjectGitPanel.vue',
    "  runPublishBranch,\n  runRefreshRemotes,",
    "  runPublishBranch,\n  runForcePushWithLease,\n  runRefreshRemotes,",
)
replace(
    'apps/web/src/components/ProjectGitPanel.template.html',
    '''        :overview="overview"
        :busy="mutationRunning"
        @submit="runCommit"
      />''',
    '''        :overview="overview"
        :busy="mutationRunning"
        :force-push-branch="amendedBranch"
        @submit="runCommit"
        @force-push="runForcePushWithLease"
      />''',
)

replace(
    'packages/contracts/src/git-mutation-catalog.ts',
    '''  {
    id: 'undo-commit',
    label: 'Desfazer commit',''',
    '''  {
    id: 'branch-force-push-with-lease',
    label: 'Reenviar branch com lease',
    description: 'Reescreve a branch remota somente se ela ainda estiver no commit confirmado.',
    risk: 'destructive',
    requiresConfirmation: true,
  },
  {
    id: 'undo-commit',
    label: 'Desfazer commit',''',
)

replace(
    'apps/api/test/git-mutation-catalog.test.ts',
    "test('findGitMutationCatalogEntry retorna undefined para identificador desconhecido', () => {",
    "test('push forçado com lease é classificado como destructive', () => {\n  assert.equal(\n    findGitMutationCatalogEntry('branch-force-push-with-lease')?.risk,\n    'destructive',\n  );\n});\n\ntest('findGitMutationCatalogEntry retorna undefined para identificador desconhecido', () => {",
)

replace(
    'apps/api/test/git-branch-publish-service.test.ts',
    "  local: string;\n}> {",
    "  local: string;\n  origin: string;\n}> {",
)
replace(
    'apps/api/test/git-branch-publish-service.test.ts',
    "  return { root, local };",
    "  return { root, local, origin };",
)
with Path('apps/api/test/git-branch-publish-service.test.ts').open('a', encoding='utf-8') as file:
    file.write('''

test('reenviar commit alterado usa lease explícito e atualiza o origin', async () => {
  const { root, local } = await createRepository();

  try {
    const service = new GitBranchPublishService();
    await git(local, 'switch', 'feature/publicar');
    const publishConfirmation = service.preparePublishConfirmation(
      'project-1',
      'feature/publicar',
    );
    await service.publishLocalBranch(
      local,
      'project-1',
      'feature/publicar',
      publishConfirmation.token,
    );

    await writeFile(path.join(local, 'feature.txt'), 'commit alterado\\n');
    await git(local, 'add', 'feature.txt');
    await git(local, 'commit', '--amend', '-m', 'feature corrigida');

    const confirmation = await service.prepareForcePushWithLeaseConfirmation(
      local,
      'project-1',
      'feature/publicar',
    );
    assert.match(confirmation.target, /^feature\\/publicar::[0-9a-f]{40}$/);

    const result = await service.forcePushWithLease(
      local,
      'project-1',
      'feature/publicar',
      confirmation.token,
    );
    assert.equal(result.branch, 'feature/publicar');
    assert.equal(
      await git(
        local,
        '--git-dir',
        path.join(root, 'origin.git'),
        'rev-parse',
        'refs/heads/feature/publicar',
      ),
      await git(local, 'rev-parse', 'feature/publicar'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lease recusa sobrescrever commits publicados depois da confirmação', async () => {
  const { root, local, origin } = await createRepository();
  const other = path.join(root, 'other');

  try {
    const service = new GitBranchPublishService();
    await git(local, 'switch', 'feature/publicar');
    const publishConfirmation = service.preparePublishConfirmation(
      'project-1',
      'feature/publicar',
    );
    await service.publishLocalBranch(
      local,
      'project-1',
      'feature/publicar',
      publishConfirmation.token,
    );
    await writeFile(path.join(local, 'feature.txt'), 'commit local alterado\\n');
    await git(local, 'add', 'feature.txt');
    await git(local, 'commit', '--amend', '-m', 'feature local corrigida');

    const confirmation = await service.prepareForcePushWithLeaseConfirmation(
      local,
      'project-1',
      'feature/publicar',
    );

    await git(root, 'clone', origin, other);
    await git(other, 'config', 'user.name', 'Outro Dev');
    await git(other, 'config', 'user.email', 'outro@example.test');
    await git(other, 'switch', 'feature/publicar');
    await writeFile(path.join(other, 'other.txt'), 'novo commit remoto\\n');
    await git(other, 'add', 'other.txt');
    await git(other, 'commit', '-m', 'novo commit remoto');
    await git(other, 'push', 'origin', 'feature/publicar');
    const remoteAfterOtherPush = await git(
      other,
      'rev-parse',
      'feature/publicar',
    );

    await assert.rejects(
      () => service.forcePushWithLease(
        local,
        'project-1',
        'feature/publicar',
        confirmation.token,
      ),
      (error: unknown) => Boolean(
        error
        && typeof error === 'object'
        && 'code' in error
        && error.code === 'GIT_FORCE_WITH_LEASE_REJECTED'
      ),
    );
    assert.equal(
      await git(
        local,
        '--git-dir',
        origin,
        'rev-parse',
        'refs/heads/feature/publicar',
      ),
      remoteAfterOtherPush,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
''')

replace(
    'apps/web/test/project-git-panel.test.ts',
    "test('abre a aba Diff como o componente dedicado, sem app aninhado', async () => {",
    '''test('oferece reenvio com lease depois de alterar commit em branch publicada', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const mounted = await mountPanel({
    overview: baseOverview,
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        const body = request.body as { operation: string; target: string };
        return jsonResponse({
          confirmation: {
            token: 'a'.repeat(64),
            operation: body.operation,
            target: body.target,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (request.path.endsWith('/git/commit/amend')) {
        return jsonResponse({
          commit: {
            hash: '3'.repeat(40),
            shortHash: '3333333',
            subject: 'commit reescrito',
          },
        }, 201);
      }
      if (request.path.endsWith('/git/branches/force-push-with-lease/confirmations')) {
        return jsonResponse({
          confirmation: {
            token: 'l'.repeat(64),
            operation: 'push',
            target: `feature/git-ui::${'1'.repeat(40)}`,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (request.path.endsWith('/git/branches/force-push-with-lease')) {
        return jsonResponse({ branch: { branch: 'feature/git-ui' } });
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };

  await clickTab(mounted.wrapper, 'Commit');
  const amendButton = mounted.wrapper
    .findAll('.git-commit-mode button')
    .find((button) => button.text().includes('Alterar último commit'));
  assert.ok(amendButton);
  await amendButton.trigger('click');
  await mounted.wrapper.find('.git-commit-message textarea').setValue('commit reescrito');
  await mounted.wrapper.find('.git-commit-card').trigger('submit');
  await flushPromises();
  await flushPromises();

  assert.match(mounted.wrapper.text(), /Reenviar com lease/);
  const forceButton = mounted.wrapper
    .findAll('.git-force-push-notice button')
    .find((button) => button.text().includes('Reenviar com lease'));
  assert.ok(forceButton);
  await forceButton.trigger('click');
  await flushPromises();
  await flushPromises();

  const confirmation = mounted.requests.find((request) =>
    request.path.endsWith('/git/branches/force-push-with-lease/confirmations'),
  );
  const forcePush = mounted.requests.find((request) =>
    request.path.endsWith('/git/branches/force-push-with-lease')
      && !request.path.endsWith('/confirmations'),
  );
  assert.deepEqual(confirmation?.body, { branch: 'feature/git-ui' });
  assert.deepEqual(forcePush?.body, {
    branch: 'feature/git-ui',
    confirmationToken: 'l'.repeat(64),
  });
  assert.match(mounted.wrapper.text(), /atualizada em origin\\/feature\\/git-ui com lease/);
  assert.equal(mounted.wrapper.find('.git-force-push-notice').exists(), false);
});

test('abre a aba Diff como o componente dedicado, sem app aninhado', async () => {''',
)

replace(
    'docs/tasks/100-test-failure-navigator.md',
    "- saída resumida do pytest preserva a mensagem de asserção e usa o alvo apenas\n  para identificar teste e arquivo.",
    "- saída resumida do pytest preserva a mensagem de asserção e usa o alvo apenas\n  para identificar teste e arquivo;\n- após um amend em branch publicada no origin, o painel oferece reenvio manual\n  com `--force-with-lease` explícito, confirmação vinculada ao SHA remoto,\n  recusa de branch protegida e registro no histórico de mutações.",
)

# Arquivos temporários não entram no diff funcional.
for temporary in [
    '.tmp-git-inventory.txt',
    '.github/workflows/_temp_git_inventory.yml',
    '.github/workflows/_temp_force_push_impl.yml',
    '.tmp_force_push_impl.py',
]:
    Path(temporary).unlink(missing_ok=True)
