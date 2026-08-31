import { spawn } from 'node:child_process';

import { DeploymentError } from './errors.js';

export interface DeploymentSudoStatus {
  available: boolean;
  authorized: boolean;
}

interface SudoCommandResult {
  exitCode: number;
  unavailable: boolean;
}

export type SudoCommandRunner = (
  args: readonly string[],
  input?: string,
) => Promise<SudoCommandResult>;

export type SudoDelegatedCommandRunner = () => Promise<SudoCommandResult>;

export interface SudoSessionServiceOptions {
  runSudo?: SudoCommandRunner;
  runDelegatedSudo?: SudoDelegatedCommandRunner;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function defaultRunSudo(
  args: readonly string[],
  input?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SudoCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('sudo', [...args], {
      env: { ...process.env },
      shell: false,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'ignore'],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL');
    }, timeoutMs);
    timer.unref();

    const finish = (result: SudoCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        finish({ exitCode: 127, unavailable: true });
        return;
      }
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.once('close', (code) => {
      finish({ exitCode: code ?? 1, unavailable: false });
    });

    if (input !== undefined && child.stdin) {
      const secret = Buffer.from(`${input}\n`, 'utf8');
      child.stdin.end(secret, () => secret.fill(0));
    }
  });
}

/**
 * Confirma o ticket a partir de outro processo pai, reproduzindo a parte
 * relevante da árvore real `npm -> shell -> sudo`. Em hosts com
 * `timestamp_type=ppid`, um `sudo -n -v` disparado diretamente pela API pode
 * reutilizar o próprio ticket e produzir falso positivo, enquanto o sudo do
 * script de produção será autenticado separadamente.
 *
 * O comando do shell é literal e não contém dado do navegador ou do projeto.
 */
function defaultRunDelegatedSudo(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SudoCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', 'sudo -n -v'], {
      env: { ...process.env },
      shell: false,
      stdio: 'ignore',
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL');
    }, timeoutMs);
    timer.unref();

    const finish = (result: SudoCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        finish({ exitCode: 127, unavailable: true });
        return;
      }
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.once('close', (code) => {
      const exitCode = code ?? 1;
      finish({
        exitCode,
        unavailable: exitCode === 127,
      });
    });
  });
}

export class SudoSessionService {
  private readonly runSudo: SudoCommandRunner;
  private readonly runDelegatedSudo: SudoDelegatedCommandRunner;

  public constructor(options: SudoSessionServiceOptions = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.runSudo =
      options.runSudo ??
      ((args, input) => defaultRunSudo(args, input, timeoutMs));
    this.runDelegatedSudo =
      options.runDelegatedSudo ?? (() => defaultRunDelegatedSudo(timeoutMs));
  }

  public async status(): Promise<DeploymentSudoStatus> {
    const result = await this.runDelegatedSudo();
    return {
      available: !result.unavailable,
      authorized: !result.unavailable && result.exitCode === 0,
    };
  }

  public async authorize(password: string): Promise<DeploymentSudoStatus> {
    if (!password) {
      throw new DeploymentError(
        'DEPLOYMENT_PRIVILEGE_REQUIRED',
        'Informe a senha do sudo para autorizar temporariamente o deployment.',
      );
    }

    const authorization = await this.runSudo(['-S', '-v', '-p', ''], password);
    if (authorization.unavailable) {
      throw new DeploymentError(
        'DEPLOYMENT_PRIVILEGE_REQUIRED',
        'sudo não está disponível neste host.',
      );
    }
    if (authorization.exitCode !== 0) {
      throw new DeploymentError(
        'DEPLOYMENT_PRIVILEGE_REQUIRED',
        'Não foi possível autorizar sudo. Confira a senha e a política sudoers deste usuário.',
      );
    }

    const status = await this.status();
    if (!status.available) {
      throw new DeploymentError(
        'DEPLOYMENT_PRIVILEGE_REQUIRED',
        'A senha foi aceita, mas não foi possível validar sudo a partir da árvore de processos do deployment.',
      );
    }
    if (!status.authorized) {
      throw new DeploymentError(
        'DEPLOYMENT_SUDO_TICKET_NOT_DELEGATED',
        'A senha foi aceita, mas o ticket sudo não pode ser reutilizado pela árvore de processos do deployment. Este host exige uma remediação não interativa, como uma regra NOPASSWD limitada ao helper de produção do projeto. Depois de configurá-la, gere um novo plano de deployment.',
      );
    }
    return status;
  }
}
