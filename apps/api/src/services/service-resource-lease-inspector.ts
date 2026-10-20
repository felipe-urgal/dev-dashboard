import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  isLinuxProcessIdentity,
  readLinuxProcessIdentity,
  type LinuxProcessIdentity,
} from './linux-process-identity.js';

export type LeaseObservation = 'absent' | 'present' | 'unverifiable';
export type LeaseProcessObservation = 'alive' | 'not-observed' | 'unknown';

export type LeaseProcessIdentityEvidence =
  'verified-same' | 'different' | 'unverifiable';

export interface ResourceLeaseEvidence {
  resourceKey: string;
  status: LeaseObservation;
  ownerProcess: LeaseProcessObservation;
  processIdentity: LeaseProcessIdentityEvidence;
  /** Identifying process existence is not a guarantee that it owns a lease. */
  diagnostic: string;
}

interface LeaseInspectorOptions {
  /** Injectable for deterministic testing; must never terminate a process. */
  processExists?: (pid: number) => LeaseProcessObservation;
  processIdentity?: (pid: number) => LinuxProcessIdentity | null;
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
  private readonly processIdentity: (
    pid: number,
  ) => LinuxProcessIdentity | null;

  public constructor(
    stateDirectory: string,
    options: LeaseInspectorOptions = {},
  ) {
    this.root = path.join(stateDirectory, 'service-resource-leases-v1');
    this.processExists = options.processExists ?? probeProcess;
    this.processIdentity = options.processIdentity ?? readLinuxProcessIdentity;
  }

  public inspect(resourceKeys: readonly string[]): ResourceLeaseEvidence[] {
    return [...new Set(resourceKeys)].slice(0, 250).map((resourceKey) => {
      const unknown = (diagnostic: string): ResourceLeaseEvidence => ({
        resourceKey,
        status: 'unverifiable',
        ownerProcess: 'unknown',
        processIdentity: 'unverifiable',
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
            processIdentity: 'unverifiable',
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
            processIdentity: 'unverifiable',
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
          typeof value.pid !== 'number' ||
          !Number.isSafeInteger(value.pid) ||
          (value.pid as number) <= 0 ||
          typeof value.acquiredAt !== 'string' ||
          Number.isNaN(Date.parse(value.acquiredAt))
        ) {
          return unknown('Lease owner metadata is incomplete or inconsistent.');
        }
        const ownerProcess = this.processExists(value.pid as number);
        // Legacy owners have no boot/starttime marker. Treat them as unknown.
        let processIdentity: LeaseProcessIdentityEvidence = 'unverifiable';
        if (
          ownerProcess === 'alive' &&
          isLinuxProcessIdentity(value.processIdentity)
        ) {
          const current = this.processIdentity(value.pid as number);
          if (current && isLinuxProcessIdentity(current)) {
            processIdentity =
              current.bootId === value.processIdentity.bootId &&
              current.startTicks === value.processIdentity.startTicks
                ? 'verified-same'
                : 'different';
          }
        }
        return {
          resourceKey,
          status: 'present',
          ownerProcess,
          processIdentity,
          diagnostic:
            processIdentity === 'verified-same'
              ? 'Original process identity matches; active mutation remains unproven.'
              : processIdentity === 'different'
                ? 'PID now identifies a different Linux process or boot; recovery still requires fencing.'
                : 'Original process identity cannot be verified; recovery remains blocked.',
        };
      } catch {
        return unknown('Lease owner evidence is unreadable or invalid.');
      }
    });
  }
}
