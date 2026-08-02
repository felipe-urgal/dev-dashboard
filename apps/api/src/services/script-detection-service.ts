import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Project, ProjectScript, ProjectScriptCatalog, ProjectScriptOrigin, ProjectScriptRisk } from '@dev-dashboard/contracts';
import { inspectRakeTasks } from './rake-task-inspection.js';

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

async function railsTasks(project: Project): Promise<ProjectScript[]> {
  if (project.type !== 'rails' || !(await exists(path.join(project.path, 'bin', 'rails')))) return [];
  return (await inspectRakeTasks(project.path)).filter(
    (task) => !task.hasUnsupportedVariables,
  ).map((task) => {
    const classified = classify(task.name);
    const risk = task.variables.length > 0 && classified !== 'destructive'
      ? 'mutable'
      : classified;
    const variablePreview = task.variables.map((variable) => `${variable.name}=…`).join(' ');
    return {
      id: `rails-task:${task.name}`,
      name: task.name,
      description: task.description || 'Tarefa declarada estaticamente no projeto Rails.',
      command: `bin/rails ${task.name}${variablePreview ? ` ${variablePreview}` : ''}`,
      origin: 'rails-task',
      risk,
      enabled: risk !== 'destructive',
      ...(task.variables.length ? { variables: task.variables } : {}),
    };
  });
}

export class ScriptDetectionService {
  public async findAction(project: Project, actionId: string): Promise<ProjectScript | undefined> {
    const detected = await this.detectActions(project);
    return detected.find((item) => item.id === actionId);
  }

  public async getCatalog(project: Project, options: CatalogOptions = {}): Promise<ProjectScriptCatalog> {
    const page = options.page ?? 1; const pageSize = options.pageSize ?? 20;
    const search = options.search?.trim().toLocaleLowerCase('pt-BR') ?? '';
    const detected = await this.detectActions(project);
    const unique = detected.filter((item) => !options.origin || item.origin === options.origin).filter((item) => !options.risk || item.risk === options.risk).filter((item) => !search || `${item.name} ${item.description} ${item.command}`.toLocaleLowerCase('pt-BR').includes(search));
    const total = unique.length;
    return { items: unique.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
  }

  private async detectActions(project: Project): Promise<ProjectScript[]> {
    const detected = [...await nodeScripts(project), ...await railsTasks(project), ...await knownBins(project)];
    return [...new Map(detected.map((item) => [item.id, item])).values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
}
