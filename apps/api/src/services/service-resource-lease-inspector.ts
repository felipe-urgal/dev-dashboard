import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type LeaseObservation = 'absent' | 'present' | 'unverifiable';
export type LeaseProcessObservation = 'alive' | 'not-observed' | 'unknown';

export interface ResourceLeaseEvidence {
  resourceKey: string;
  status: LeaseObservation;
  ownerProcess: LeaseProcessObservation;
  /** Identifying process existence is not a guarantee that it owns a lease. */
  diagnostic: string;
}

interface LeaseInspectorOptions {
  /** Injectable for deterministic testing; must never terminate a process. */
  processExists?: (pid: number) => LeaseProcessObservation;
}

function probeProcess(pid: number): LeaseProcessObservation {
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return 'not-observed';
    }
    // EPERM, namespace boundaries and other errors are inconclusive.
    return 'unknown';
  }
}

/**
 * Strictly read-only evidence about cooperating local filesystem leases.
 * Never removes locks; a missing PID is NOT evidence of safe recovery.
 */
export class ServiceResourceLeaseInspector {
  private readonly root: string;
  private readonly processExists: (pid: number) => LeaseProcessObservation;

  public constructor(
    stateDirectory: string,
    options: LeaseInspectorOptions = {},
  ) {
    this.root = path.join(stateDirectory, 'service-resource-leases-v1');
    this.processExists = options.processExists ?? probeProcess;
  }

  public inspect(resourceKeys: readonly string[]): ResourceLeaseEvidence[] {
    return [...new Set(resourceKeys)].slice(0, 250).map((resourceKey) => {
      const unknown = (diagnostic: string): ResourceLeaseEvidence => ({
        resourceKey,
        status: 'unverifiable',
        ownerProcess: 'unknown',
        diagnostic,
      });
      if (resourceKey.length < 1 || resourceKey.length > 512) {
        return unknown('Resource identity is invalid for lease inspection.');
      }

      const directory = path.join(
        this.root,
        createHash('sha256').update(resourceKey).digest('hex'),
      );
      try {
        const root = lstatSync(this.root);
        if (!root.isDirectory() || root.isSymbolicLink()) {
          return unknown('Lease root is not a trusted directory.');
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // No root is not proof against another host or lock protocol.
          return {
            resourceKey,
            status: 'absent',
            ownerProcess: 'unknown',
            diagnostic:
              'No local lease root was observed; other executors remain possible.',
          };
        }
        return unknown('Local lease root could not be inspected.');
      }
      try {
        const stat = lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          return unknown('Lease entry is not a trusted directory.');
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return {
            resourceKey,
            status: 'absent',
            ownerProcess: 'unknown',
            diagnostic:
              'No cooperating local lease observed for this resource.',
          };
        }
        return unknown('Lease entry could not be inspected.');
      }

      try {
        const file = path.join(directory, 'owner.json');
        const stat = lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) {
          return unknown('Lease owner metadata is missing or untrusted.');
        }
        const owner: unknown = JSON.parse(readFileSync(file, 'utf8'));
        if (!owner || typeof owner !== 'object' || Array.isArray(owner)) {
          return unknown('Lease owner metadata is invalid.');
        }
        const value = owner as Record<string, unknown>;
        if (
          value.version !== 1 ||
          value.key !== resourceKey ||
          typeof value.holder !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(value.holder) ||
          !Number.isSafeInteger(value.pid) ||
          (value.pid as number) <= 0 ||
          typeof value.acquiredAt !== 'string' ||
          Number.isNaN(Date.parse(value.acquiredAt))
        ) {
          return unknown('Lease owner metadata is incomplete or inconsistent.');
        }
        const ownerProcess = this.processExists(value.pid as number);
        return {
          resourceKey,
          status: 'present',
          ownerProcess,
          diagnostic:
            ownerProcess === 'alive'
              ? 'Lease owner PID exists locally; identity and active mutation are not proven.'
              : ownerProcess === 'not-observed'
                ? 'Lease owner PID was not observed locally; recovery still requires verification.'
                : 'Lease owner process could not be verified.',
        };
      } catch {
        return unknown('Lease owner evidence is unreadable or invalid.');
      }
    });
  }
}
