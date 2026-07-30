import { originalTextAttribute } from './constants';

export function text(element: Element): string {
  return element.textContent?.trim() ?? '';
}

export function rememberOriginalText(element: HTMLElement, value = text(element)): string {
  const remembered = element.dataset[originalTextAttribute];
  if (remembered !== undefined) return remembered;

  element.dataset[originalTextAttribute] = value;
  return value;
}
