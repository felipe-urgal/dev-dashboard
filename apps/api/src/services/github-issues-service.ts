import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PAGE_SIZE = 50;

type CommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<string>;

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  url: string;
  author: string;
  labels: string[];
  updatedAt: string;
}

export class GithubIssuesError extends Error {
  public constructor(
    public readonly code:
      | 'UNSUPPORTED_REMOTE'
      | 'REMOTE_UNAVAILABLE'
      | 'INVALID_RESPONSE'
      | 'INVALID_INPUT'
      | 'ISSUE_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'GithubIssuesError';
  }
}

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<string> {
  const result = await execFileAsync(command, [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, LC_ALL: 'C' },
  });
  return result.stdout.trim();
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseIssue(value: unknown): GithubIssue | null {
  const raw = record(value);
  if (!raw || raw.pull_request !== undefined) return null;
  if (
    typeof raw.number !== 'number' ||
    !Number.isInteger(raw.number) ||
    raw.number < 1 ||
    typeof raw.title !== 'string' ||
    typeof raw.state !== 'string' ||
    (raw.state !== 'open' && raw.state !== 'closed') ||
    typeof raw.html_url !== 'string' ||
    !/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(raw.html_url)
  ) {
    return null;
  }

  return {
    number: raw.number,
    title: raw.title,
    body: typeof raw.body === 'string' ? raw.body : '',
    state: raw.state,
    url: raw.html_url,
    author: typeof record(raw.user)?.login === 'string' ? (record(raw.user)!.login as string) : '',
    labels: Array.isArray(raw.labels)
      ? raw.labels
          .map((item) => record(item)?.name)
          .filter((name): name is string => typeof name === 'string')
      : [],
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  };
}

function issueRequired(value: unknown): GithubIssue {
  const issue = parseIssue(value);
  if (!issue) {
    throw new GithubIssuesError(
      'ISSUE_NOT_FOUND',
      'A issue não existe neste repositório ou é uma Pull Request.',
    );
  }
  return issue;
}

function validateText(title: string | undefined, body: string | undefined): void {
  if (title !== undefined && (!title.trim() || title.length > 256)) {
    throw new GithubIssuesError('INVALID_INPUT', 'Informe um título com até 256 caracteres.');
  }
  if (body !== undefined && body.length > 20_000) {
    throw new GithubIssuesError('INVALID_INPUT', 'A descrição deve ter até 20.000 caracteres.');
  }
}

export class GithubIssuesService {
  public constructor(private readonly commandRunner: CommandRunner = runCommand) {}

  private async repository(projectPath: string): Promise<string> {
    let remote: string;
    try {
      remote = await this.commandRunner('git', ['remote', 'get-url', 'origin'], projectPath);
    } catch {
      throw new GithubIssuesError(
        'UNSUPPORTED_REMOTE',
        'Configure um origin do GitHub para gerenciar issues.',
      );
    }

    const match = /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remote.trim());
    if (!match) {
      throw new GithubIssuesError(
        'UNSUPPORTED_REMOTE',
        'O origin precisa apontar para um repositório no github.com.',
      );
    }
    return match[1] + '/' + match[2];
  }

  private async githubJson(
    projectPath: string,
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' = 'GET',
    fields: Record<string, string> = {},
  ): Promise<unknown> {
    const args = ['api', '--hostname', 'github.com', '--method', method, endpoint];
    for (const [name, value] of Object.entries(fields)) {
      args.push('-f', name + '=' + value);
    }
    let output: string;
    try {
      output = await this.commandRunner('gh', args, projectPath);
    } catch {
      throw new GithubIssuesError(
        'REMOTE_UNAVAILABLE',
        'Não foi possível acessar o GitHub. Verifique a conexão e a autenticação do gh.',
      );
    }
    try {
      return JSON.parse(output) as unknown;
    } catch {
      throw new GithubIssuesError('INVALID_RESPONSE', 'O GitHub retornou uma resposta inválida.');
    }
  }

  public async list(
    projectPath: string,
    state: 'open' | 'closed',
    page: number,
  ): Promise<{ repository: string; issues: GithubIssue[]; hasMore: boolean; page: number }> {
    if (!Number.isInteger(page) || page < 1 || page > 100) {
      throw new GithubIssuesError('INVALID_INPUT', 'Página inválida.');
    }
    const repository = await this.repository(projectPath);
    const data = await this.githubJson(
      projectPath,
      'repos/' + repository + '/issues?state=' + state + '&per_page=' + PAGE_SIZE + '&page=' + page,
    );
    if (!Array.isArray(data)) {
      throw new GithubIssuesError('INVALID_RESPONSE', 'Não foi possível ler a lista de issues.');
    }
    return {
      repository,
      issues: data.map(parseIssue).filter((issue): issue is GithubIssue => issue !== null),
      hasMore: data.length === PAGE_SIZE,
      page,
    };
  }

  public async create(projectPath: string, title: string, body: string): Promise<GithubIssue> {
    validateText(title, body);
    const repository = await this.repository(projectPath);
    return issueRequired(
      await this.githubJson(projectPath, 'repos/' + repository + '/issues', 'POST', {
        title: title.trim(),
        body,
      }),
    );
  }

  private async getIssue(projectPath: string, repository: string, number: number): Promise<GithubIssue> {
    if (!Number.isInteger(number) || number < 1) {
      throw new GithubIssuesError('INVALID_INPUT', 'Número da issue inválido.');
    }
    return issueRequired(
      await this.githubJson(projectPath, 'repos/' + repository + '/issues/' + number),
    );
  }

  public async edit(
    projectPath: string,
    number: number,
    title: string,
    body: string,
  ): Promise<GithubIssue> {
    validateText(title, body);
    const repository = await this.repository(projectPath);
    await this.getIssue(projectPath, repository, number);
    return issueRequired(
      await this.githubJson(projectPath, 'repos/' + repository + '/issues/' + number, 'PATCH', {
        title: title.trim(),
        body,
      }),
    );
  }

  public async close(projectPath: string, number: number): Promise<GithubIssue> {
    const repository = await this.repository(projectPath);
    const issue = await this.getIssue(projectPath, repository, number);
    if (issue.state === 'closed') return issue;
    return issueRequired(
      await this.githubJson(projectPath, 'repos/' + repository + '/issues/' + number, 'PATCH', {
        state: 'closed',
      }),
    );
  }
}
