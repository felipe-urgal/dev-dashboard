import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { ProjectScriptVariable } from '@dev-dashboard/contracts';

const MAX_RAKE_FILES = 200;
const MAX_RAKE_FILE_BYTES = 262_144;
const VARIABLE_NAME_PATTERN = '[A-Z][A-Z0-9_]{0,63}';

export interface InspectedRakeTask {
  name: string;
  description?: string;
  variables: ProjectScriptVariable[];
  hasUnsupportedVariables: boolean;
}

interface NamespaceFrame {
  indent: number;
  name: string;
}

function indentation(line: string): number {
  return line.match(/^[\t ]*/)?.[0].replaceAll('\t', '  ').length ?? 0;
}

function taskName(line: string): string | undefined {
  const match = /^\s*task\s+(?::([\w!?-]+)|["']([^"']+)["']|([\w!?-]+):).*\bdo\b/.exec(line);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function namespaceName(line: string): string | undefined {
  const match = /^\s*namespace\s+(?::([\w-]+)|["']([^"']+)["'])\s+do\b/.exec(line);
  return match?.[1] ?? match?.[2];
}

function description(line: string): string | undefined {
  return /^\s*desc\s+["']([^"']+)["']\s*$/.exec(line)?.[1]?.trim();
}

function rubyDefault(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  const quoted = /^(?:"([^"]*)"|'([^']*)')$/.exec(normalized);
  const parsed = quoted ? quoted[1] ?? quoted[2] : normalized;
  return parsed && parsed.length <= 120 ? parsed : undefined;
}

function placeholderFor(body: string, variableName: string): string | undefined {
  const match = new RegExp(`\\b${variableName}=([^\\s'"\\)]+)`).exec(body);
  return match?.[1]?.slice(0, 160);
}

function variableRequired(body: string, name: string, localNames: string[], fetchWithoutDefault: boolean): boolean {
  if (fetchWithoutDefault) return true;
  const targets = [
    ...localNames.map((local) => local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `ENV\\[\\s*['"]${name}['"]\\s*\\]`,
  ];
  return targets.some((target) => new RegExp(
    `(?:raise|abort)[^\\n]*(?:if\\s+${target}\\.(?:blank\\?|nil\\?)|unless\\s+${target}\\.present\\?)`,
  ).test(body));
}

function inspectVariables(body: string): {
  variables: ProjectScriptVariable[];
  hasUnsupportedVariables: boolean;
} {
  const candidates = new Map<string, { index: number; defaultValue?: string; fetchWithoutDefault: boolean }>();
  const accessPattern = new RegExp(`ENV\\[\\s*(['"])(${VARIABLE_NAME_PATTERN})\\1\\s*\\]`, 'g');
  const fetchPattern = new RegExp(`ENV\\.fetch\\(\\s*(['"])(${VARIABLE_NAME_PATTERN})\\1(?:\\s*,\\s*([^\\)\\n]+))?\\s*\\)`, 'g');

  for (const match of body.matchAll(accessPattern)) {
    const name = match[2]!;
    if (!candidates.has(name)) candidates.set(name, { index: match.index, fetchWithoutDefault: false });
  }
  for (const match of body.matchAll(fetchPattern)) {
    const name = match[2]!;
    const defaultValue = rubyDefault(match[3]);
    const current = candidates.get(name);
    candidates.set(name, {
      index: Math.min(current?.index ?? match.index, match.index),
      ...(defaultValue !== undefined ? { defaultValue } : current?.defaultValue !== undefined ? { defaultValue: current.defaultValue } : {}),
      fetchWithoutDefault: current?.fetchWithoutDefault === true || match[3] === undefined,
    });
  }

  const variables = [...candidates.entries()]
    .sort((left, right) => left[1].index - right[1].index)
    .map(([name, candidate]) => {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const assignments = [...body.matchAll(new RegExp(
        `\\b([a-z_][a-zA-Z0-9_]*)\\s*=\\s*(?:ENV\\[\\s*['"]${escapedName}['"]\\s*\\]|ENV\\.fetch\\(\\s*['"]${escapedName}['"])`,
        'g',
      ))].map((match) => match[1]!).filter(Boolean);
      const required = candidate.defaultValue === undefined
        && variableRequired(body, name, assignments, candidate.fetchWithoutDefault);
      const placeholder = placeholderFor(body, name);
      return {
        name,
        required,
        ...(candidate.defaultValue !== undefined ? { defaultValue: candidate.defaultValue } : {}),
        ...(placeholder ? { placeholder } : {}),
      };
    });
  return {
    variables,
    hasUnsupportedVariables:
      /ENV\[(?!\s*['"])/.test(body)
      || /ENV\.fetch\b(?!\s*\()/.test(body)
      || /ENV\.fetch\((?!\s*['"])/.test(body),
  };
}

function inspectSource(source: string): InspectedRakeTask[] {
  const lines = source.split(/\r?\n/);
  const namespaces: NamespaceFrame[] = [];
  const tasks: InspectedRakeTask[] = [];
  let pendingDescription: { indent: number; text: string } | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = indentation(line);
    while (namespaces.length && indent <= namespaces.at(-1)!.indent) namespaces.pop();

    const namespace = namespaceName(line);
    if (namespace) {
      namespaces.push({ indent, name: namespace });
      pendingDescription = undefined;
      continue;
    }
    const desc = description(line);
    if (desc) {
      pendingDescription = { indent, text: desc };
      continue;
    }
    const localName = taskName(line);
    if (!localName) {
      if (trimmed !== 'end') pendingDescription = undefined;
      continue;
    }

    let closingIndex = index + 1;
    for (; closingIndex < lines.length; closingIndex += 1) {
      const candidate = lines[closingIndex]!;
      if (candidate.trim() === 'end' && indentation(candidate) === indent) break;
    }
    if (closingIndex >= lines.length) continue;
    const fullName = localName.includes(':')
      ? localName
      : [...namespaces.map((item) => item.name), localName].join(':');
    const body = lines.slice(index + 1, closingIndex).join('\n');
    const inspectedVariables = inspectVariables(body);
    tasks.push({
      name: fullName,
      ...(pendingDescription?.indent === indent ? { description: pendingDescription.text } : {}),
      ...inspectedVariables,
    });
    pendingDescription = undefined;
    index = closingIndex;
  }
  return tasks;
}

async function rakeFiles(projectPath: string): Promise<string[]> {
  const files: string[] = [];
  const rootRakefile = path.join(projectPath, 'Rakefile');
  try {
    if ((await stat(rootRakefile)).isFile()) files.push(rootRakefile);
  } catch {
    // Rakefile raiz é opcional.
  }
  const tasksRoot = path.join(projectPath, 'lib', 'tasks');
  async function visit(directory: string): Promise<void> {
    if (files.length >= MAX_RAKE_FILES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (files.length >= MAX_RAKE_FILES) break;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && entry.name.endsWith('.rake')) files.push(target);
    }
  }
  await visit(tasksRoot);
  return files;
}

export async function inspectRakeTasks(projectPath: string): Promise<InspectedRakeTask[]> {
  const detected: InspectedRakeTask[] = [];
  for (const file of await rakeFiles(projectPath)) {
    try {
      if ((await stat(file)).size > MAX_RAKE_FILE_BYTES) continue;
      detected.push(...inspectSource(await readFile(file, 'utf8')));
    } catch {
      // Arquivos ilegíveis ou alterados durante a varredura são ignorados.
    }
  }
  return [...new Map(detected.map((task) => [task.name, task])).values()];
}
