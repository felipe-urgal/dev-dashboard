import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFile, lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type LocalServiceAction = 'start' | 'stop' | 'restart';
export type LocalServiceState = 'running' | 'stopped' | 'failed' | 'unknown';
export type LocalReadiness = 'ready' | 'unhealthy' | 'unknown';
export interface LocalServiceSnapshot {
  id: 'home-music';
  name: string;
  unit: string;
  scope: 'system';
  state: LocalServiceState;
  bootState: string;
  readiness: LocalReadiness;
  controllable: boolean;
  reason: string | null;
  observedAt: string;
}
export interface LocalServicePlan {
  action: LocalServiceAction;
  confirmation: string;
  expectedState: LocalServiceState;
  expiresAt: string;
  service: LocalServiceSnapshot;
}
export interface LocalServiceOutcome {
  action: LocalServiceAction;
  status: 'completed' | 'unverified';
  service: LocalServiceSnapshot;
  message: string;
}

const UNIT = 'home-music.service';
const HELPER = '/usr/local/sbin/home-music-service-control';
const UNIT_PATH = '/etc/systemd/system/home-music.service';
const PLAN_TTL_MS = 30_000;
const ACTIONS: readonly LocalServiceAction[] = ['start', 'stop', 'restart'];

type Runner = (command: string, args: readonly string[]) => Promise<string>;
type Audit = (entry: Record<string, unknown>) => Promise<void>;

function execute(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        encoding: 'utf8',
        timeout: 12_000,
        maxBuffer: 8192,
        windowsHide: true,
        shell: false,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

function properties(output: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of output.split(/\r?\n/u)) {
    const match =
      /^(Id|LoadState|ActiveState|SubState|UnitFileState|FragmentPath|Transient)=(.*)$/u.exec(
        line,
      );
    if (match?.[1]) parsed[match[1]] = match[2] ?? '';
  }
  return parsed;
}

export class LocalServiceControlError extends Error {
  public constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'LocalServiceControlError';
  }
}

export interface LocalServiceManagerOptions {
  run?: Runner;
  helperTrusted?: () => Promise<boolean>;
  probeReady?: () => Promise<boolean>;
  audit?: Audit;
  stateDirectory?: string;
  now?: () => number;
  platform?: NodeJS.Platform;
}

export class LocalServiceManager {
  private readonly run: Runner;
  private readonly helperTrusted: () => Promise<boolean>;
  private readonly probeReady: () => Promise<boolean>;
  private readonly audit: Audit;
  private readonly now: () => number;
  private readonly platform: NodeJS.Platform;
  private readonly plans = new Map<
    string,
    { action: LocalServiceAction; state: LocalServiceState; expires: number }
  >();
  private busy = false;

  public constructor(options: LocalServiceManagerOptions = {}) {
    this.run = options.run ?? execute;
    this.now = options.now ?? Date.now;
    this.platform = options.platform ?? process.platform;
    this.helperTrusted =
      options.helperTrusted ??
      (async () => {
        try {
          const stat = await lstat(HELPER);
          return (
            stat.isFile() &&
            stat.uid === 0 &&
            stat.gid === 0 &&
            (stat.mode & 0o777) === 0o755
          );
        } catch {
          return false;
        }
      });
    this.probeReady =
      options.probeReady ??
      (async () => {
        try {
          const response = await fetch('http://127.0.0.1:8787/ready', {
            redirect: 'manual',
            signal: AbortSignal.timeout(2000),
          });
          return response.ok;
        } catch {
          return false;
        }
      });
    this.audit =
      options.audit ??
      (async (entry) => {
        const directory = options.stateDirectory;
        if (!directory) throw new Error('Audit storage unavailable');
        const auditDirectory = path.join(directory, 'local-services');
        await mkdir(auditDirectory, { recursive: true, mode: 0o700 });
        await appendFile(
          path.join(auditDirectory, 'operations.jsonl'),
          JSON.stringify(entry) + '\n',
          { mode: 0o600 },
        );
      });
  }

  private async observe(): Promise<{
    state: LocalServiceState;
    bootState: string;
    trusted: boolean;
  }> {
    if (this.platform !== 'linux')
      return { state: 'unknown', bootState: 'unknown', trusted: false };
    let output: string;
    try {
      output = await this.run('systemctl', [
        'show',
        '--no-pager',
        '--property=Id,LoadState,ActiveState,SubState,UnitFileState,FragmentPath,Transient',
        '--',
        UNIT,
      ]);
    } catch {
      return { state: 'unknown', bootState: 'unknown', trusted: false };
    }
    const values = properties(output);
    const trusted =
      values.Id === UNIT &&
      values.LoadState === 'loaded' &&
      values.FragmentPath === UNIT_PATH &&
      values.Transient === 'no' &&
      values.UnitFileState !== 'masked';
    const state: LocalServiceState = !trusted
      ? 'unknown'
      : values.ActiveState === 'active' && values.SubState === 'running'
        ? 'running'
        : values.ActiveState === 'inactive'
          ? 'stopped'
          : values.ActiveState === 'failed'
            ? 'failed'
            : 'unknown';
    return { state, bootState: values.UnitFileState ?? 'unknown', trusted };
  }

