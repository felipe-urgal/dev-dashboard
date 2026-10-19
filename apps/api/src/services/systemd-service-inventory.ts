import { execFile } from 'node:child_process';

import type {
  HostServiceBootState,
  HostServiceInventory,
  HostServiceInventorySource,
  HostServiceObservation,
  HostServiceScope,
  HostServiceState,
} from '@dev-dashboard/contracts';

const COMMAND_TIMEOUT_MS = 1_500;
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_SERVICES = 200;
const SERVICE_NAME = /^[A-Za-z0-9_.@:\\-]{1,200}\.service$/;
const SCOPES: readonly HostServiceScope[] = ['user', 'system'];

type QueryKind = 'units' | 'unit-files';
type Runner = (scope: HostServiceScope, query: QueryKind) => Promise<string>;

export interface SystemdServiceInventoryOptions {
  platform?: NodeJS.Platform;
  now?: () => Date;
  runSystemctl?: Runner;
  maxServices?: number;
}

function runSystemctl(
  scope: HostServiceScope,
  query: QueryKind,
): Promise<string> {
  const args = [
    ...(scope === 'user' ? ['--user'] : []),
    query === 'units' ? 'list-units' : 'list-unit-files',
    '--type=service',
    ...(query === 'units' ? ['--all'] : []),
    '--no-legend',
    '--no-pager',
    '--plain',
  ];

  return new Promise((resolve, reject) => {
    execFile(
      'systemctl',
      args,
      {
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: COMMAND_TIMEOUT_MS,
        windowsHide: true,
        env: { ...process.env, LC_ALL: 'C' },
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function safeUnit(name: string | undefined): name is string {
  return typeof name === 'string' && SERVICE_NAME.test(name);
}

function systemdState(active: string, sub: string): HostServiceState {
  if (active === 'failed') return 'failed';
  if (active === 'activating' || active === 'reloading') return 'starting';
  if (active === 'deactivating') return 'stopping';
  if (active === 'inactive') return 'stopped';
  if (active === 'active' && sub === 'running') return 'running';
  return 'unknown';
}

function bootState(value: string): HostServiceBootState {
  switch (value) {
    case 'enabled':
    case 'enabled-runtime':
      return 'enabled';
    case 'disabled':
    case 'disabled-runtime':
      return 'disabled';
    case 'static':
    case 'masked':
    case 'indirect':
    case 'linked':
    case 'generated':
    case 'transient':
      return value;
    default:
      return 'unknown';
  }
}

function parseUnits(output: string): Map<string, HostServiceState> {
  const result = new Map<string, HostServiceState>();
  for (const row of output.split(/\r?\n/)) {
    // systemctl may prefix failed units with a bullet.
    const [name, , active, sub] = row
      .trim()
      .replace(/^[●×]\s+/, '')
      .split(/\s+/);
    if (!safeUnit(name) || !active || !sub) continue;
    result.set(name, systemdState(active, sub));
  }
  return result;
}

function parseUnitFiles(output: string): Map<string, HostServiceBootState> {
  const result = new Map<string, HostServiceBootState>();
  for (const row of output.split(/\r?\n/)) {
    const [name, state] = row.trim().split(/\s+/);
    if (!safeUnit(name) || !state) continue;
    result.set(name, bootState(state));
  }
  return result;
}

export class SystemdServiceInventory {
  private readonly platform: NodeJS.Platform;
  private readonly now: () => Date;
  private readonly runner: Runner;
  private readonly maxServices: number;

  public constructor(options: SystemdServiceInventoryOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.now = options.now ?? (() => new Date());
    this.runner = options.runSystemctl ?? runSystemctl;
    this.maxServices = Math.max(
      1,
      Math.min(MAX_SERVICES, options.maxServices ?? MAX_SERVICES),
    );
  }

  public async inspect(): Promise<HostServiceInventory> {
    const observedAt = this.now().toISOString();

    if (this.platform !== 'linux') {
      return {
        status: 'unsupported',
        observedAt,
        services: [],
        sources: SCOPES.map((scope) => ({
          scope,
          status: 'unsupported',
          diagnostic: 'Systemd inventory is supported on Linux only.',
        })),
        truncated: false,
      };
    }

    const sources: HostServiceInventorySource[] = [];
    const services: HostServiceObservation[] = [];
    let truncated = false;

    for (const scope of SCOPES) {
      // A failed user bus does not invalidate successful system observations.
      const [unitsResult, filesResult] = await Promise.allSettled([
        this.runner(scope, 'units'),
        this.runner(scope, 'unit-files'),
      ]);
      const units =
        unitsResult.status === 'fulfilled'
          ? parseUnits(unitsResult.value)
          : new Map<string, HostServiceState>();
      const unitFiles =
        filesResult.status === 'fulfilled'
          ? parseUnitFiles(filesResult.value)
          : new Map<string, HostServiceBootState>();

      const complete =
        unitsResult.status === 'fulfilled' &&
        filesResult.status === 'fulfilled';
      const available =
        unitsResult.status === 'fulfilled' ||
        filesResult.status === 'fulfilled';

      sources.push({
        scope,
        status: complete ? 'ready' : available ? 'partial' : 'unavailable',
        ...(!complete
          ? {
              diagnostic:
                'Some systemd observations are unavailable; runtime and/or boot state is unverified.',
            }
          : {}),
      });

      const names = [...new Set([...units.keys(), ...unitFiles.keys()])].sort();
      for (const name of names) {
        if (services.length >= this.maxServices) {
          truncated = true;
          break;
        }
        const state = units.get(name) ?? 'unknown';
        services.push({
          id: 'systemd:' + scope + ':' + name,
          provider: 'systemd',
          scope,
          name,
          state,
          readiness: 'unknown',
          bootState: unitFiles.get(name) ?? 'unknown',
          managed: false,
          observedAt,
          ...(state === 'unknown'
            ? {
                diagnostic:
                  'Runtime state is not proven; no application health has been checked.',
              }
            : {}),
        });
      }
    }

    const available = sources.filter(
      (source) => source.status !== 'unavailable',
    );
    return {
      status:
        available.length === 0
          ? 'unavailable'
          : available.length !== SCOPES.length ||
              sources.some((source) => source.status !== 'ready') ||
              truncated
            ? 'partial'
            : 'ready',
      observedAt,
      services,
      sources,
      truncated,
    };
  }
}
