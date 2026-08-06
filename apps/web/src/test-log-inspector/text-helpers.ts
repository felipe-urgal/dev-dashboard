import { ANSI_PATTERN } from './constants';

export function cleanLines(value: string): string[] {
  return value
    .replace(ANSI_PATTERN, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
}

export function compact(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

export function isErrorText(value: string): boolean {
  if (/\b0\s+(?:failed|failures|errors)\b/i.test(value)) return false;
  return /\b(?:error|failed|failure|syntaxerror|exception|unexpected|undefined method|cannot|enoent)\b/i.test(
    value,
  );
}

export function isWarningText(value: string): boolean {
  return /\b(?:warning|warn|deprecated|deprecation)\b/i.test(value);
}
