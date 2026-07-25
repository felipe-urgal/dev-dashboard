import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Project, ProjectScript, ProjectScriptCatalog, ProjectScriptOrigin, ProjectScriptRisk } from '@dev-dashboard/contracts';

interface Manifest { scripts?: Record<string, unknown> }
export interface CatalogOptions { page?: number; pageSize?: number; search?: string; origin?: ProjectScriptOrigin; risk?: ProjectScriptRisk }

const DESTRUCTIVE_PATTERN = /(^|[:_-])(drop|reset|destroy|delete|clean|truncate|purge)([:_-]|$)/i;
const READ_ONLY_PATTERN = /(^|[:_-])(check|lint|test|spec|typecheck|audit|status|list|routes)([:_-]|$)/i;
const KNOWN_BINS = ['rails', 'rake', 'rspec', 'rubocop', 'setup'] as const;

function classify(name: string): ProjectScriptRisk {
  if (DESTRUCTIVE_PATTERN.test(name)) return 'destructive';
  if (READ_ONLY_PATTERN.test(name)) return 'read-only';
  return 'mutable';
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

async function nodeScripts(project: Project): Promise<ProjectScript[]> {
  let manifest: Manifest;
  try { manifest = JSON.parse(await readFile(path.join(project.path, 'package.json'), 'utf8')) as Manifest; } catch { return []; }
  if (!manifest.scripts || typeof manifest.scripts !== 'object') return [];
  return Object.entries(manifest.scripts).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([name]) => {
    const risk = classify(name);
    return { id: `package-script:${name}`, name, description: `Script declarado em scripts.${name} no package.json.`, command: `npm run ${name}`, origin: 'package-script', risk, enabled: risk !== 'destructive' };
  });
}

async function knownBins(project: Project): Promise<ProjectScript[]> {
  const items: ProjectScript[] = [];
  for (const name of KNOWN_BINS) {
    if (!(await exists(path.join(project.path, 'bin', name)))) continue;
    const risk = classify(name);
    items.push({ id: `bin:${name}`, name: `bin/${name}`, description: 'Executável conhecido localizado no diretório bin/.', command: `bin/${name}`, origin: 'bin', risk, enabled: risk !== 'destructive' });
  }
  return items;
}

function listRailsTasks(projectPath: string): Promise<string> {
  return new Promise((resolve) => {
    const detached = process.platform !== 'win32';
    const child = spawn(path.join(projectPath, 'bin', 'rails'), ['-T'], { cwd: projectPath, detached, shell: false, env: { ...process.env, RAILS_ENV: 'development' }, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    const timer = setTimeout(() => {
      if (detached && child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL');
          return;
        } catch {
          // O processo pode ter encerrado entre o timeout e o envio do sinal.
        }
      }
      child.kill('SIGKILL');
    }, 5_000);
    child.stdout.on('data', (chunk: Buffer) => { if (output.length < 262_144) output += chunk.toString('utf8'); });
    child.on('error', () => { clearTimeout(timer); resolve(''); });
    child.on('close', () => { clearTimeout(timer); resolve(output); });
  });
}

async function railsTasks(project: Project): Promise<ProjectScript[]> {
  if (project.type !== 'rails' || !(await exists(path.join(project.path, 'bin', 'rails')))) return [];
  return (await listRailsTasks(project.path)).split('\n').flatMap((line): ProjectScript[] => {
    const match = /^rails\s+([^\s#]+)\s*(?:#\s*(.*))?$/.exec(line.trim());
    if (!match?.[1]) return [];
    const name = match[1]; const risk = classify(name);
    return [{ id: `rails-task:${name}`, name, description: match[2]?.trim() || 'Tarefa pública do Rails.', command: `bin/rails ${name}`, origin: 'rails-task', risk, enabled: risk !== 'destructive' }];
  });
}

export class ScriptDetectionService {
  public async findAction(project: Project, actionId: string): Promise<ProjectScript | undefined> {
    const catalog = await this.getCatalog(project, { page: 1, pageSize: 100 });
    return catalog.items.find((item) => item.id === actionId);
  }
  public async getCatalog(project: Project, options: CatalogOptions = {}): Promise<ProjectScriptCatalog> {
    const page = options.page ?? 1; const pageSize = options.pageSize ?? 20;
    const search = options.search?.trim().toLocaleLowerCase('pt-BR') ?? '';
    const detected = [...await nodeScripts(project), ...await railsTasks(project), ...await knownBins(project)];
    const unique = [...new Map(detected.map((item) => [item.id, item])).values()].filter((item) => !options.origin || item.origin === options.origin).filter((item) => !options.risk || item.risk === options.risk).filter((item) => !search || `${item.name} ${item.description} ${item.command}`.toLocaleLowerCase('pt-BR').includes(search)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const total = unique.length;
    return { items: unique.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
  }
}
