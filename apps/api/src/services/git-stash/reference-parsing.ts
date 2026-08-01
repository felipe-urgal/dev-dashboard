import type { GitStashFile, GitStashSummary } from '@dev-dashboard/contracts';

import { FIELD_SEPARATOR, STASH_REFERENCE_PATTERN } from './constants.js';
import { runGit } from './run.js';
import { parseNameStatus, parseNumstat } from './status-parsing.js';

export interface ParsedStashReference {
  index: number;
  reference: string;
  hash: string;
  subject: string;
  createdAt: string;
}

export function parseSubject(subject: string): { branch: string; message: string } {
  const match = /^(?:WIP on|On) ([^:]+):\s*(.*)$/.exec(subject.trim());
  if (!match) {
    return {
      branch: 'HEAD',
      message: subject.trim() || 'Stash sem mensagem',
    };
  }
  return {
    branch: match[1]?.trim() || 'HEAD',
    message: match[2]?.trim() || 'Stash sem mensagem',
  };
}

export async function parseReferences(projectPath: string): Promise<ParsedStashReference[]> {
  const output = await runGit(projectPath, [
    'stash',
    'list',
    '-n',
    '50',
    `--format=%gd${FIELD_SEPARATOR}%H${FIELD_SEPARATOR}%gs${FIELD_SEPARATOR}%cI`,
  ]);

  return output
    .split('\n')
    .filter(Boolean)
    .flatMap((line): ParsedStashReference[] => {
      const [reference = '', hash = '', subject = '', createdAt = ''] = line.split(FIELD_SEPARATOR);
      const match = STASH_REFERENCE_PATTERN.exec(reference);
      if (!match?.[1]) return [];
      return [{
        index: Number.parseInt(match[1], 10),
        reference,
        hash,
        subject,
        createdAt,
      }];
    });
}

export async function includesUntracked(projectPath: string, reference: string): Promise<boolean> {
  try {
    await runGit(projectPath, ['rev-parse', '--verify', '--quiet', `${reference}^3`]);
    return true;
  } catch {
    return false;
  }
}

export async function filesFor(projectPath: string, reference: string): Promise<GitStashFile[]> {
  const [nameStatus, numstat] = await Promise.all([
    runGit(projectPath, [
      'stash',
      'show',
      '--include-untracked',
      '--name-status',
      '-z',
      reference,
    ]),
    runGit(projectPath, [
      'stash',
      'show',
      '--include-untracked',
      '--numstat',
      '-z',
      reference,
    ]),
  ]);
  return parseNumstat(numstat, parseNameStatus(nameStatus));
}

export async function summaryFor(
  projectPath: string,
  parsed: ParsedStashReference,
): Promise<GitStashSummary> {
  const [files, hasUntracked] = await Promise.all([
    filesFor(projectPath, parsed.reference),
    includesUntracked(projectPath, parsed.reference),
  ]);
  const subject = parseSubject(parsed.subject);
  return {
    index: parsed.index,
    reference: parsed.reference,
    hash: parsed.hash,
    message: subject.message,
    branch: subject.branch,
    createdAt: parsed.createdAt,
    fileCount: files.length,
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
    includesUntracked: hasUntracked,
  };
}
