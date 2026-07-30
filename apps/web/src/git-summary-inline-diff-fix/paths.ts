export function filePaths(row: HTMLElement): { path: string; previousPath: string } | null {
  const text = row.querySelector('code')?.textContent?.trim() ?? '';
  if (!text) return null;
  const parts = text.split(' → ').map((part) => part.trim()).filter(Boolean);
  return {
    path: parts.at(-1) ?? text,
    previousPath: parts.length > 1 ? parts[0] ?? '' : '',
  };
}
