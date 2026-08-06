import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  GitPullRequestMergeMethod,
  GitPullRequestMutationActionId,
  GitPullRequestMutationConfirmation,
  GitPullRequestMutationResult,
  GitPullRequestMutationState,
} from '@dev-dashboard/contracts';
import { findGitMutationCatalogEntry } from '@dev-dashboard/contracts';

import {
  currentBranch,
  defaultBranch,
  publishedReference,
  remoteUrl,
  requireBaseBranch,
  requireRepository,
} from './git-pull-request/branch-context.js';
import { GitPullRequestError } from './git-pull-request/errors.js';
import {
  detectProvider,
  parseRemoteUrl,
} from './git-pull-request/remote-parsing.js';
import type { GitPullRequestTargetRemote } from './git-pull-request/context.js';
import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';

const execFileAsync = promisify(execFile);
const CONFIRMATION_TTL_MS = 60_000;

export type GitPullRequestMutationErrorCode =
  | 'GIT_PULL_REQUEST_ACTION_NOT_FOUND'
  | 'GIT_PULL_REQUEST_ACTION_INVALID_INPUT'
  | 'GIT_PULL_REQUEST_MUTATION_CONFIRMATION_REQUIRED'
  | 'GIT_PULL_REQUEST_MUTATION_FAILED';

export class GitPullRequestMutationError extends Error {
  public constructor(
    public readonly code: GitPullRequestMutationErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GitPullRequestMutationError';
  }
}

export interface GitPullRequestCreateInput {
  targetRemote?: GitPullRequestTargetRemote;
  baseBranch?: string;
  title?: string;
  description?: string;
  draft?: boolean;
}

export interface GitPullRequestEditInput {
  number?: number;
  title?: string;
  description?: string;
}

export interface GitPullRequestCloseInput {
  number?: number;
}

export interface GitPullRequestMergeInput {
  number?: number;
  mergeMethod?: GitPullRequestMergeMethod;
}

export type GitPullRequestMutationInput = GitPullRequestCreateInput &
  GitPullRequestEditInput &
  GitPullRequestMergeInput;

interface GhPullRequestView {
  number: number;
  url: string;
  title: string;
  state: string;
}

export type RunGhImpl = (
  cwd: string,
  args: readonly string[],
) => Promise<string>;

async function defaultRunGh(
  cwd: string,
  args: readonly string[],
): Promise<string> {
  const result = await execFileAsync('gh', [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, LC_ALL: 'C' },
  });
  return result.stdout.trim();
}

function mapState(rawState: string): GitPullRequestMutationState {
  switch (rawState.toUpperCase()) {
    case 'MERGED':
      return 'merged';
    case 'CLOSED':
      return 'closed';
    default:
      return 'open';
  }
}

function parseView(output: string): GhPullRequestView {
  try {
    const payload = JSON.parse(output) as Record<string, unknown>;
    const { number, url, title, state } = payload;
    if (
      typeof number !== 'number' ||
      typeof url !== 'string' ||
      typeof title !== 'string' ||
      typeof state !== 'string'
    ) {
      throw new Error('unexpected gh pr view payload shape');
    }
    return { number, url, title, state };
  } catch (error) {
    throw new GitPullRequestMutationError(
      'GIT_PULL_REQUEST_MUTATION_FAILED',
      'Não foi possível interpretar a resposta do GitHub para esta Pull Request.',
      { cause: error },
    );
  }
}

function targetSignature(
  actionId: GitPullRequestMutationActionId,
  input: GitPullRequestMutationInput,
): string {
  switch (actionId) {
    case 'pull-request-create':
      return JSON.stringify({
        targetRemote: input.targetRemote ?? 'origin',
        baseBranch: input.baseBranch ?? null,
        title: input.title ?? null,
        description: input.description ?? '',
        draft: Boolean(input.draft),
      });
    case 'pull-request-edit':
      return JSON.stringify({
        number: input.number ?? null,
        title: input.title ?? null,
        description: input.description ?? null,
      });
    case 'pull-request-close':
      return JSON.stringify({ number: input.number ?? null });
    case 'pull-request-merge':
      return JSON.stringify({
        number: input.number ?? null,
        mergeMethod: input.mergeMethod ?? null,
      });
    default:
      return JSON.stringify(input);
  }
}

function requireCatalogEntry(actionId: string): void {
  const entry = findGitMutationCatalogEntry(actionId);
  if (!entry || !actionId.startsWith('pull-request-')) {
    throw new GitPullRequestMutationError(
      'GIT_PULL_REQUEST_ACTION_NOT_FOUND',
      'A ação não existe no catálogo de mutações de Pull Request.',
    );
  }
}

