import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

import type { ProjectBrowserTarget } from '@dev-dashboard/contracts';

export type ProjectBrowserErrorCode =
  | 'BROWSER_NOT_AVAILABLE'
  | 'BROWSER_LAUNCH_FAILED';

export class ProjectBrowserError extends Error {
  public constructor(
    public readonly code: ProjectBrowserErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectBrowserError';
  }
}

interface BrowserOpenerDefinition {
  platform: NodeJS.Platform;
  command: string;
  buildArgs: (url: string) => string[];
}

// Catálogo fechado: um único comando conhecido por sistema operacional, sem
// interpolar nada vindo do navegador além da URL já resolvida internamente
// pela API. `start` é builtin do `cmd.exe` no Windows, por isso é tratado
// como um caso especial (`cmd /c start "" <url>`), mas ainda via `spawn` com
// argumentos explícitos e `shell: false`.
const OPENERS: readonly BrowserOpenerDefinition[] = [
  { platform: 'darwin', command: 'open', buildArgs: (url) => [url] },
  { platform: 'linux', command: 'xdg-open', buildArgs: (url) => [url] },
  {
    platform: 'win32',
    command: 'cmd',
    buildArgs: (url) => ['/c', 'start', '', url],
  },
];

async function executableOnPath(
  command: string,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Promise<string | null> {
  // No Windows, `cmd.exe` é um binário garantido pelo sistema operacional
  // (aponta por `ComSpec`), não um comando de terceiros a procurar no PATH
  // como os demais — a mesma lógica de detecção dos outros openers não se
  // aplica a ele.
  if (platform === 'win32' && command === 'cmd') {
    return environment.ComSpec || environment.COMSPEC || 'cmd.exe';
  }

  const searchPath = environment.PATH ?? '';
  for (const directory of searchPath.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, command);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continua procurando no catálogo de diretórios do PATH.
    }
  }
  return null;
}

function launchDetached(
  executable: string,
  args: readonly string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      detached: true,
      shell: false,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export interface ProjectBrowserServiceOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  resolveExecutable?: (command: string) => Promise<string | null>;
  launch?: (executable: string, args: readonly string[]) => Promise<void>;
}

export class ProjectBrowserService {
  private readonly platform: NodeJS.Platform;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly resolveExecutable: NonNullable<
    ProjectBrowserServiceOptions['resolveExecutable']
  >;

  private readonly launch: NonNullable<
    ProjectBrowserServiceOptions['launch']
  >;

  public constructor(options: ProjectBrowserServiceOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.environment = options.environment ?? process.env;
    this.resolveExecutable =
      options.resolveExecutable
      ?? ((command) => executableOnPath(command, this.environment, this.platform));
    this.launch = options.launch ?? launchDetached;
  }

  public async open(
    target: ProjectBrowserTarget,
    url: string,
  ): Promise<{ target: ProjectBrowserTarget; url: string; opened: true }> {
    const opener = OPENERS.find(
      (candidate) => candidate.platform === this.platform,
    );
    if (!opener) {
      throw new ProjectBrowserError(
        'BROWSER_NOT_AVAILABLE',
        'Não há um comando conhecido para abrir o navegador neste sistema operacional.',
      );
    }

    const executable = await this.resolveExecutable(opener.command);
    if (!executable) {
      throw new ProjectBrowserError(
        'BROWSER_NOT_AVAILABLE',
        'Nenhum navegador padrão disponível para abrir automaticamente.',
      );
    }

    try {
      await this.launch(executable, opener.buildArgs(url));
    } catch {
      throw new ProjectBrowserError(
        'BROWSER_LAUNCH_FAILED',
        'Não foi possível abrir o navegador padrão.',
      );
    }

    return { target, url, opened: true };
  }
}
