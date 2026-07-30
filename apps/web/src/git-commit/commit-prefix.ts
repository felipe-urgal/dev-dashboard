export function withCommitPrefix(message: string, type: string): string {
  const trimmed = message.trimStart();
  const knownPrefix = /^(feat|fix|refactor|chore|docs|test)(?:\([^)]*\))?!?:\s*/i;
  if (knownPrefix.test(trimmed)) return trimmed.replace(knownPrefix, `${type}: `);
  return `${type}: ${trimmed}`;
}
