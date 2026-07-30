export function historySection(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.git-history-page');
}

export function control<T extends HTMLInputElement | HTMLSelectElement>(
  section: HTMLElement,
  name: string,
): T | null {
  return section.querySelector<T>(`[data-history-control="${name}"]`);
}
