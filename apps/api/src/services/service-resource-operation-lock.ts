import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ApiError } from '../http/api-error.js';
import { readLinuxProcessIdentity } from './linux-process-identity.js';

type ResourceLockOptions = {
  /** Optional shared LOCAL filesystem state root, owned by the API user. */
  stateDirectory?: string;
};

type AcquiredLease = {
  key: string;
  directory: string;
  metadataWritten: boolean;
};

/**
 * A cooperative ownership check. Must be performed by the lifecycle owner
 * immediately before it dispatches a provider mutation. This is NOT a
 * distributed fencing token and cannot stop an already-running command.
 */
export interface ServiceResourceLeaseGuard {
  assertOwned(): Promise<void>;
}

function conflict(message: string): never {
  throw new ApiError({ statusCode: 409, code: 'CONFLICT', message });
}

function leaseName(key: string): string {
  // Hashing avoids traversals, ambiguities and very long filesystem names.
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * All-or-nothing resource locking. With stateDirectory it additionally uses
 * atomic mkdir() operations on a shared *local* filesystem to coordinate
 * multiple processes using the same lock protocol and state directory.
 *
 * It never auto-steals leases. A crashed process leaves an orphaned directory,
 * requiring operator reconciliation before removal. This is intentional:
 * an unknown service mutation must fail closed, not be silently retried.
 *
 * Existing lifecycle owners and other tools do NOT automatically cooperate
 * with this lock. Do not enable HTTP execution before owner integration.
 */
export class ServiceResourceOperationLock {
  private readonly held = new Set<string>();
  private readonly leaseRoot: string | undefined;

  public constructor(options: ResourceLockOptions = {}) {
    this.leaseRoot = options.stateDirectory
      ? path.join(options.stateDirectory, 'service-resource-leases-v1')
      : undefined;
  }

  public async withResources<T>(
    resourceKeys: readonly string[],
    operation: (guard: ServiceResourceLeaseGuard) => Promise<T>,
  ): Promise<T> {
    const keys = [...new Set(resourceKeys)].sort();
    if (
      keys.length === 0 ||
      keys.length > 250 ||
      keys.some((key) => key.length === 0 || key.length > 512)
    ) {
      conflict('Invalid resource lock set for lifecycle operation.');
    }

    // Reserve in-memory synchronously, before the first await.
    if (keys.some((key) => this.held.has(key))) {
      conflict(
        'A lifecycle operation is already using one of these resources.',
      );
    }
    for (const key of keys) this.held.add(key);

    const acquired: AcquiredLease[] = [];
    const holder = randomUUID();
    let released = false;
    // No user-controlled filesystem paths; directories are SHA-256 of keys.
    const guard: ServiceResourceLeaseGuard = {
      assertOwned: async () => {
        if (released || keys.some((key) => !this.held.has(key))) {
          conflict('Lifecycle resource lease is no longer owned by this operation.');
        }
        if (!this.leaseRoot) return;
        if (acquired.length !== keys.length) {
          conflict('Lifecycle resource lease acquisition is incomplete.');
        }
        try {
          const root = await fs.lstat(this.leaseRoot);
          if (!root.isDirectory() || root.isSymbolicLink()) {
            conflict('Lifecycle resource lease root cannot be verified.');
          }
          for (const lease of acquired) {
            const dir = await fs.lstat(lease.directory);
            if (!dir.isDirectory() || dir.isSymbolicLink() ||
              !lease.metadataWritten) {
              conflict('Lifecycle resource lease is no longer valid.');
            }
            const marker = path.join(lease.directory, 'owner.json');
            const metadata = await fs.lstat(marker);
            if (!metadata.isFile() || metadata.isSymbolicLink() ||
              metadata.size > 4096) {
              conflict('Lifecycle resource lease owner cannot be verified.');
            }
            const owner: unknown = JSON.parse(await fs.readFile(marker, 'utf8'));
            if (!owner || typeof owner !== 'object' ||
              (owner as {holder?: unknown}).holder !== holder ||
              (owner as {key?: unknown}).key !== lease.key) {
              conflict('Lifecycle resource lease ownership has changed.');
            }
          }
        } catch {
          // Disclose no local paths or contents; never assume a missing marker
          // means it is safe to dispatch a new provider command.
          conflict('Lifecycle resource lease ownership cannot be verified.');
        }
      },
    };
    let releaseFailure = false;
    try {
      if (this.leaseRoot) {
        await fs.mkdir(this.leaseRoot, { recursive: true, mode: 0o700 });
        const root = await fs.lstat(this.leaseRoot);
        if (!root.isDirectory() || root.isSymbolicLink()) {
          conflict('Resource lease store is not a valid directory.');
        }

        for (const key of keys) {
          const directory = path.join(this.leaseRoot, leaseName(key));
          try {
            // Atomic across cooperating local processes. No waits or stale
            // reaping: a crash cannot accidentally grant a second mutation.
            await fs.mkdir(directory, { mode: 0o700 });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
              conflict(
                'A lifecycle operation is already using one of these resources.',
              );
            }
            conflict('Resource lease store is unavailable.');
          }
          const lease: AcquiredLease = {
            key,
            directory,
            metadataWritten: false,
          };
          acquired.push(lease);
          try {
            await fs.writeFile(
              path.join(directory, 'owner.json'),
              JSON.stringify({
                version: 1,
                key,
                holder,
                pid: process.pid,
                // Missing procfs evidence remains unknown, never inferred.
                processIdentity: readLinuxProcessIdentity(process.pid),
                acquiredAt: new Date().toISOString(),
              }),
              { flag: 'wx', mode: 0o600 },
            );
            lease.metadataWritten = true;
          } catch {
            conflict('Unable to record lifecycle lease owner.');
          }
        }
      }

      await guard.assertOwned();
      return await operation(guard);
    } finally {
      released = true;
      // Best-effort cleanup of *every* acquired key, even when one cleanup
      // fails. Never force-remove a directory owned by an unknown process.
      for (const lease of acquired.reverse()) {
        try {
          const marker = path.join(lease.directory, 'owner.json');
          if (lease.metadataWritten) {
            const owner: unknown = JSON.parse(
              await fs.readFile(marker, 'utf8'),
            );
            if (
              !owner ||
              typeof owner !== 'object' ||
              (owner as { holder?: unknown }).holder !== holder
            ) {
              releaseFailure = true;
              continue;
            }
            await fs.unlink(marker);
          }
          await fs.rmdir(lease.directory);
        } catch {
          releaseFailure = true;
        }
      }
      for (const key of keys) this.held.delete(key);
      if (releaseFailure) {
        conflict(
          'Resource lease could not be released; manual recovery required.',
        );
      }
    }
  }
}
