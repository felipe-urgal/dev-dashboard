import { execFile } from 'node:child_process';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

import type { HostServiceScope } from '@dev-dashboard/contracts';

const UNIT_NAME = /^[A-Za-z0-9_.@:-]{1,200}\.service$/;
const MAX_CONTENT_BYTES = 65_536;
const MAX_BUFFER_BYTES = 256 * 1024;
const TIMEOUT_MS = 3_000;
const MAX_LINES = 200;

export interface JournalRead {
  status: 'available' | 'empty' | 'unavailable' | 'unsupported';
  content?: string;
  masked: boolean;
  truncated: boolean;
  diagnostic?: string;
}

type Runner = (scope: HostServiceScope, unit: string) => Promise<string>;

function runJournal(scope: HostServiceScope, unit: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'journalctl',
      [
        ...(scope === 'user' ? ['--user'] : []),
        '--unit',
        unit,
        '--no-pager',
        '--output=short-iso',
        '--lines',
        String(MAX_LINES),
        '--since=-1 hour',
      ],
      {
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER_BYTES,
        windowsHide: true,
        env: { ...process.env, LC_ALL: 'C' },
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

function limitedUtf8(value: string): { content: string; truncated: boolean } {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= MAX_CONTENT_BYTES)
    return { content: value, truncated: false };
  // Cut at a UTF-8 boundary and preserve the newest lines. No raw output is stored.
  const slice = buffer
    .subarray(buffer.length - MAX_CONTENT_BYTES)
    .toString('utf8');
  return { content: slice.replace(/^\uFFFD+/, ''), truncated: true };
}

/** Accept only server-resolved unit identity; no shell, paths or caller-supplied CLI. */
export class SystemdJournalReader {
  public constructor(
    private readonly options: {
      platform?: NodeJS.Platform;
      runner?: Runner;
    } = {},
  ) {}

  public async read(
    scope: HostServiceScope,
    unit: string,
  ): Promise<JournalRead> {
    if (!UNIT_NAME.test(unit))
      return {
        status: 'unsupported',
        masked: false,
        truncated: false,
        diagnostic: 'Unit identity is not a supported service unit.',
      };
    if ((this.options.platform ?? process.platform) !== 'linux')
      return {
        status: 'unsupported',
        masked: false,
        truncated: false,
        diagnostic: 'Journal reading is available on Linux only.',
      };

    let raw: string;
    try {
      raw = await (this.options.runner ?? runJournal)(scope, unit);
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
      const reason =
        code === 'EACCES' || code === 'EPERM'
          ? 'Journal indisponível por permissão; nenhuma elevação é executada.'
          : 'Journal indisponível ou inacessível para a sessão atual.';
      return {
        status: 'unavailable',
        masked: false,
        truncated: false,
        diagnostic: reason,
      };
    }
    // journalctl may exit successfully with a permission warning; never call it empty.
    if (
      /no journal files were opened due to insufficient permissions|permission denied/i.test(
        raw,
      )
    ) {
      return {
        status: 'unavailable',
        masked: false,
        truncated: false,
        diagnostic:
          'Journal indisponível por permissão; nenhuma elevação é executada.',
      };
    }
    // Keep the assignment/URL context intact for redaction; cutting the
    // raw tail first could expose an unrecognizable secret suffix.
    const masked = maskSensitiveLogContent(raw);
    const bounded = limitedUtf8(masked.content);
    return {
      status: bounded.content.trim() ? 'available' : 'empty',
      content: bounded.content,
      masked: masked.masked,
      truncated: bounded.truncated,
    };
  }
}
