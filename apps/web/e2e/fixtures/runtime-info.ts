import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_INFO_FILE = path.join(HERE, '../.runtime/server-info.json');

export interface RuntimeInfo {
  baseUrl: string;
  bootstrapToken: string;
  workspaceDirectory: string;
}

export async function writeRuntimeInfo(info: RuntimeInfo): Promise<void> {
  await mkdir(path.dirname(RUNTIME_INFO_FILE), { recursive: true });
  await writeFile(RUNTIME_INFO_FILE, JSON.stringify(info));
}

export async function readRuntimeInfo(): Promise<RuntimeInfo> {
  const contents = await readFile(RUNTIME_INFO_FILE, 'utf8');
  return JSON.parse(contents) as RuntimeInfo;
}

export function bootstrapPath(info: RuntimeInfo, hashPath = ''): string {
  return `/${hashPath}#bootstrap=${info.bootstrapToken}`;
}
