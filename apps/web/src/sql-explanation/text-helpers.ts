export function cleanIdentifier(value: string | undefined): string | undefined {
  if (!value) return undefined;

  return value
    .trim()
    .replace(/^[`"']+|[`"']+$/g, '')
    .split('.')
    .map((part) => part.replace(/^[`"']+|[`"']+$/g, ''))
    .join('.');
}

export function code(value: string): string {
  return `\`${value}\``;
}

export function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
