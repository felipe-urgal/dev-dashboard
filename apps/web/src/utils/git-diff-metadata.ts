const REDUNDANT_FILE_HEADER_PATTERNS = [
  /^diff --git /,
  /^index\s+[0-9a-f]+\.\.[0-9a-f]+(?:\s+\d+)?$/i,
  /^---\s+(?:"?a\/|\/dev\/null(?:\s|$))/,
  /^\+\+\+\s+(?:"?b\/|\/dev\/null(?:\s|$))/,
] as const;

export function isRedundantGitDiffHeaderLine(line: string): boolean {
  return REDUNDANT_FILE_HEADER_PATTERNS.some((pattern) => pattern.test(line));
}
