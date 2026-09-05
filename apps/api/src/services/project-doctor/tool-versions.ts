import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import { readLimitedText } from './file-utils.js';

export interface ToolVersionDeclaration {
  tool: string;
  value: string;
  source: '.tool-versions';
}

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function parseToolVersions(content: string): ToolVersionDeclaration[] {
  const declarations: ToolVersionDeclaration[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const commentIndex = line.indexOf(' #');
    const withoutComment = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
    const [tool, value, ...extra] = withoutComment.trim().split(/\s+/);
    if (!tool || !value || extra.length > 0 || !TOOL_NAME_PATTERN.test(tool)) {
      continue;
    }
    declarations.push({
      tool: tool.toLowerCase(),
      value,
      source: '.tool-versions',
    });
  }

  return declarations;
}

export async function readToolVersions(
  project: Project,
): Promise<ToolVersionDeclaration[]> {
  const content = await readLimitedText(path.join(project.path, '.tool-versions'));
  return content ? parseToolVersions(content) : [];
}

export async function readToolVersion(
  project: Project,
  aliases: readonly string[],
): Promise<ToolVersionDeclaration | undefined> {
  const declarations = await readToolVersions(project);
  const normalizedAliases = new Set(aliases.map((alias) => alias.toLowerCase()));
  return declarations.find((entry) => normalizedAliases.has(entry.tool));
}
