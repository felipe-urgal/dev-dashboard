import { ApiError } from '../http/api-error.js';

/**
 * Process-local, all-or-nothing lock over physical resource identities.
 *
 * These locks protect cooperating operations in a single API process only.
 * Do not enable multi-process lifecycle execution without a durable lease.
 */
export class ServiceResourceOperationLock {
  private readonly held = new Set<string>();

  public async withResources<T>(
    resourceKeys: readonly string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    const keys = [...new Set(resourceKeys)].sort();
    if (
      keys.length === 0 ||
      keys.length > 250 ||
      keys.some((key) => key.length === 0 || key.length > 512)
    ) {
      throw new ApiError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Invalid resource lock set for lifecycle operation.',
      });
    }
    // Synchronous acquisition means two requests cannot both pass this check.
    if (keys.some((key) => this.held.has(key))) {
      throw new ApiError({
        statusCode: 409,
        code: 'CONFLICT',
        message:
          'A lifecycle operation is already using one of these resources.',
      });
    }
    for (const key of keys) this.held.add(key);
    try {
      return await operation();
    } finally {
      for (const key of keys) this.held.delete(key);
    }
  }
}
