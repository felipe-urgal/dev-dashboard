export function findTab(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.git-subtabs button'))
    .find((button) => button.textContent?.trim() === label);
}
