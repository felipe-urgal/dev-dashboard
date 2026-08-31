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

export interface SudoSessionServiceOptions {
  runSudo?: SudoCommandRunner;
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

export class SudoSessionService {
  private readonly runSudo: SudoCommandRunner;

  public constructor(options: SudoSessionServiceOptions = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.runSudo =
      options.runSudo ??
      ((args, input) => defaultRunSudo(args, input, timeoutMs));
  }

  public async status(): Promise<DeploymentSudoStatus> {
    const result = await this.runSudo(['-n', '-v']);
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
    if (!status.authorized) {
      throw new DeploymentError(
        'DEPLOYMENT_PRIVILEGE_REQUIRED',
        'A senha foi aceita, mas a política sudoers não permite reutilizar a autorização sem TTY. Configure uma regra NOPASSWD limitada aos comandos de produção deste projeto.',
      );
    }
    return status;
  }
}
