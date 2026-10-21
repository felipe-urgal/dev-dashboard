/**
 * Shared metadata-only systemd user-unit identity for lifecycle audit,
 * recovery and the durable journal. This is not execution authorization.
 */
const CANONICAL_USER_UNIT =
  /^systemd:user:[A-Za-z0-9][A-Za-z0-9_.@:-]{0,190}\.service$/;

export function isSystemdUserUnit(ref: string): boolean {
  return (
    CANONICAL_USER_UNIT.test(ref) &&
    !ref.includes('..') &&
    !ref.includes('@.service') &&
    !/^systemd:user:dev-dashboard(?:[.@-]|\.service)/i.test(ref)
  );
}

export function isSystemdUserJob(refs: readonly string[]): boolean {
  return refs.some((ref) => ref.startsWith('systemd:user:'));
}

/** The adapter and this read-only recovery view must use identical keys. */
export function systemdUserPhysicalLeaseKey(ref: string): string | null {
  return isSystemdUserUnit(ref) ? ref : null;
}

/** Both physical and logical keys are owned atomically by the user-unit adapter. */
export function systemdUserOwnerLeaseKeys(ref: string): string[] | null {
  return isSystemdUserUnit(ref) ? ['resource:' + ref, ref] : null;
}
