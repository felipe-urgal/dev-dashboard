import { readFileSync } from 'node:fs';

export interface LinuxProcessIdentity {
  /** Kernel boot identity: PID/starttime alone may repeat after a reboot. */
  bootId: string;
  /** /proc/<pid>/stat field 22, measured in kernel clock ticks. */
  startTicks: string;
}

const BOOT_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const START_TICKS = /^\d{1,24}$/;

/**
 * A Linux task's comm field is enclosed in parentheses and can include
 * whitespace and ')' characters. Parse from the final ') ' boundary, never
 * split the entire /proc/<pid>/stat by whitespace.
 */
export function parseLinuxProcessStartTicks(contents: string): string | null {
  const close = contents.lastIndexOf(') ');
  if (
    close < 2 ||
    contents[close - 1] === undefined ||
    contents[contents.indexOf('(')] !== '('
  )
    return null;
  const pidText = contents.slice(0, contents.indexOf('(')).trim();
  if (!/^[1-9]\d*$/.test(pidText)) return null;
  // Suffix starts at field 3 (state); field 22 is index 19 here.
  const suffix = contents
    .slice(close + 2)
    .trim()
    .split(/\s+/);
  const startTicks = suffix[19];
  return startTicks && START_TICKS.test(startTicks) ? startTicks : null;
}

/**
 * Read-only, best-effort local Linux process fingerprint. Failure is never
 * interpreted as proof that the process has exited. No process signals here.
 */
export function readLinuxProcessIdentity(
  pid: number,
): LinuxProcessIdentity | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    const bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8')
      .trim()
      .toLowerCase();
    if (!BOOT_ID.test(bootId)) return null;
    const stat = readFileSync('/proc/' + pid + '/stat', 'utf8');
    const fieldsPid = stat.slice(0, stat.indexOf('(')).trim();
    if (Number(fieldsPid) !== pid) return null;
    const startTicks = parseLinuxProcessStartTicks(stat);
    if (!startTicks) return null;
    return { bootId, startTicks };
  } catch {
    return null;
  }
}

export function isLinuxProcessIdentity(
  value: unknown,
): value is LinuxProcessIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const identity = value as Partial<LinuxProcessIdentity>;
  return (
    typeof identity.bootId === 'string' &&
    BOOT_ID.test(identity.bootId) &&
    typeof identity.startTicks === 'string' &&
    START_TICKS.test(identity.startTicks)
  );
}