function requirePositiveInteger(
  value: number | undefined,
  message: string,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new GitPullRequestMutationError(
      'GIT_PULL_REQUEST_ACTION_INVALID_INPUT',
      message,
    );
  }
  return value;
}

export interface GitPullRequestMutationServiceOptions {
  runGhImpl?: RunGhImpl;
}

export class GitPullRequestMutationService {
  private readonly confirmations = new GitMutationConfirmationService(
    CONFIRMATION_TTL_MS,
  );
  private readonly runGhImpl: RunGhImpl;

  public constructor(options: GitPullRequestMutationServiceOptions = {}) {
    this.runGhImpl = options.runGhImpl ?? defaultRunGh;
  }

  private async runGh(cwd: string, args: readonly string[]): Promise<string> {
    try {
      return await this.runGhImpl(cwd, args);
    } catch (error) {
      throw new GitPullRequestMutationError(
        'GIT_PULL_REQUEST_MUTATION_FAILED',
        'Não foi possível executar a ação no GitHub. Verifique a autenticação do `gh` e tente novamente.',
        { cause: error },
      );
    }
  }

  public prepareConfirmation(
    projectId: string,
    actionId: GitPullRequestMutationActionId,
    input: GitPullRequestMutationInput,
  ): GitPullRequestMutationConfirmation {
    requireCatalogEntry(actionId);
    this.validateInput(actionId, input);
    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      actionId,
      targetSignature(actionId, input),
    );
    return { token, actionId, expiresAt };
  }

  public async execute(
    projectPath: string,
    projectId: string,
    actionId: GitPullRequestMutationActionId,
    input: GitPullRequestMutationInput,
    confirmationToken: string | undefined,
  ): Promise<GitPullRequestMutationResult> {
    requireCatalogEntry(actionId);
    this.validateInput(actionId, input);
    this.consumeConfirmation(projectId, actionId, input, confirmationToken);
    await this.requireGithubRemote(projectPath, input.targetRemote);

    switch (actionId) {
      case 'pull-request-create':
        return this.create(projectPath, input);
      case 'pull-request-edit':
        return this.edit(projectPath, input);
      case 'pull-request-close':
        return this.close(projectPath, input);
      case 'pull-request-merge':
        return this.merge(projectPath, input);
      default:
        throw new GitPullRequestMutationError(
          'GIT_PULL_REQUEST_ACTION_NOT_FOUND',
          'A ação não existe no catálogo de mutações de Pull Request.',
        );
    }
  }

  private validateInput(
    actionId: GitPullRequestMutationActionId,
    input: GitPullRequestMutationInput,
  ): void {
    if (actionId === 'pull-request-create') {
      if (!input.title?.trim()) {
        throw new GitPullRequestMutationError(
          'GIT_PULL_REQUEST_ACTION_INVALID_INPUT',
          'Informe um título para criar a Pull Request.',
        );
      }
      return;
    }
    if (actionId === 'pull-request-edit') {
      requirePositiveInteger(
        input.number,
        'Informe o número da Pull Request a editar.',
      );
      if (input.title === undefined && input.description === undefined) {
        throw new GitPullRequestMutationError(
          'GIT_PULL_REQUEST_ACTION_INVALID_INPUT',
          'Informe um novo título e/ou uma nova descrição para editar a Pull Request.',
        );
      }
      return;
    }
    if (actionId === 'pull-request-close') {
      requirePositiveInteger(
        input.number,
        'Informe o número da Pull Request a fechar.',
      );
      return;
    }
    if (actionId === 'pull-request-merge') {
      requirePositiveInteger(
        input.number,
        'Informe o número da Pull Request a mesclar.',
      );
      if (!input.mergeMethod) {
        throw new GitPullRequestMutationError(
          'GIT_PULL_REQUEST_ACTION_INVALID_INPUT',
          'Informe a estratégia de merge (merge, squash ou rebase).',
        );
      }
    }
  }

  private consumeConfirmation(
    projectId: string,
    actionId: GitPullRequestMutationActionId,
    input: GitPullRequestMutationInput,
    token: string | undefined,
  ): void {
    try {
      this.confirmations.consume(
        projectId,
        actionId,
        targetSignature(actionId, input),
        token,
      );
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitPullRequestMutationError(
          'GIT_PULL_REQUEST_MUTATION_CONFIRMATION_REQUIRED',
          'Confirmação obrigatória para esta ação de Pull Request.',
        );
      }
      throw error;
    }
  }

  private async requireGithubRemote(
    projectPath: string,
    targetRemote: GitPullRequestTargetRemote | undefined,
  ): Promise<void> {
    await requireRepository(projectPath);
    const remote = targetRemote ?? 'origin';
    const url = await remoteUrl(projectPath, remote);
    const parsed = parseRemoteUrl(url);
    const provider = parsed ? detectProvider(parsed.host) : null;
    if (provider !== 'github') {
      throw new GitPullRequestError(
        'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED',
        'Ações de Pull Request via `gh` só são suportadas para remotos do GitHub.',
      );
    }
  }

  private async create(
    projectPath: string,
    input: GitPullRequestCreateInput,
  ): Promise<GitPullRequestMutationResult> {
    const targetRemote = input.targetRemote ?? 'origin';
    const branch = await currentBranch(projectPath);
    const published = await publishedReference(projectPath, branch);
    const separator = published.indexOf('/');
    const sourceRemote =
      separator > 0 ? published.slice(0, separator) : 'origin';
    const sourceBranch =
      separator > 0 ? published.slice(separator + 1) : branch;

    const baseBranch =
      input.baseBranch?.trim() ||
      (await defaultBranch(projectPath, targetRemote));
    if (input.baseBranch?.trim()) {
      await requireBaseBranch(projectPath, targetRemote, baseBranch);
    }

    const args = [
      'pr',
      'create',
      '--base',
      baseBranch,
      '--head',
      sourceBranch,
      '--title',
      input.title!.trim(),
      '--body',
      input.description ?? '',
    ];
    if (input.draft) args.push('--draft');
    if (sourceRemote !== targetRemote) {
      const sourceUrl = await remoteUrl(projectPath, sourceRemote);
      const sourceParsed = parseRemoteUrl(sourceUrl);
      if (sourceParsed) {
        const owner = sourceParsed.ownerRepo.split('/')[0];
        if (owner)
          args[args.indexOf('--head')! + 1] = `${owner}:${sourceBranch}`;
      }
    }

    const output = await this.runGh(projectPath, args);
    const number = this.parseCreatedNumber(output);
    return this.view('pull-request-create', projectPath, number);
  }

  private parseCreatedNumber(output: string): number {
    const lastLine = output.trim().split(/\s+/).pop() ?? '';
    const match = /\/pull\/(\d+)/.exec(lastLine);
    const number = match ? Number(match[1]) : Number.NaN;
    if (!Number.isInteger(number) || number < 1) {
      throw new GitPullRequestMutationError(
        'GIT_PULL_REQUEST_MUTATION_FAILED',
        'Não foi possível identificar o número da Pull Request criada.',
      );
    }
    return number;
  }

  private async edit(
    projectPath: string,
    input: GitPullRequestEditInput,
  ): Promise<GitPullRequestMutationResult> {
    const number = requirePositiveInteger(input.number, 'Número inválido.');
    const args = ['pr', 'edit', String(number)];
    if (input.title !== undefined) args.push('--title', input.title);
    if (input.description !== undefined) args.push('--body', input.description);
    await this.runGh(projectPath, args);
    return this.view('pull-request-edit', projectPath, number);
  }

  private async close(
    projectPath: string,
    input: GitPullRequestCloseInput,
  ): Promise<GitPullRequestMutationResult> {
    const number = requirePositiveInteger(input.number, 'Número inválido.');
    await this.runGh(projectPath, ['pr', 'close', String(number)]);
    return this.view('pull-request-close', projectPath, number);
  }

  private async merge(
    projectPath: string,
    input: GitPullRequestMergeInput,
  ): Promise<GitPullRequestMutationResult> {
    const number = requirePositiveInteger(input.number, 'Número inválido.');
    const methodFlag =
      input.mergeMethod === 'squash'
        ? '--squash'
        : input.mergeMethod === 'rebase'
          ? '--rebase'
          : '--merge';
    await this.runGh(projectPath, ['pr', 'merge', String(number), methodFlag]);
    return this.view('pull-request-merge', projectPath, number);
  }

  private async view(
    action: GitPullRequestMutationActionId,
    projectPath: string,
    number: number,
  ): Promise<GitPullRequestMutationResult> {
    const output = await this.runGh(projectPath, [
      'pr',
      'view',
      String(number),
      '--json',
      'number,url,title,state',
    ]);
    const view = parseView(output);
    return {
      action,
      number: view.number,
      url: view.url,
      title: view.title,
      state: mapState(view.state),
    };
  }
}
