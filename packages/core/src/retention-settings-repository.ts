import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type {
  RetentionSettings,
  RetentionSettingsLimits,
  RetentionSettingsSnapshot,
} from '@dev-dashboard/contracts';

import { resolveConfigDirectory } from './config-directory.js';

export const RETENTION_SETTINGS_LIMITS: RetentionSettingsLimits = {
  retentionDays: { minimum: 1, maximum: 365, default: 7 },
  scriptHistoryLimit: { minimum: 10, maximum: 1000, default: 200 },
  testHistoryLimit: { minimum: 10, maximum: 500, default: 50 },
};

function defaultValues(): RetentionSettings {
  const environmentValue = (
    name: string,
    key: keyof RetentionSettings,
  ): number => {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    return isValidValue(parsed, key)
      ? parsed
      : RETENTION_SETTINGS_LIMITS[key].default;
  };
  return {
    retentionDays: environmentValue(
      'DEV_DASHBOARD_LOG_RETENTION_DAYS',
      'retentionDays',
    ),
    scriptHistoryLimit: environmentValue(
      'DEV_DASHBOARD_SCRIPT_HISTORY_LIMIT',
      'scriptHistoryLimit',
    ),
    testHistoryLimit: environmentValue(
      'DEV_DASHBOARD_TEST_HISTORY_LIMIT',
      'testHistoryLimit',
    ),
  };
}

function isValidValue(
  value: unknown,
  key: keyof RetentionSettings,
): value is number {
  const limit = RETENTION_SETTINGS_LIMITS[key];
  return (
    Number.isInteger(value) &&
    (value as number) >= limit.minimum &&
    (value as number) <= limit.maximum
  );
}

function parse(contents: string): RetentionSettings {
  const candidate: unknown = JSON.parse(contents);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
    throw new Error('A configuração de retenção possui formato inválido.');
  const record = candidate as Record<string, unknown>;
  if (
    record.version !== 1 ||
    !isValidValue(record.retentionDays, 'retentionDays') ||
    !isValidValue(record.scriptHistoryLimit, 'scriptHistoryLimit') ||
    !isValidValue(record.testHistoryLimit, 'testHistoryLimit')
  ) {
    throw new Error('A configuração de retenção possui valores inválidos.');
  }
  return {
    retentionDays: record.retentionDays,
    scriptHistoryLimit: record.scriptHistoryLimit,
    testHistoryLimit: record.testHistoryLimit,
  };
}

export class RetentionSettingsRepository {
  private readonly directory: string;
  private readonly file: string;
  private values: RetentionSettings;

  public constructor(directory = resolveConfigDirectory()) {
    this.directory = directory;
    this.file = path.join(directory, 'retention.json');
    try {
      this.values = parse(readFileSync(this.file, 'utf8'));
    } catch {
      this.values = defaultValues();
    }
    this.applyToEnvironment();
  }

  public snapshot(): RetentionSettingsSnapshot {
    return {
      values: { ...this.values },
      limits: RETENTION_SETTINGS_LIMITS,
      appliesAfterRestart: false,
    };
  }

  public async update(
    values: RetentionSettings,
  ): Promise<RetentionSettingsSnapshot> {
    for (const key of Object.keys(values) as (keyof RetentionSettings)[]) {
      if (!isValidValue(values[key], key))
        throw new Error(`O valor de ${key} está fora dos limites permitidos.`);
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify({ version: 1, ...values }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    await rename(temporary, this.file);
    this.values = { ...values };
    return { ...this.snapshot(), appliesAfterRestart: true };
  }

  public async reload(): Promise<void> {
    this.values = parse(await readFile(this.file, 'utf8'));
  }

  private applyToEnvironment(): void {
    process.env.DEV_DASHBOARD_LOG_RETENTION_DAYS = String(
      this.values.retentionDays,
    );
    process.env.DEV_DASHBOARD_SCRIPT_HISTORY_LIMIT = String(
      this.values.scriptHistoryLimit,
    );
    process.env.DEV_DASHBOARD_TEST_HISTORY_LIMIT = String(
      this.values.testHistoryLimit,
    );
  }
}
