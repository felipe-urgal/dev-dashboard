import { SEARCH_INPUT_SELECTOR } from './constants';

export function searchQuery(): string {
  return document.querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR)?.value.trim() ?? '';
}

export function originalText(line: HTMLElement): string {
  return line.dataset.logOriginalText ?? line.textContent?.trim() ?? '';
}

export function appendHighlightedText(
  parent: HTMLElement,
  value: string,
  query: string,
  className?: string,
): HTMLElement {
  const target = className ? document.createElement('span') : parent;
  if (className) target.className = className;

  if (!query) {
    target.append(document.createTextNode(value));
  } else {
    const lowerValue = value.toLocaleLowerCase();
    const lowerQuery = query.toLocaleLowerCase();
    let cursor = 0;
    let index = lowerValue.indexOf(lowerQuery);

    while (index >= 0) {
      if (index > cursor) {
        target.append(document.createTextNode(value.slice(cursor, index)));
      }

      const mark = document.createElement('mark');
      mark.className = 'log-search-highlight';
      mark.textContent = value.slice(index, index + query.length);
      target.append(mark);

      cursor = index + query.length;
      index = lowerValue.indexOf(lowerQuery, cursor);
    }

    if (cursor < value.length) {
      target.append(document.createTextNode(value.slice(cursor)));
    }
  }

  if (target !== parent) parent.append(target);
  return target;
}
