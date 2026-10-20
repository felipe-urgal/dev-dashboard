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
const SHOW_BATCH_SIZE = 40;
const SERVICE_NAME = /^[A-Za-z0-9_.@:\\-]{1,200}\.service$/;
const SCOPES: readonly HostServiceScope[] = ['user', 'system'];

type QueryKind = 'units' | 'unit-files' | 'show';
type Runner = (
  scope: HostServiceScope,
  query: QueryKind,
  names?: readonly string[],
) => Promise<string>;

export interface SystemdServiceInventoryOptions {
  platform?: NodeJS.Platform;
  now?: () => Date;
  runSystemctl?: Runner;
  maxServices?: number;
}

function runSystemctl(
  scope: HostServiceScope,
  query: QueryKind,
  names: readonly string[] = [],
): Promise<string> {
  const args = [
    ...(scope === 'user' ? ['--user'] : []),
    ...(query === 'show'
      ? [
          'show',
          '--no-pager',
          '--property=Id,ActiveState,SubState,UnitFileState,FragmentPath,Transient,TriggeredBy',
          '--',
          ...names,
        ]
      : [
          query === 'units' ? 'list-units' : 'list-unit-files',
          '--type=service',
          ...(query === 'units' ? ['--all'] : []),
          '--no-legend',
          '--no-pager',
          '--plain',
        ]),
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

type UnitDetails = Record<string, string>;

/** Parse only known properties; never return raw systemctl output or file paths. */
function parseDetails(output: string): Map<string, UnitDetails> {
  const result = new Map<string, UnitDetails>();
  for (const block of output.split(/\r?\n\r?\n/)) {
    const record: UnitDetails = {};
    for (const line of block.split(/\r?\n/)) {
      const match = /^(Id|ActiveState|SubState|UnitFileState|FragmentPath|Transient|TriggeredBy)=(.*)$/.exec(line);
      if (match?.[1]) record[match[1]] = match[2] ?? '';
    }
    if (safeUnit(record.Id)) result.set(record.Id, record);
  }
  return result;
}

function fragmentKind(path: string | undefined): 'persistent' | 'runtime' | 'none' | 'unknown' {
  if (path === '') return 'none';
  if (path?.startsWith('/run/')) return 'runtime';
  if (path?.startsWith('/')) return 'persistent';
  return 'unknown';
}

function activeState(value: string | undefined): NonNullable<HostServiceObservation['activeState']> {
  switch (value) {
    case 'active':
    case 'inactive':
    case 'activating':
    case 'deactivating':
    case 'failed':
    case 'reloading':
      return value;
    default:
      return 'unknown';
  }
}

function subState(value: string | undefined): NonNullable<HostServiceObservation['subState']> {
  switch (value) {
    case 'running':
    case 'dead':
    case 'exited':
    case 'failed':
    case 'waiting':
      return value;
    default:
      return 'unknown';
  }
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

      const names = [...new Set([...units.keys(), ...unitFiles.keys()])].sort();
      // Keep at least half the budget available for the system scope.
      const scopeBudget = scope === 'user'
        ? Math.max(1, Math.floor(this.maxServices / 2))
        : this.maxServices - services.length;
      const selected = names.slice(0, Math.max(0, scopeBudget));
      if (selected.length !== names.length) truncated = true;

      const details = new Map<string, UnitDetails>();
      let detailsComplete = true;
      if (available) {
        const batches: string[][] = [];
        for (let i = 0; i < selected.length; i += SHOW_BATCH_SIZE) {
          batches.push(selected.slice(i, i + SHOW_BATCH_SIZE));
        }
        const results = await Promise.allSettled(
          batches.map((batch) => this.runner(scope, 'show', batch)),
        );
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result?.status === 'rejected') {
            detailsComplete = false;
            continue;
          }
          if (result?.status === 'fulfilled') {
            const parsed = parseDetails(result.value);
            for (const name of batches[i] ?? []) {
              const record = parsed.get(name);
              if (record) details.set(name, record);
              else detailsComplete = false;
            }
          }
        }
      }

      sources.push({
        scope,
        status: !available ? 'unavailable' : complete && detailsComplete ? 'ready' : 'partial',
        ...(!complete || !detailsComplete
          ? {
              diagnostic:
                'Some systemd observations are unavailable; runtime, unit identity and/or boot state is unverified.',
            }
          : {}),
      });

      for (const name of selected) {
        const detail = details.get(name);
        const state = detail?.ActiveState && detail.SubState
          ? systemdState(detail.ActiveState, detail.SubState)
          : units.get(name) ?? 'unknown';
        const boot = detail?.UnitFileState
          ? bootState(detail.UnitFileState)
          : unitFiles.get(name) ?? 'unknown';
        const unitKind = detail?.Transient === 'yes' || boot === 'transient'
          ? 'transient' as const
          : boot === 'generated'
            ? 'generated' as const
            : name.includes('@.service')
              ? 'template' as const
              : name.includes('@')
                ? 'instance' as const
                : 'regular' as const;
        services.push({
          id: 'systemd:' + scope + ':' + name,
          provider: 'systemd',
          scope,
          name,
          state,
          readiness: 'unknown',
          bootState: boot,
          ...(detail ? {
            activeState: activeState(detail.ActiveState),
            subState: subState(detail.SubState),
            fragmentKind: fragmentKind(detail.FragmentPath),
          } : {}),
          unitKind,
          managed: false,
          observedAt,
          ...(state === 'unknown' || !detail || detail.TriggeredBy
            ? {
                diagnostic: detail?.TriggeredBy
                  ? 'Socket activation detected; active does not prove readiness.'
                  : 'Runtime or unit details are not proven; no application health has been checked.',
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