  public async snapshot(ignoreBusy = false): Promise<LocalServiceSnapshot> {
    const observed = await this.observe();
    let allowed = false;
    if (
      observed.trusted &&
      observed.state !== 'unknown' &&
      (await this.helperTrusted())
    ) {
      try {
        await this.run('sudo', ['-n', HELPER, 'check']);
        allowed = true;
      } catch {
        // Operator needs to re-run the Home Music systemd installer.
      }
    }
    const readiness: LocalReadiness =
      observed.state === 'running'
        ? (await this.probeReady())
          ? 'ready'
          : 'unhealthy'
        : 'unknown';
    return {
      id: 'home-music',
      name: 'Home Music',
      unit: UNIT,
      scope: 'system',
      state: observed.state,
      bootState: observed.bootState,
      readiness,
      controllable: allowed && (ignoreBusy || !this.busy),
      reason: this.busy && !ignoreBusy
        ? 'Uma operação de serviço está em andamento.'
        : !observed.trusted
          ? 'Instalação systemd não encontrada ou identidade não verificada.'
          : !allowed
            ? 'Helper não autorizado. Reinstale com npm run service:install no Home Music.'
            : null,
      observedAt: new Date(this.now()).toISOString(),
    };
  }

  public async plan(action: LocalServiceAction): Promise<LocalServicePlan> {
    if (!ACTIONS.includes(action))
      throw new LocalServiceControlError(400, 'Ação inválida.');
    if (this.busy) throw new LocalServiceControlError(409, 'Serviço ocupado.');
    const service = await this.snapshot();
    if (!service.controllable)
      throw new LocalServiceControlError(
        403,
        service.reason ?? 'Controle indisponível.',
      );
    if (
      (action === 'start' && service.state !== 'stopped') ||
      (action !== 'start' && service.state !== 'running')
    ) {
      throw new LocalServiceControlError(
        409,
        'Ação incompatível com o estado atual.',
      );
    }
    for (const [token, value] of this.plans)
      if (value.expires <= this.now()) this.plans.delete(token);
    const confirmation = randomBytes(32).toString('hex');
    const expires = this.now() + PLAN_TTL_MS;
    this.plans.set(confirmation, { action, state: service.state, expires });
    return {
      action,
      confirmation,
      expectedState: service.state,
      expiresAt: new Date(expires).toISOString(),
      service,
    };
  }

  public async apply(
    action: LocalServiceAction,
    confirmation: string,
  ): Promise<LocalServiceOutcome> {
    const pending = this.plans.get(confirmation);
    this.plans.delete(confirmation);
    if (
      !pending ||
      pending.expires <= this.now() ||
      pending.action !== action
    ) {
      throw new LocalServiceControlError(
        409,
        'Confirmação ausente, inválida ou expirada. Atualize a prévia.',
      );
    }
    if (this.busy)
      throw new LocalServiceControlError(
        409,
        'Uma operação já está em andamento.',
      );
    this.busy = true;
    try {
      const before = await this.snapshotForExecution();
      if (before.state !== pending.state || !before.controllable) {
        throw new LocalServiceControlError(
          409,
          'Estado ou autorização mudou. Solicite uma nova prévia.',
        );
      }
      const occurredAt = new Date(this.now()).toISOString();
      const identifier = randomBytes(16).toString('hex');
      try {
        await this.audit({
          id: identifier,
          unit: UNIT,
          action,
          stage: 'invoking',
          state: before.state,
          occurredAt,
        });
      } catch {
        throw new LocalServiceControlError(
          503,
          'Auditoria indisponível. Nenhum comando foi enviado.',
        );
      }
      let commandFailed = false;
      try {
        await this.run('sudo', ['-n', HELPER, action]);
      } catch {
        commandFailed = true;
      }
      const after = await this.snapshotForExecution();
      const complete =
        !commandFailed &&
        (action === 'stop'
          ? after.state === 'stopped'
          : after.state === 'running' && after.readiness === 'ready');
      const status = complete ? 'completed' : 'unverified';
      try {
        await this.audit({
          id: identifier,
          unit: UNIT,
          action,
          stage: status,
          state: after.state,
          occurredAt: new Date(this.now()).toISOString(),
        });
      } catch {
        // Command may have run. Do not re-issue it when the completion record fails.
        return {
          action,
          status: 'unverified',
          service: after,
          message:
            'O comando pode ter sido aplicado, mas a auditoria final falhou. Confira o systemd antes de repetir.',
        };
      }
      return {
        action,
        status,
        service: after,
        message: complete
          ? 'Estado confirmado.'
          : 'Estado final não comprovado. Verifique status e logs antes de repetir.',
      };
    } finally {
      this.busy = false;
    }
  }

  private async snapshotForExecution(): Promise<LocalServiceSnapshot> {
    return this.snapshot(true);
  }
}
