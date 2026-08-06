export const LOG_LIMIT = 262_144;
export const CONFIRMATION_TTL_MS = 60_000;
export const HISTORY_VERSION = 1;
export const DEFAULT_HISTORY_LIMIT = 200;
export const DEFAULT_RETENTION_DAYS = 7;
export const MAX_RETENTION_SWEEP_INTERVAL_MS = 3_600_000;
export const EXECUTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_EXECUTION_SUBSCRIBERS = 5;
export const MAX_TOTAL_SUBSCRIBERS = 20;
export const EVENT_THROTTLE_MS = 200;
