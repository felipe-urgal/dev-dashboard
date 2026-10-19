import { execFile } from 'node:child_process';

const MAX_BUFFER = 256 * 1024;
const TIMEOUT_MS = 2_000;

export interface DockerContainerObservation {
  id: string;
  name: string;
  state: 'running' | 'starting' | 'stopped' | 'failed' | 'unknown';
}

export interface DockerContainerSnapshot {
  status: 'ready' | 'unavailable' | 'unsupported';
  containers: DockerContainerObservation[];
  truncated: boolean;
}

export interface DockerContainerObserverOptions {
  platform?: NodeJS.Platform;
  runDocker?: () => Promise<string>;
  limit?: number;
}

function runDocker(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      ['container', 'ls', '--all', '--no-trunc', '--format', '{{json .}}'],
      {
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}

function state(value: string): DockerContainerObservation['state'] {
  switch (value) {
    case 'running':
      return 'running';
    case 'restarting':
      return 'starting';
    case 'created':
    case 'exited':
    case 'paused':
      return 'stopped';
    case 'dead':
      return 'failed';
    default:
      return 'unknown';
  }
}

export class DockerContainerObserver {
  private readonly platform: NodeJS.Platform;
  private readonly runner: () => Promise<string>;
  private readonly limit: number;

  public constructor(options: DockerContainerObserverOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.runner = options.runDocker ?? runDocker;
    this.limit = Math.max(1, Math.min(100, options.limit ?? 100));
  }

  public async inspect(): Promise<DockerContainerSnapshot> {
    if (this.platform !== 'linux') {
      return { status: 'unsupported', containers: [], truncated: false };
    }
    let output: string;
    try {
      output = await this.runner();
    } catch {
      return { status: 'unavailable', containers: [], truncated: false };
    }
    const containers: DockerContainerObservation[] = [];
    let truncated = false;
    try {
      for (const line of output.split(/\r?\n/)) {
        if (!line.trim()) continue;
        // Docker CLI output is treated as untrusted data.
        const row: unknown = JSON.parse(line);
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const record = row as Record<string, unknown>;
        const id = record.ID;
        const name = record.Names;
        if (typeof id !== 'string' || !/^[a-f0-9]{12,64}$/.test(id)) continue;
        if (
          typeof name !== 'string' ||
          !name ||
          name.length > 200 ||
          /[\r\n\x00-\x1f]/.test(name)
        )
          continue;
        if (containers.length >= this.limit) {
          truncated = true;
          break;
        }
        containers.push({
          id,
          name,
          state: state(typeof record.State === 'string' ? record.State : ''),
        });
      }
    } catch {
      return { status: 'unavailable', containers: [], truncated: false };
    }
    return { status: 'ready', containers, truncated };
  }
}
