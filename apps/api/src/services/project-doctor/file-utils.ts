import { constants as fsConstants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';

const MAX_TEXT_FILE_BYTES = 256 * 1024;

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function directoryExists(directoryPath: string): Promise<boolean> {
  try {
    return (await stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}

export async function readableDirectoryExists(
  directoryPath: string,
): Promise<boolean> {
  try {
    await access(directoryPath, fsConstants.R_OK);
    return (await stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}

export async function readLimitedText(
  filePath: string,
): Promise<string | null> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size > MAX_TEXT_FILE_BYTES) return null;
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function parseEnvironmentVariableNames(content: string): Set<string> {
  const names = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match?.[1]) names.add(match[1]);
  }

  return names;
}

export function formatVariableNames(names: readonly string[]): string {
  const visible = names.slice(0, 8);
  const suffix =
    names.length > visible.length
      ? ` e mais ${names.length - visible.length}`
      : '';
  return `${visible.join(', ')}${suffix}`;
}
