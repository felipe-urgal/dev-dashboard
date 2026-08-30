type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type VersionedStorageEnvelope = {
  version: number;
  value: unknown;
};

type VersionedLocalStorageOptions<T> = {
  key: string;
  version: number;
  fallback: () => T;
  sanitize: (value: unknown) => T | null;
  migrate?: (value: unknown, fromVersion: number) => unknown;
  storage?: StorageLike;
};

export type VersionedLocalStorage<T> = {
  read: () => T;
  write: (value: T) => boolean;
};

function isEnvelope(value: unknown): value is VersionedStorageEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as VersionedStorageEnvelope).version === 'number' &&
    'value' in value
  );
}

export function createVersionedLocalStorage<T>(
  options: VersionedLocalStorageOptions<T>,
): VersionedLocalStorage<T> {
  const storage = options.storage ?? localStorage;

  function write(value: T): boolean {
    try {
      storage.setItem(
        options.key,
        JSON.stringify({ version: options.version, value }),
      );
      return true;
    } catch {
      return false;
    }
  }

  function read(): T {
    let raw: string | null;
    try {
      raw = storage.getItem(options.key);
    } catch {
      return options.fallback();
    }
    if (!raw) return options.fallback();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return options.fallback();
    }

    const envelope = isEnvelope(parsed) ? parsed : null;
    const fromVersion = envelope?.version ?? 0;
    if (fromVersion > options.version) return options.fallback();

    let candidate = envelope?.value ?? parsed;
    if (fromVersion !== options.version) {
      if (!options.migrate) return options.fallback();
      try {
        candidate = options.migrate(candidate, fromVersion);
      } catch {
        return options.fallback();
      }
    }

    const value = options.sanitize(candidate);
    if (value === null) return options.fallback();

    if (fromVersion !== options.version) write(value);
    return value;
  }

  return { read, write };
}
