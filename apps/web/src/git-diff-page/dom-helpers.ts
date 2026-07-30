export function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function isLegacyDiffSection(section: HTMLElement): boolean {
  if (!section.matches('.git-tab-page')) return false;
  const heading = section.querySelector('h2');
  return heading?.textContent?.trim() === 'Diferenças por arquivo';
}
